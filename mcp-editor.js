'use strict';
// Adapter for the existing editor. All changes use native commandStack operations.
(() => {
  function PositionedLabelHandler(modeling) {
    this.preExecute = context => {
      modeling.updateLabel(context.element, context.text, context.bounds);
      const label = context.element.label;
      if (label) modeling.moveShape(label, { x: context.bounds.x - label.x, y: context.bounds.y - label.y });
    };
    this.execute = () => [];
    this.revert = () => [];
  }
  PositionedLabelHandler.$inject = ['modeling'];
  modeler.get('commandStack').registerHandler('nara.mcp.positionedLabel', PositionedLabelHandler);
  let revision = crypto.randomUUID();
  for (const event of ['commandStack.changed', 'import.done', 'root.set','nara.sheet.changed']) modeler.get('eventBus').on(event, () => { revision = crypto.randomUUID(); });
  const error = (code, message) => Object.assign(new Error(message), { code });
  function available() {
    if (!ready || loadingDiagram || saving || filePolling || window.NaraMicrosoftDialogOpen) throw error('EDITOR_BUSY', 'El visor está cargando, seleccionando o guardando un archivo. Intenta leer de nuevo.');
  }
  function formPending() {
    return window.NaraPropertyDraftPending();
  }
  function guard(expected) {
    available();
    if (expected !== revision) throw error('REVISION_CONFLICT', 'El diagrama cambió después de la lectura. Lee la revisión actual y conserva las ediciones manuales.');
    if (formPending()) throw error('FORM_PENDING', 'Hay texto sin aplicar en Propiedades. El usuario debe aplicarlo o descartarlo antes de editar mediante Codex.');
  }
  const element = id => {
    const result = modeler.get('elementRegistry').get(id);
    if (!result || result.labelTarget) throw error('ELEMENT_NOT_FOUND', 'No existe ese elemento editable. Consulta los IDs con read.');
    if (modeler.get('canvas').findRoot(result) !== modeler.get('canvas').getRootElement()) throw error('WRONG_SHEET', 'Abre la hoja del elemento antes de modificarlo.');
    return result;
  };
  function describe(el) {
    const bo = el.businessObject;
    return { id: el.id, type: el.type, name: el.type === 'bpmn:Group' ? stageName(el) : el.type === 'bpmn:TextAnnotation' ? bo.text || '' : bo.name || '', parentId: el.parent?.id, calledElement: bo.calledElement, x: el.x, y: el.y, width: el.width, height: el.height, sourceId: el.source?.id, targetId: el.target?.id, waypoints: el.waypoints?.map(p => ({ x: p.x, y: p.y })), documentation: (bo.documentation || []).map(d => d.text || '').join('\n\n'), dataState: bo.dataState?.name, visualStyle:window.NaraStylePanel?.read(el)||{}, role: roleFor(el), stage: phaseFor(el) };
  }
  async function read({ includeXml = false } = {}) {
    available();
    const base = revision;
    const { xml } = await modeler.saveXML({ format: true });
    const sha256 = await browserFiles.digest(xml);
    if (base !== revision) throw error('REVISION_CONFLICT', 'El diagrama cambió durante la lectura. Lee nuevamente.');
    const canvas = modeler.get('canvas'), er=window.NaraER,activeSheetId = er?.active() || canvas.getRootElement().id;
    if(er?.active()){
      const dataModel=er.read(),elements=[...dataModel.tables.map(t=>({...t,type:'nara:Entity',height:window.NaraERModel.height(t)})),...dataModel.relationships.map(r=>({...r,type:'nara:Relationship'}))];
      return {editorVersion:window.NaraAppVersion||'unknown',revision,sha256,fileName:browserFiles.name,diagramType:'erd',activeSheetId,sheets:modeler.get('naraSheets').list(),dirty,unappliedProperties:formPending(),canSaveToFile:Boolean(browserFiles.handle),selectedIds:er.selected()?[er.selected()]:[],selectedFieldId:er.selectedField(),warnings:(window.importWarnings||[]).map(w=>w.message||String(w)),canUndo:modeler.get('commandStack').canUndo(),canRedo:modeler.get('commandStack').canRedo(),totalElements:elements.length,elementsTruncated:elements.length>2000,elements:elements.slice(0,2000),dataModel,expandedCanvas:window.NaraExpandedCanvas?.()||false,...(includeXml?{xml}:{})};
    }
    const elements = modeler.get('elementRegistry').getAll().filter(e => e.businessObject && !e.labelTarget && canvas.findRoot(e)?.id === activeSheetId);
    return { editorVersion:window.NaraAppVersion||'unknown', revision, sha256, fileName: browserFiles.name, diagramType:'bpmn', activeSheetId, sheets: modeler.get('naraSheets').list(), dirty, unappliedProperties: formPending(), canSaveToFile: Boolean(browserFiles.handle), selectedIds: modeler.get('selection').get().map(e => e.id), warnings: (window.importWarnings || []).map(w => w.message || String(w)), canUndo: modeler.get('commandStack').canUndo(), canRedo: modeler.get('commandStack').canRedo(), totalElements: elements.length, elementsTruncated: elements.length > 2000, elements: elements.slice(0, 2000).map(describe),expandedCanvas:window.NaraExpandedCanvas?.()||false, ...(includeXml ? { xml } : {}) };
  }
  async function edit({ expectedRevision, operation: op }) {
    guard(expectedRevision);
    if (op.type === 'open_bpmn') {
      const occupied = modeler.get('elementRegistry').getAll().some(e => e.businessObject && !e.labelTarget && e.parent && (e.type !== 'bpmn:StartEvent' || e.businessObject.name));
      if (dirty || browserFiles.handle || occupied || window.NaraER?.list().length) throw error('DOCUMENT_NOT_EMPTY', 'Abrir mediante MCP requiere una pestaña nueva vacía, sin cambios ni archivo vinculado. Conserva el documento actual.');
      await acceptBrowserSource({ name: op.fileName, xml: op.xml, handle: null });
      return { applied: true, ...(await read()) };
    }
    if(op.type==='view'){window.NaraSetFocus(op.expanded);return{applied:true,...(await read())};}
    if(op.type==='style'){const affectedId=window.NaraStylePanel.apply(op.elementId,op.style);return{applied:true,affectedId,...(await read())};}
    if(op.type.startsWith('erd_')){const affectedId=window.NaraER.edit(op);return{applied:true,affectedId,...(await read())};}
    if(window.NaraER?.active()&&['label','move','resize','delete'].includes(op.type)){
      let erOp;
      if(op.type==='delete')erOp={type:'erd_delete',elementId:op.elementId};
      else{const entity=window.NaraERModel.table(window.NaraER.read(),op.elementId);erOp={type:'erd_table_update',tableId:entity.id,...(op.type==='label'?{name:op.text}:op.type==='move'?{x:entity.x+op.dx,y:entity.y+op.dy}:{x:op.x,y:op.y,width:op.width})};}
      const affectedId=window.NaraER.edit(erOp);return{applied:true,affectedId,...(await read())};
    }
    if(window.NaraER?.active()&&['create','connect','stage','stage_split','lane_add','lane_split','documentation','sheet_link','subprocess_open','route','move_elements'].includes(op.type))throw error('WRONG_DIAGRAM_TYPE','Esta operación requiere una hoja BPMN. Para tablas y relaciones usa las operaciones erd_.');
    const modeling = modeler.get('modeling'), factory = modeler.get('elementFactory'), canvas = modeler.get('canvas'), rules = modeler.get('rules');
    let affected;
    if (op.type === 'label') {
      affected = element(op.elementId);
      if (op.bounds && !['bpmn:StartEvent','bpmn:EndEvent','bpmn:IntermediateCatchEvent','bpmn:IntermediateThrowEvent','bpmn:ExclusiveGateway','bpmn:ParallelGateway','bpmn:SequenceFlow','bpmn:MessageFlow','bpmn:Association','bpmn:Group','bpmn:DataObjectReference','bpmn:DataStoreReference'].includes(affected.type)) throw error('INVALID_OPERATION', 'La posición corresponde a una etiqueta externa.');
      if (affected.type === 'bpmn:TextAnnotation') modeling.updateProperties(affected, { text: op.text });
      else if (op.bounds) modeler.get('commandStack').execute('nara.mcp.positionedLabel', { element: affected, text: op.text, bounds: op.bounds });
      else modeling.updateLabel(affected, op.text);
    } else if (op.type === 'documentation') {
      affected = element(op.elementId);
      modeling.updateProperties(affected, { documentation: op.text ? [modeler.get('moddle').create('bpmn:Documentation', { text: op.text })] : [] });
    } else if (op.type === 'create') {
      const types = ['bpmn:Task','bpmn:ManualTask','bpmn:UserTask','bpmn:ServiceTask','bpmn:SubProcess','bpmn:CallActivity','bpmn:StartEvent','bpmn:EndEvent','bpmn:IntermediateCatchEvent','bpmn:IntermediateThrowEvent','bpmn:ExclusiveGateway','bpmn:ParallelGateway','bpmn:TextAnnotation','bpmn:DataObjectReference','bpmn:DataStoreReference','bpmn:Participant'];
      if (!types.includes(op.bpmnType) || !Number.isFinite(op.x) || !Number.isFinite(op.y)) throw error('INVALID_OPERATION', 'Tipo o posición inválidos.');
      const props = op.bpmnType === 'bpmn:TextAnnotation' ? { text: op.name || '' } : { name: op.name || '' };
      const businessObject = modeler.get('bpmnFactory').create(op.bpmnType, props);
      if (op.linkName !== undefined) {
        if (!['bpmn:IntermediateCatchEvent','bpmn:IntermediateThrowEvent'].includes(op.bpmnType) || !op.linkName.trim()) throw error('INVALID_OPERATION', 'Un enlace requiere un evento intermedio y nombre.');
        const definition = modeler.get('bpmnFactory').create('bpmn:LinkEventDefinition', { name: op.linkName });
        definition.$parent = businessObject;
        businessObject.eventDefinitions = [definition];
      }
      const shape = op.bpmnType === 'bpmn:Participant'
        ? factory.createParticipantShape({ businessObject, isExpanded: true })
        : factory.createShape({ type: op.bpmnType, businessObject });
      const parent = op.parentId ? element(op.parentId) : canvas.getRootElement();
      if (!rules.allowed('shape.create', { shape, target: parent, position: { x: op.x, y: op.y } })) throw error('BPMN_RULE', 'No se permite crear ese elemento en el contenedor elegido.');
      affected = modeling.createShape(shape, { x: op.x, y: op.y }, parent);
    } else if (op.type === 'connect') {
      const source = element(op.sourceId), target = element(op.targetId);
      const connection = op.bpmnType ? { type: op.bpmnType } : undefined;
      const allowed = rules.allowed('connection.create', { source, target, connection });
      if (!allowed || (connection && allowed.type && allowed.type !== connection.type)) throw error('BPMN_RULE', 'La conexión solicitada no es válida entre esos elementos.');
      affected = modeling.connect(source, target, connection);
    } else if (op.type === 'move_elements') {
      const shapes = op.elementIds.map(element), target = element(op.parentId), delta = { x: op.dx, y: op.dy };
      if (shapes.some(s => !s.parent || s.waypoints || ['bpmn:Participant','bpmn:Lane'].includes(s.type)) || !rules.allowed('elements.move', { shapes, delta, target })) throw error('BPMN_RULE', 'No se permite mover ese conjunto de figuras al contenedor.');
      modeling.moveElements(shapes, delta, target);
      affected = shapes[0];
    } else if (op.type === 'move') {
      affected = element(op.elementId);
      if (!affected.parent || affected.waypoints || !Number.isFinite(op.dx) || !Number.isFinite(op.dy)) throw error('INVALID_OPERATION', 'Elige una figura y un desplazamiento válido.');
      const target = op.parentId ? element(op.parentId) : affected.parent;
      const delta = { x: op.dx, y: op.dy };
      if (!rules.allowed('elements.move', { shapes: [affected], delta, target })) throw error('BPMN_RULE', 'El movimiento no está permitido.');
      modeling.moveShape(affected, delta, target);
    } else if (op.type === 'resize') {
      affected = element(op.elementId);
      if (![op.x, op.y, op.width, op.height].every(Number.isFinite) || op.width < 20 || op.height < 20 || !rules.allowed('shape.resize', { shape: affected })) throw error('BPMN_RULE', 'No se permite ese tamaño para el elemento.');
      modeling.resizeShape(affected, { x: op.x, y: op.y, width: op.width, height: op.height });
    } else if (op.type === 'route') {
      affected = element(op.elementId);
      if (!affected.waypoints || !Array.isArray(op.waypoints) || op.waypoints.length < 2 || op.waypoints.length > 100 || op.waypoints.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw error('INVALID_OPERATION', 'El trazado requiere una conexión y entre 2 y 100 puntos válidos.');
      modeling.updateWaypoints(affected, op.waypoints.map(p => ({ x: p.x, y: p.y })));
    } else if (op.type === 'delete') {
      affected = element(op.elementId);
      if (!affected.parent) throw error('BPMN_RULE', 'No se puede eliminar la raíz.');
      modeling.removeElements([affected]);
    } else if(op.type==='stage_split'){
      const context={sourceId:element(op.elementId).id,count:op.count};modeler.get('commandStack').execute('project.stage.split',context);affected=context.stages[0];
    } else if (op.type === 'stage') {
      if(op.sourceId)element(op.sourceId);
      const context = op.sourceId?{sourceId:op.sourceId,direction:op.direction||'right'}:{};
      modeler.get('commandStack').execute('project.stage.add', context);
      affected = context.stage;
    } else if (op.type === 'lane_add' || op.type === 'lane_split') {
      const target = element(op.elementId);
      if (!['bpmn:Participant', 'bpmn:Lane'].includes(target.type) || target.di?.isExpanded === false) throw error('BPMN_RULE', 'Selecciona un participante expandido o un carril.');
      if (op.type === 'lane_add') affected = modeling.addLane(target, op.location);
      else {
        const length = target.di?.isHorizontal === false ? target.width : target.height;
        if (!Number.isInteger(op.count) || op.count < 2 || op.count > 10 || length < op.count * 60) throw error('BPMN_RULE', 'El contenedor requiere al menos 60 unidades por carril (2 a 10 carriles).');
        modeling.splitLane(target, op.count);
        affected = target;
      }
    } else if (op.type === 'sheet_create') {
      affected = modeler.get('naraSheets').create(op.name);
    } else if (op.type === 'sheet_open') {
      modeler.get('naraSheets').open(op.sheetId);
    } else if (op.type === 'sheet_rename') {
      modeler.get('naraSheets').rename(op.sheetId, op.name);
    } else if (op.type === 'subprocess_open') {
      modeler.get('naraSheets').openSubprocess(op.elementId);
    } else if (op.type === 'sheet_link') {
      element(op.elementId);
      affected = modeler.get('naraSheets').link(op.elementId, op.sheetId);
    } else if (op.type === 'undo' || op.type === 'redo') {
      const stack = modeler.get('commandStack');
      if (!(op.type === 'undo' ? stack.canUndo() : stack.canRedo())) throw error('NO_HISTORY', 'No hay una operación que deshacer o rehacer.');
      stack[op.type]();
    } else throw error('INVALID_OPERATION', 'Operación no admitida.');
    keepDocumentDraft = null;
    if (affected?.parent && op.type !== 'delete') modeler.get('selection').select(affected);
    status(['sheet_open','subprocess_open'].includes(op.type) ? 'Hoja abierta por Codex.' : 'Cambio de Codex aplicado.');
    return { applied: true, affectedId: affected?.id, ...(await read()) };
  }
  async function save({ expectedRevision }) {
    guard(expectedRevision);
    const handle = browserFiles.handle;
    if (!handle || !(standalone || detached)) throw error('FILE_SELECTION_REQUIRED', 'Pulsa Guardar como en el visor y elige el destino antes de guardar mediante Codex.');
    if (handle.queryPermission && await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') throw error('FILE_PERMISSION_REQUIRED', 'Pulsa Guardar en el visor para autorizar la escritura del archivo.');
    guard(expectedRevision);
    saving = true;
    const sequence = editSequence;
    try {
      const { xml } = await modeler.saveXML({ format: true });
      if (revision !== expectedRevision) throw error('REVISION_CONFLICT', 'El diagrama cambió antes del guardado. Lee de nuevo.');
      await browserFiles.save(xml, handle);
      const persisted = await browserFiles.read();
      const sha256 = await browserFiles.digest(xml);
      if (persisted.hash !== sha256) throw error('SAVE_NOT_VERIFIED', 'El archivo escrito no coincide con la revisión enviada. Lee y comprueba antes de volver a guardar.');
      if (sequence === editSequence) setDirty(false);
      browserFileContext(browserFiles.name);
      byId('externalChange').hidden = true;
      status(handle.storageKind === 'microsoft' ? 'Archivo guardado por Codex en Microsoft · Escritura comprobada.' : 'Archivo guardado por Codex · Escritura comprobada e historial conservado.');
      window.naraAutoSave?.reset();
      return { saved: true, storage: handle.storageKind === 'microsoft' ? 'microsoft' : 'local', savedRevision: expectedRevision, revision, sha256, fileName: browserFiles.name, dirty };
    } catch (cause) {
      if (cause.code === 'EXTERNAL_CHANGE') showExternalChange(cause.message);
      else window.naraAutoSave?.block(cause);
      throw cause;
    } finally { saving = false; window.naraAutoSave?.refresh(); }
  }
  async function exportPng({ expectedRevision, scale = 2 }) {
    guard(expectedRevision);
    if (!Number.isFinite(scale) || scale < 0.5 || scale > 3) throw error('INVALID_SCALE', 'La escala debe estar entre 0.5 y 3.');
    decorateStages(); decorateDocuments();
    await document.fonts.ready;
    const svg = window.NaraER?.active()?window.NaraER.exportSvg():(await modeler.saveSVG()).svg;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const image = new Image(); image.src = url; await image.decode();
      if (!image.naturalWidth || !image.naturalHeight) throw error('PNG_EXPORT_ERROR', 'El diagrama no tiene dimensiones exportables.');
      const effectiveScale = Math.min(scale, 8192 / image.naturalWidth, 8192 / image.naturalHeight, Math.sqrt(16000000 / (image.naturalWidth * image.naturalHeight)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(image.naturalWidth * effectiveScale));
      canvas.height = Math.max(1, Math.floor(image.naturalHeight * effectiveScale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      if (revision !== expectedRevision) throw error('REVISION_CONFLICT', 'El diagrama cambió durante la exportación. Lee y exporta nuevamente.');
      if (dataUrl.length > 8 * 1024 * 1024 * 4 / 3 + 40) throw error('PNG_TOO_LARGE', 'El PNG supera 8 MB. Exporta con una escala menor.');
      const sheetId = window.NaraER?.active()||modeler.get('canvas').getRootElement().id;
      return { pngBase64: dataUrl.slice(dataUrl.indexOf(',') + 1), width: canvas.width, height: canvas.height, revision, fileName: browserFiles.name, sheetId, sheetName: modeler.get('naraSheets').list().find(s => s.id === sheetId)?.name, effectiveScale };
    } finally { URL.revokeObjectURL(url); }
  }
  window.NaraBizaguiEditor = Object.freeze({ read, edit, save, exportPng });
})();
