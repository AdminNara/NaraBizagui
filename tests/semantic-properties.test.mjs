import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundle = await build({ stdin: { contents: `
  export { BpmnModdle } from 'bpmn-moddle';
  export { Ids } from 'ids';
  export { default as BpmnFactory } from 'bpmn-js/lib/features/modeling/BpmnFactory.js';
  export { default as UpdateProperties } from 'bpmn-js/lib/features/modeling/cmd/UpdatePropertiesHandler.js';
  export { default as UpdateModdle } from 'bpmn-js/lib/features/modeling/cmd/UpdateModdlePropertiesHandler.js';
  export { default as EventBus } from 'diagram-js/lib/core/EventBus.js';
  export { default as CommandStack } from 'diagram-js/lib/command/CommandStack.js';
`, resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, platform: 'node', format: 'cjs', write: false });
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { BpmnModdle, Ids, BpmnFactory, UpdateProperties, UpdateModdle, EventBus, CommandStack } = module.exports;
const source = await readFile(new URL('../editor-properties.js', import.meta.url), 'utf8');

async function fixture(contents) {
  const moddle = new BpmnModdle(); moddle.ids = new Ids([32, 36, 1]);
  const { rootElement: defs, warnings } = await moddle.fromXML(`<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="Definitions_Test" targetNamespace="https://example.test"><bpmn:process id="Process_Test">${contents}</bpmn:process></bpmn:definitions>`);
  assert.equal(warnings.length, 0);
  const registry = new Map();
  const visit = bo => { if (bo.id) registry.set(bo.id, { id: bo.id, type: bo.$type, businessObject: bo }); for (const child of bo.flowElements || []) visit(child); };
  defs.rootElements.forEach(visit);
  const elementRegistry = { get: id => registry.get(id), filter: fn => [...registry.values()].filter(fn) };
  const services = { elementRegistry, moddle, eventBus: new EventBus(), bpmnFactory: new BpmnFactory(moddle), textRenderer: {} };
  const stack = services.commandStack = new CommandStack(services.eventBus, { instantiate: Type => new Type(...(Type.$inject || []).map(key => services[key])) });
  const modeling = services.modeling = {
    updateProperties: (element, properties) => stack.execute('element.updateProperties', { element, properties }),
    updateModdleProperties: (element, moddleElement, properties) => stack.execute('element.updateModdleProperties', { element, moddleElement, properties })
  };
  stack.registerHandler('element.updateProperties', UpdateProperties); stack.registerHandler('element.updateModdleProperties', UpdateModdle);
  const context = { window: {} }; vm.runInNewContext(source, context);
  const editor = context.window.NaraBpmnProperties.create({ get: key => services[key] });
  const values = id => Object.fromEntries(editor.describe(registry.get(id)).fields.map(field => [field.key, field.value]));
  const apply = (id, changes) => { const element = registry.get(id), plan = editor.plan(element, { ...values(id), ...changes }); editor.transaction(() => plan.forEach(change => change())); };
  return { defs, moddle, registry, stack, modeling, editor, values, apply, xml: async () => (await moddle.toXML(defs, { format: true })).xml };
}

test('manual link names round-trip, scope pairs to their container and undo the whole form once', async () => {
  const f = await fixture(`<bpmn:intermediateThrowEvent id="Send" name="Visible label"><bpmn:documentation>Preserve me</bpmn:documentation><bpmn:linkEventDefinition id="SendLink" name=""/></bpmn:intermediateThrowEvent><bpmn:intermediateCatchEvent id="Receive"><bpmn:linkEventDefinition id="ReceiveLink" name=""/></bpmn:intermediateCatchEvent><bpmn:intermediateCatchEvent id="Duplicate"><bpmn:linkEventDefinition name=""/></bpmn:intermediateCatchEvent><bpmn:subProcess id="Sub"><bpmn:intermediateCatchEvent id="Nested"><bpmn:linkEventDefinition name="A"/></bpmn:intermediateCatchEvent></bpmn:subProcess>`);
  const before = await f.xml();
  const send = f.registry.get('Send'), plan = f.editor.plan(send, { ...f.values('Send'), linkName: 'A' });
  f.editor.transaction(() => { f.modeling.updateProperties(send, { name: 'Visible name changed' }); plan.forEach(change => change()); });
  assert.match(f.editor.describe(send).notes[0], /Falta una entrada/);
  f.stack.undo(); assert.equal(await f.xml(), before);
  f.stack.redo(); f.apply('Receive', { linkName: 'A' });
  assert.match(f.editor.describe(send).notes[0], /Entrada encontrada/);
  const linked = await f.xml();
  assert.throws(() => f.apply('Duplicate', { linkName: 'A' }), /Ya existe una entrada/);
  assert.equal(await f.xml(), linked);
  const parsed = await f.moddle.fromXML(linked); assert.equal(parsed.warnings.length, 0);
  const event = parsed.elementsById.Send; assert.equal(event.eventDefinitions[0].name, 'A');
  assert.equal(event.documentation[0].text, 'Preserve me'); assert.equal(event.name, 'Visible name changed');
});

test('gateway conditions and default branches persist as BPMN and are undone together', async () => {
  const f = await fixture(`<bpmn:exclusiveGateway id="Decision"/><bpmn:task id="Yes"/><bpmn:task id="No"/><bpmn:sequenceFlow id="Accept" name="Sí" sourceRef="Decision" targetRef="Yes"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" language="feel">old</bpmn:conditionExpression></bpmn:sequenceFlow><bpmn:sequenceFlow id="Reject" name="No" sourceRef="Decision" targetRef="No"/>`);
  const before = await f.xml();
  f.apply('Decision', { defaultFlow: 'Accept', 'condition:Reject': 'amount &lt; 10' });
  const gateway = f.registry.get('Decision').businessObject;
  assert.equal(gateway.default.id, 'Accept'); assert.equal(f.registry.get('Accept').businessObject.conditionExpression, undefined);
  assert.equal(f.registry.get('Reject').businessObject.conditionExpression.body, 'amount &lt; 10');
  const changed = await f.xml(); const parsed = await f.moddle.fromXML(changed); assert.equal(parsed.warnings.length, 0); assert.equal(parsed.elementsById.Decision.default.id, 'Accept');
  f.stack.undo(); assert.equal(await f.xml(), before); f.stack.redo(); assert.equal(await f.xml(), changed);
  f.apply('Reject', { isDefault: true }); assert.equal(gateway.default.id, 'Reject'); assert.equal(f.registry.get('Reject').businessObject.conditionExpression, undefined);
  f.stack.undo(); assert.equal(await f.xml(), changed);
});

test('timer kind changes replace only their expression and preserve documentation', async () => {
  const f = await fixture(`<bpmn:intermediateCatchEvent id="Timer"><bpmn:documentation>Timer documentation</bpmn:documentation><bpmn:timerEventDefinition id="TimerDefinition"><bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT30M</bpmn:timeDuration></bpmn:timerEventDefinition></bpmn:intermediateCatchEvent>`);
  const before = await f.xml(); f.apply('Timer', { timerKind: 'timeCycle', timerValue: 'R3/P1D' });
  const parsed = await f.moddle.fromXML(await f.xml()), event = parsed.elementsById.Timer;
  assert.equal(parsed.warnings.length, 0); assert.equal(event.eventDefinitions[0].timeCycle.body, 'R3/P1D'); assert.equal(event.eventDefinitions[0].timeDuration, undefined);
  assert.equal(event.documentation[0].text, 'Timer documentation'); f.stack.undo(); assert.equal(await f.xml(), before);
});

test('events create and reuse shared root references with reversible ownership', async () => {
  const f = await fixture(`<bpmn:intermediateThrowEvent id="Send"><bpmn:signalEventDefinition/></bpmn:intermediateThrowEvent><bpmn:intermediateCatchEvent id="Receive"><bpmn:signalEventDefinition/></bpmn:intermediateCatchEvent>`);
  const before = await f.xml(); f.apply('Send', { referenceName: 'Ready' });
  const ref = f.registry.get('Send').businessObject.eventDefinitions[0].signalRef;
  assert.equal(ref.$parent, f.defs); assert.equal(ref.name, 'Ready');
  const created = await f.xml(); f.stack.undo(); assert.equal(await f.xml(), before); f.stack.redo(); assert.equal(await f.xml(), created);
  f.apply('Receive', { referenceId: ref.id });
  const parsed = await f.moddle.fromXML(await f.xml()); assert.equal(parsed.warnings.length, 0);
  assert.equal(parsed.elementsById.Receive.eventDefinitions[0].signalRef.id, ref.id);
  assert.equal(f.defs.rootElements.filter(root => root.$type === 'bpmn:Signal').length, 1);
});

test('multi-instance direction preserves the rest of existing loop configuration', async () => {
  const f = await fixture(`<bpmn:userTask id="Task"><bpmn:multiInstanceLoopCharacteristics isSequential="false"><bpmn:loopCardinality xsi:type="bpmn:tFormalExpression">5</bpmn:loopCardinality><bpmn:completionCondition xsi:type="bpmn:tFormalExpression">done = true</bpmn:completionCondition></bpmn:multiInstanceLoopCharacteristics></bpmn:userTask>`);
  const before = await f.xml(); f.apply('Task', { loopMode: 'sequential', loopCardinality: '8' });
  const loop = f.registry.get('Task').businessObject.loopCharacteristics;
  assert.equal(loop.isSequential, true); assert.equal(loop.loopCardinality.body, '8'); assert.equal(loop.completionCondition.body, 'done = true');
  f.stack.undo(); assert.equal(await f.xml(), before);
});

test('conditional and boundary event properties use native XML attributes and expressions', async () => {
  const f = await fixture(`<bpmn:task id="Task"/><bpmn:boundaryEvent id="Boundary" attachedToRef="Task"><bpmn:conditionalEventDefinition><bpmn:condition xsi:type="bpmn:tFormalExpression">old</bpmn:condition></bpmn:conditionalEventDefinition></bpmn:boundaryEvent>`);
  f.apply('Boundary', { eventCondition: 'approved = true', eventLanguage: 'feel', interrupting: false });
  const parsed = await f.moddle.fromXML(await f.xml()); assert.equal(parsed.warnings.length, 0);
  const event = parsed.elementsById.Boundary;
  assert.equal(event.cancelActivity, false); assert.equal(event.eventDefinitions[0].condition.body, 'approved = true'); assert.equal(event.eventDefinitions[0].condition.language, 'feel');
});

test('parallel and event-based gateways do not expose conditional or default branches', async () => {
  const f = await fixture(`<bpmn:parallelGateway id="Parallel"/><bpmn:eventBasedGateway id="Events"/><bpmn:task id="Task"/><bpmn:sequenceFlow id="Flow" sourceRef="Parallel" targetRef="Task"/>`);
  for (const id of ['Parallel', 'Events']) assert.deepEqual(Object.keys(f.values(id)), []);
});

test('message, error and escalation definitions retain the correct root reference and code', async () => {
  for (const [type, property, codeProperty] of [['Message', 'messageRef'], ['Error', 'errorRef', 'errorCode'], ['Escalation', 'escalationRef', 'escalationCode']]) {
    const f = await fixture(`<bpmn:endEvent id="Event"><bpmn:${type.toLowerCase()}EventDefinition/></bpmn:endEvent>`);
    f.apply('Event', { referenceName: type + ' test', referenceCode: 'TEST-01' });
    const parsed = await f.moddle.fromXML(await f.xml()); assert.equal(parsed.warnings.length, 0);
    const ref = parsed.elementsById.Event.eventDefinitions[0][property]; assert.equal(ref.$type, 'bpmn:' + type);
    assert.equal(ref.name, type + ' test'); if (codeProperty) assert.equal(ref[codeProperty], 'TEST-01');
  }
});

test('standard loops and collections persist without altering unrelated values', async () => {
  const f = await fixture(`<bpmn:manualTask id="Task" name="Preserved task"/><bpmn:dataObject id="Data"/><bpmn:dataObjectReference id="Reference" dataObjectRef="Data" name="Documents"/>`);
  f.apply('Task', { loopMode: 'standard', loopCondition: 'retry = true' }); f.apply('Reference', { isCollection: true });
  const parsed = await f.moddle.fromXML(await f.xml()); assert.equal(parsed.warnings.length, 0);
  assert.equal(parsed.elementsById.Task.loopCharacteristics.loopCondition.body, 'retry = true');
  assert.equal(parsed.elementsById.Task.name, 'Preserved task'); assert.equal(parsed.elementsById.Reference.name, 'Documents');
  assert.equal(parsed.elementsById.Reference.dataObjectRef.isCollection, true);
});
