'use strict';
(() => {
  const { BPMN_CREATE_TYPES: types, BATCH_OPERATIONS: supported, EVENT_KINDS: eventKinds } = window.NaraModelAudit;
  const fail = message => { throw Object.assign(Error(message), { code: 'INVALID_OPERATION' }); };
  function create(modeler) {
    const modeling = modeler.get('modeling'), registry = modeler.get('elementRegistry'), canvas = modeler.get('canvas'), rules = modeler.get('rules');
    const semantic = window.NaraBpmnProperties.create(modeler);
    function PositionLabel(modeling) { this.preExecute = c => { modeling.updateLabel(c.element, c.text, c.bounds); const label = c.element.label; if (label) modeling.moveShape(label, { x: c.bounds.x - label.x, y: c.bounds.y - label.y }); }; this.execute = this.revert = () => []; }
    PositionLabel.$inject = ['modeling'];
    modeler.get('commandStack').registerHandler('nara.block.label', PositionLabel);
    const element = id => { const e = registry.get(id); if (!e || e.labelTarget || canvas.findRoot(e) !== canvas.getRootElement()) fail('El elemento no existe en la hoja activa: ' + id); return e; };
    function propertyPlan(e, partial) {
      const description = semantic.describe(e), fields = new Map(description.fields.map(f => [f.key, f])), values = Object.fromEntries(description.fields.map(f => [f.key, f.value]));
      for (const [key, v] of Object.entries(partial)) {
        const field = fields.get(key); if (!field) fail('Propiedad no admitida para este elemento: ' + key);
        if (field.checkbox ? typeof v !== 'boolean' : typeof v !== 'string' || v.length > 20000) fail('Valor de propiedad inválido: ' + key);
        if (field.choices && !field.choices.some(([choice]) => choice === v)) fail('Opción no admitida: ' + key);
        values[key] = v;
      }
      return semantic.plan(e, values);
    }
    function apply(op) {
      let e;
      if (op.type === 'create') {
        if (!types.includes(op.bpmnType) || ![op.x,op.y].every(Number.isFinite)) fail('Tipo o posición inválidos.');
        const factory = modeler.get('elementFactory'), bpmnFactory = modeler.get('bpmnFactory');
        const bo = bpmnFactory.create(op.bpmnType, op.bpmnType === 'bpmn:TextAnnotation' ? { text: op.name || '' } : { name: op.name || '' });
        const kind = op.eventDefinition || (op.linkName !== undefined ? 'Link' : undefined);
        if (op.linkName !== undefined && (kind !== 'Link' || !op.linkName.trim())) fail('linkName requiere un evento de enlace y un nombre no vacío.');
        if (kind) {
          if (!eventKinds[op.bpmnType]?.includes(kind)) fail('Esta definición no es válida para el tipo de evento.');
          const definition = bpmnFactory.create('bpmn:' + kind + 'EventDefinition', kind === 'Link' ? { name: op.linkName || '' } : {});
          definition.$parent = bo; bo.eventDefinitions = [definition];
        }
        const shape = op.bpmnType === 'bpmn:Participant' ? factory.createParticipantShape({ businessObject: bo, isExpanded: true }) : factory.createShape({ type: op.bpmnType, businessObject: bo });
        const parent = op.parentId ? element(op.parentId) : canvas.getRootElement();
        if (!rules.allowed('shape.create', { shape, target: parent, position: { x: op.x, y: op.y } })) fail('No se permite crear la figura en ese contenedor.');
        e = modeling.createShape(shape, { x: op.x, y: op.y }, parent);
      } else if (op.type === 'connect') {
        const source = element(op.sourceId), target = element(op.targetId), connection = op.bpmnType ? { type: op.bpmnType } : undefined;
        const allowed = rules.allowed('connection.create', { source, target, connection });
        if (!allowed || (connection && allowed.type && allowed.type !== connection.type)) fail('Conexión BPMN no admitida.');
        e = modeling.connect(source, target, connection);
      } else {
        e = element(op.elementId || op.elementIds?.[0]);
        if (op.type === 'label') {
          if (op.bounds && !(e.label || ['bpmn:StartEvent','bpmn:EndEvent','bpmn:IntermediateCatchEvent','bpmn:IntermediateThrowEvent','bpmn:ExclusiveGateway','bpmn:InclusiveGateway','bpmn:ParallelGateway','bpmn:ComplexGateway','bpmn:EventBasedGateway','bpmn:SequenceFlow','bpmn:MessageFlow','bpmn:Association','bpmn:Group','bpmn:DataObjectReference','bpmn:DataStoreReference'].includes(e.type))) fail('La posición requiere una etiqueta externa.');
          if (e.type === 'bpmn:TextAnnotation') modeling.updateProperties(e, { text: op.text });
          else if (op.bounds) modeler.get('commandStack').execute('nara.block.label', { element: e, text: op.text, bounds: op.bounds });
          else modeling.updateLabel(e, op.text);
        } else if (op.type === 'documentation') modeling.updateProperties(e, { documentation: op.text ? [modeler.get('moddle').create('bpmn:Documentation', { text: op.text })] : [] });
        else if (op.type === 'properties') { const changes = propertyPlan(e, op.values); semantic.transaction(() => changes.forEach(change => change())); }
        else if (op.type === 'route') {
          if (!e.waypoints || !Array.isArray(op.waypoints) || op.waypoints.length < 2 || op.waypoints.length > 100 || op.waypoints.some(p => ![p.x,p.y].every(Number.isFinite))) fail('Recorrido inválido.');
          modeling.updateWaypoints(e, op.waypoints.map(p => ({ x: p.x, y: p.y })));
        } else if (op.type === 'move' || op.type === 'move_elements') {
          const shapes = op.elementIds ? op.elementIds.map(element) : [e], target = op.parentId ? element(op.parentId) : e.parent, delta = { x: op.dx, y: op.dy };
          if (![op.dx,op.dy].every(Number.isFinite) || shapes.some(s => !s.parent || s.waypoints) || !rules.allowed('elements.move', { shapes, delta, target })) fail('Movimiento no admitido.');
          if (op.elementIds) modeling.moveElements(shapes, delta, target); else modeling.moveShape(e, delta, target);
        } else if (op.type === 'resize') {
          if (![op.x,op.y,op.width,op.height].every(Number.isFinite) || op.width < 20 || op.height < 20 || !rules.allowed('shape.resize', { shape: e })) fail('Tamaño no admitido.');
          modeling.resizeShape(e, { x: op.x, y: op.y, width: op.width, height: op.height });
        } else fail('Operación no agrupable: ' + op.type);
      }
      return e;
    }
    function run(operations) {
      const aliases = {}, affectedIds = [];
      const resolve = id => typeof id === 'string' && id.startsWith('@') ? aliases[id.slice(1)] || fail('Alias inexistente: ' + id) : id;
      for (const operation of operations) {
        if (!supported.includes(operation.type)) fail('Operación no agrupable: ' + operation.type);
        if (operation.as && (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(operation.as) || aliases[operation.as] || !['create','connect'].includes(operation.type))) fail('Alias inválido o repetido.');
        const op = { ...operation };
        for (const key of ['elementId','parentId','sourceId','targetId']) if (op[key]) op[key] = resolve(op[key]);
        if (op.elementIds) op.elementIds = op.elementIds.map(resolve);
        if (op.values) op.values = Object.fromEntries(Object.entries(op.values).map(([key, v]) => [key.startsWith('condition:@') ? 'condition:' + resolve(key.slice(10)) : key, ['defaultFlow','referenceId'].includes(key) ? resolve(v) : v]));
        const e = apply(op); affectedIds.push(e?.id); if (op.as) aliases[op.as] = e.id;
      }
      return { aliases, affectedIds };
    }
    return { apply, run, propertyPlan, supported, types };
  }
  window.NaraMcpOperations = { create, supported, types };
})();
