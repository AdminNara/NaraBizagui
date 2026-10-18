import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';

// Use the shipped BPMN factory and drop rules, without a browser or UI automation.
const bundled = await build({
  stdin: { contents: `
    export { default as ElementFactory } from 'bpmn-js/lib/features/modeling/ElementFactory.js';
    export { default as BpmnFactory } from 'bpmn-js/lib/features/modeling/BpmnFactory.js';
    export { default as BpmnRules } from 'bpmn-js/lib/features/rules/BpmnRules.js';
    export { BpmnModdle } from 'bpmn-moddle';
    export { Ids } from 'ids';
  `, resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
  bundle: true, platform: 'node', format: 'cjs', write: false
});
const modules = { exports: {} };
new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(createRequire(import.meta.url), modules, modules.exports);
const { ElementFactory, BpmnFactory, BpmnRules, BpmnModdle, Ids } = modules.exports;

test('MCP creates several expanded pools that each accept activities and retain independent processes', async () => {
  const moddle = new BpmnModdle();
  moddle.ids = new Ids([32, 36, 1]);
  const bpmnFactory = new BpmnFactory(moddle);
  const factory = new ElementFactory(bpmnFactory, moddle);
  const root = factory.createRoot({ type: 'bpmn:Collaboration' });
  const definitions = moddle.create('bpmn:Definitions', { targetNamespace: 'https://example.test/bpmn', rootElements: [root.businessObject] });
  const registry = new Map([[root.id, root]]), listeners = new Map();
  const eventBus = { on(event, callback) { listeners.set(event, callback); } };
  const findRoot = element => element.parent ? findRoot(element.parent) : element;
  const context = { ready: true, loadingDiagram: false, saving: false, filePolling: false, dirty: false,
    crypto: { randomUUID }, keepDocumentDraft: null,
    stageName: () => '', roleFor: e => e.parent?.businessObject.name || '', phaseFor: () => '', status() {},
    browserFiles: { name: 'Generic-test.bpmn', handle: null, digest: async xml => createHash('sha256').update(xml).digest('hex') },
    window: { NaraPropertyDraftPending: () => false }
  };
  const services = {
    eventBus, elementFactory: factory, bpmnFactory,
    canvas: { getRootElement: () => root, findRoot },
    rules: { allowed(action, { shape, target }) { assert.equal(action, 'shape.create'); return BpmnRules.prototype.canDrop(shape, target); } },
    modeling: { createShape(shape, position, parent) {
      shape.parent = parent;
      shape.x = position.x - shape.width / 2; shape.y = position.y - shape.height / 2;
      registry.set(shape.id, shape);
      if (shape.type === 'bpmn:Participant') {
        root.businessObject.get('participants').push(shape.businessObject);
        definitions.rootElements.push(shape.businessObject.processRef);
      } else parent.businessObject.processRef.get('flowElements').push(shape.businessObject);
      context.dirty = true; listeners.get('commandStack.changed')(); return shape;
    } },
    selection: { select() {}, get: () => [] },
    elementRegistry: { get: id => registry.get(id), getAll: () => [...registry.values()] },
    commandStack: { canUndo: () => registry.size > 1, canRedo: () => false },
    naraSheets: { list: () => [{ id: root.id, name: 'Generic test' }] }
  };
  context.modeler = { get: service => services[service], saveXML: options => moddle.toXML(definitions, options) };
  vm.runInNewContext(await readFile(new URL('../mcp-editor.js', import.meta.url), 'utf8'), context);
  const editor = context.window.NaraBizaguiEditor, pools = [];
  for (const [index, name] of ['Area A', 'Area B', 'Area C', 'Area D', 'Area E'].entries()) {
    const before = await editor.read();
    const created = await editor.edit({ expectedRevision: before.revision, operation: { type: 'create', bpmnType: 'bpmn:Participant', name, x: 400, y: 200 + index * 350 } });
    const pool = registry.get(created.affectedId);
    assert.ok(pool.businessObject.processRef, 'Every pool needs a process, including pools added to an existing collaboration');
    assert.equal(pool.di.isExpanded, true);
    assert.equal(pool.height, 250);
    pools.push(pool);
    await editor.edit({ expectedRevision: created.revision, operation: { type: 'create', bpmnType: 'bpmn:UserTask', parentId: pool.id, name: 'Generic task', x: 400, y: 200 + index * 350 } });
  }
  assert.equal(new Set(pools.map(pool => pool.businessObject.processRef.id)).size, 5);
  const { xml } = await editor.read({ includeXml: true });
  const parsed = await moddle.fromXML(xml);
  const processes = parsed.rootElement.rootElements.filter(element => element.$type === 'bpmn:Process');
  assert.equal(processes.length, 5);
  assert.ok(processes.every(process => process.flowElements.length === 1));
  assert.equal(parsed.warnings.length, 0);
});
