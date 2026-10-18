'use strict';
(() => {
  function SheetManager(bpmnjs, canvas, commandStack, elementFactory, bpmnFactory, modeling, eventBus, elementRegistry, bpmnReplace, selection) {
    let importing = true, previousRoot, back = [], goingBack = false;
    const views = new Map();
    let dialogTarget = null;
    const report = message => { document.getElementById('status').textContent = message; };
    const failure = (code, message) => Object.assign(new Error(message), { code });
    const definitions = () => bpmnjs.getDefinitions();
    const processId = root => root.businessObject.$type === 'bpmn:Process' ? root.businessObject.id : root.businessObject.$type === 'bpmn:Collaboration' && root.businessObject.participants?.length === 1 ? root.businessObject.participants[0].processRef?.id : undefined;
    function list() {
      const seen = new Set();
      return (definitions()?.diagrams || []).flatMap((diagram, index) => {
        const bo = diagram.plane?.bpmnElement;
        if (!bo || seen.has(bo.id)) return [];
        const root = canvas.findRoot(bo.id + '_plane') || canvas.findRoot(bo.id);
        if (!root) return [];
        seen.add(bo.id);
        const child = bo.$type === 'bpmn:SubProcess';
        return [{ id: root.id, elementId: bo.id, name: bo.name || (index === 0 ? 'Proceso principal' : child ? 'Subproceso' : 'Proceso ' + (index + 1)), kind: child ? 'subprocess' : 'process', processId: processId(root) }];
      });
    }
    function canNavigate() {
      if (window.NaraPropertyDraftPending?.()) throw failure('FORM_PENDING', 'Aplica o descarta el texto pendiente en Propiedades antes de cambiar de hoja.');
    }
    function render() {
      const nav = document.getElementById('sheetNavigation');
      nav.replaceChildren();
      const current = canvas.getRootElement();
      for (const sheet of list()) {
        const button = document.createElement('button');
        button.type = 'button'; button.role = 'tab'; button.dataset.sheet = sheet.id;
        button.textContent = (sheet.kind === 'subprocess' ? '↳ ' : '') + sheet.name;
        button.title = sheet.name + ' · doble clic para cambiar el nombre';
        button.setAttribute('aria-selected', String(current?.id === sheet.id));
        button.classList.toggle('active', current?.id === sheet.id);
        button.onclick = () => { try { open(sheet.id); } catch (error) { report(error.message); } };
        button.ondblclick = () => nameDialog(sheet.id);
        nav.appendChild(button);
      }
      document.getElementById('sheetBack').disabled = !back.some(id => canvas.findRoot(id));
    }
    function open(id) {
      canNavigate();
      const root = canvas.findRoot(id);
      if (!root) throw failure('SHEET_NOT_FOUND', 'La hoja no existe en este archivo.');
      if (root === canvas.getRootElement()) return;
      selection.select([]);
      canvas.setRootElement(root);
      if (views.has(root.id)) canvas.viewbox(views.get(root.id));
      else canvas.zoom('fit-viewport', 'auto');
      report('Hoja: ' + (list().find(s => s.id === id)?.name || id));
    }
    function create(name) {
      canNavigate();
      const context = { name: String(name).trim().slice(0, 120) || 'Nuevo proceso' };
      commandStack.execute('nara.sheet.create', context);
      return context.root;
    }
    function rename(id, name) {
      canNavigate();
      const root = canvas.findRoot(id);
      if (!root) throw failure('SHEET_NOT_FOUND', 'La hoja no existe.');
      modeling.updateProperties(root, { name: String(name).trim().slice(0, 120) || 'Proceso' });
    }
    function openSubprocess(id) {
      canNavigate();
      const element = elementRegistry.get(id);
      if (!element) throw failure('ELEMENT_NOT_FOUND', 'No existe el subproceso.');
      if (element.type === 'bpmn:CallActivity') {
        const target = list().find(sheet => sheet.processId === element.businessObject.calledElement);
        if (!target) throw failure('SHEET_NOT_FOUND', 'El proceso llamado no tiene una hoja en este archivo.');
        open(target.id); return;
      }
      if (element.type !== 'bpmn:SubProcess') throw failure('INVALID_OPERATION', 'Elige un subproceso o una actividad de llamada.');
      if (!element.collapsed) modeling.toggleCollapse(element);
      const root = canvas.findRoot(element.businessObject.id + '_plane');
      if (!root) throw failure('SHEET_NOT_FOUND', 'No se encontró el detalle del subproceso.');
      open(root.id);
    }
    function link(elementId, sheetId) {
      canNavigate();
      const element = elementRegistry.get(elementId), target = list().find(s => s.id === sheetId);
      if (!element || !['bpmn:Task','bpmn:SubProcess','bpmn:CallActivity'].includes(element.type)) throw failure('INVALID_OPERATION', 'Elige una tarea o un subproceso.');
      if (!target?.processId) throw failure('INVALID_TARGET', 'Elige una hoja de proceso independiente con un solo proceso.');
      let ancestor = element.businessObject;
      while (ancestor && ancestor.$type !== 'bpmn:Process') ancestor = ancestor.$parent;
      if (ancestor?.id === target.processId) throw failure('RECURSIVE_LINK', 'Elige otra hoja para evitar que el proceso se llame a sí mismo.');
      if (element.type === 'bpmn:SubProcess' && (element.businessObject.flowElements?.length || element.businessObject.artifacts?.length)) throw failure('SUBPROCESS_HAS_CONTENT', 'Este subproceso ya tiene contenido. Abre su detalle; no se reemplazará por otro proceso.');
      const context = { element, processId: target.processId };
      commandStack.execute('nara.sheet.link', context);
      selection.select(context.replacement);
      return context.replacement;
    }
    commandStack.registerHandler('nara.sheet.create', function() {
      this.execute = context => {
        const defs = definitions();
        if (!context.root) {
          const bo = bpmnFactory.create('bpmn:Process', { name: context.name, isExecutable: false });
          context.root = elementFactory.createRoot({ type: 'bpmn:Process', businessObject: bo });
          context.diagram = bpmnFactory.create('bpmndi:BPMNDiagram', { plane: context.root.di });
          context.root.di.$parent = context.diagram;
          context.previous = canvas.getRootElement();
        }
        context.root.businessObject.$parent = defs; context.diagram.$parent = defs;
        defs.get('rootElements').push(context.root.businessObject);
        defs.get('diagrams').push(context.diagram);
        canvas.addRootElement(context.root); canvas.setRootElement(context.root);
        return [context.root];
      };
      this.postExecute = context => {
        modeling.createShape(elementFactory.createShape({ type: 'bpmn:StartEvent' }), { x: 160, y: 180 }, context.root);
      };
      this.revert = context => {
        const defs = definitions();
        canvas.removeRootElement(context.root);
        defs.rootElements.splice(defs.rootElements.indexOf(context.root.businessObject), 1);
        defs.diagrams.splice(defs.diagrams.indexOf(context.diagram), 1);
        canvas.setRootElement(context.previous);
        return [context.root];
      };
    });
    commandStack.registerHandler('nara.sheet.link', function() {
      this.preExecute = context => {
        const old = context.element;
        context.replacement = old.type === 'bpmn:CallActivity' ? old : bpmnReplace.replaceElement(old, { type: 'bpmn:CallActivity' });
        modeling.updateProperties(context.replacement, { calledElement: context.processId });
      };
      this.execute = () => [];
      this.revert = () => [];
    });
    async function importAdditional() {
      importing = true;
      const initial = canvas.getRootElement(), warnings = [];
      try {
        for (const diagram of definitions()?.diagrams || []) {
          const bo = diagram.plane?.bpmnElement;
          if (!bo || canvas.findRoot(bo.id) || canvas.findRoot(bo.id + '_plane')) continue;
          const result = await window.NaraImportBpmnDiagram(bpmnjs, definitions(), diagram);
          warnings.push(...result.warnings);
        }
        canvas.setRootElement(initial);
      } finally { importing = false; previousRoot = initial?.id; back = []; render(); }
      return warnings;
    }
    function nameDialog(id = null) {
      try { canNavigate(); } catch (error) { report(error.message); return; }
      dialogTarget = id;
      document.getElementById('sheetDialogHeading').textContent = id ? 'Cambiar nombre de la hoja' : 'Nueva hoja de proceso';
      document.getElementById('saveSheetName').textContent = id ? 'Guardar nombre' : 'Crear hoja';
      const input = document.getElementById('sheetName');
      input.value = id ? list().find(s => s.id === id)?.name || '' : '';
      document.getElementById('sheetDialog').showModal(); input.focus(); input.select();
    }
    document.getElementById('newSheet').onclick = () => nameDialog();
    document.getElementById('closeSheetDialog').onclick = () => document.getElementById('sheetDialog').close();
    document.getElementById('sheetForm').onsubmit = event => {
      event.preventDefault();
      try {
        const name = document.getElementById('sheetName').value;
        if (dialogTarget) rename(dialogTarget, name); else create(name);
        document.getElementById('sheetDialog').close();
      } catch (error) { report(error.message); }
    };
    document.getElementById('sheetBack').onclick = () => {
      let id;
      while ((id = back.pop()) && !canvas.findRoot(id)) { /* Skip removed sheets. */ }
      if (id) { goingBack = true; try { open(id); } catch (error) { back.push(id); report(error.message); } finally { goingBack = false; render(); } }
    };
    document.getElementById('openSubprocess').onclick = () => { try { openSubprocess(selection.get()[0]?.id); } catch (error) { report(error.message); } };
    document.getElementById('linkSubprocess').onclick = () => { try { link(selection.get()[0]?.id, document.getElementById('subprocessTarget').value); } catch (error) { report(error.message); } };
    eventBus.on('import.parse.start', () => { importing = true; back = []; views.clear(); previousRoot = undefined; });
    eventBus.on('canvas.viewbox.changed', event => { if (!importing && canvas.getRootElement()) views.set(canvas.getRootElement().id, { ...event.viewbox }); });
    eventBus.on('root.set', event => {
      if (!importing && previousRoot && previousRoot !== event.element.id && !goingBack) back.push(previousRoot);
      previousRoot = event.element.id;
      render(); eventBus.fire('nara.sheet.changed');
    });
    eventBus.on(['commandStack.changed', 'element.changed'], () => { if (!importing) render(); });
    eventBus.on('element.dblclick', 2000, event => {
      if (!['bpmn:SubProcess','bpmn:CallActivity'].includes(event.element.type)) return;
      try { openSubprocess(event.element.id); } catch (error) { report(error.message); }
      return false;
    });
    this.list = list; this.open = open; this.create = create; this.rename = rename; this.link = link; this.openSubprocess = openSubprocess; this.importAdditional = importAdditional;
  }
  SheetManager.$inject = ['bpmnjs','canvas','commandStack','elementFactory','bpmnFactory','modeling','eventBus','elementRegistry','bpmnReplace','selection'];
  window.NaraSheetsModule = { __init__: ['naraSheets'], naraSheets: ['type', SheetManager] };
})();
