import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const built=await build({stdin:{contents:`export {BpmnModdle} from 'bpmn-moddle';export {default as EventBus} from 'diagram-js/lib/core/EventBus.js';export {default as CommandStack} from 'diagram-js/lib/command/CommandStack.js';export {default as UpdateRefs} from 'bpmn-js/lib/features/modeling/cmd/UpdateFlowNodeRefsHandler.js';export {default as Resize} from 'diagram-js/lib/features/modeling/cmd/ResizeShapeHandler.js';export {default as Updater} from 'bpmn-js/lib/features/modeling/BpmnUpdater.js';`,resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,platform:'node',format:'cjs',write:false});
const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {BpmnModdle,EventBus,CommandStack,UpdateRefs,Resize,Updater}=module.exports;
const context={window:{}};vm.runInNewContext(await readFile(new URL('../editor-visual.js',import.meta.url),'utf8'),context);
test('native lane references retain order across resizing undo and redo',()=>{
 const m=new BpmnModdle(),a=m.create('bpmn:Task',{id:'A'}),b=m.create('bpmn:Task',{id:'B'}),lane=m.create('bpmn:Lane',{id:'L',flowNodeRef:[a,b]});a.lanes=[lane];b.lanes=[lane];
 const registry={getAll:()=>[{type:'bpmn:Lane',businessObject:lane}]},events=new EventBus(),services={elementRegistry:registry},stack=new CommandStack(events,{instantiate:T=>new T(...T.$inject.map(k=>services[k]))});stack.registerHandler('lane.updateRefs',UpdateRefs);context.window.NaraVisual.installHistoryGuards(events,registry);
 stack.execute('lane.updateRefs',{updates:[{flowNode:a,remove:[lane],add:[lane]}]});assert.deepEqual(lane.flowNodeRef,[b,a]);stack.undo();assert.deepEqual(lane.flowNodeRef,[a,b]);stack.redo();assert.deepEqual(lane.flowNodeRef,[b,a]);stack.undo();assert.deepEqual(lane.flowNodeRef,[a,b]);
});

test('delete cleanup uses the native moddle command before removal, including imported lanes without inverse node refs',async()=>{
 const m=new BpmnModdle(),defs=m.create('bpmn:Definitions',{id:'Defs',targetNamespace:'https://example.test'}),process=m.create('bpmn:Process',{id:'P'}),lane=m.create('bpmn:Lane',{id:'L'}),laneSet=m.create('bpmn:LaneSet',{id:'LS',lanes:[lane]}),node=m.create('bpmn:StartEvent',{id:'Start'});defs.rootElements=[process];process.$parent=defs;process.laneSets=[laneSet];laneSet.$parent=process;lane.$parent=laneSet;process.flowElements=[node];node.$parent=process;lane.flowNodeRef=[node];
 const events=new EventBus(),calls=[],registry={getAll:()=>[{id:'L',type:'bpmn:Lane',businessObject:lane}]};context.window.NaraVisual.installHistoryGuards(events,registry,{updateModdleProperties(element,bo,values){calls.push({element,bo,values});Object.assign(bo,values);}});
 events.fire('commandStack.shape.delete.preExecute',{context:{shape:{id:'Start',businessObject:node}}});assert.equal(calls.length,1);assert.equal(calls[0].bo,lane);assert.deepEqual(lane.flowNodeRef,[]);
 process.flowElements=[];const xml=(await m.toXML(defs)).xml,roundtrip=await m.fromXML(xml);assert.deepEqual(roundtrip.warnings,[]);assert.ok(!xml.includes('>Start</'));
});
test('native external label resize undo removes a newly materialized DI label after shape.changed',()=>{
 const m=new BpmnModdle(),events=new EventBus(),bo=m.create('bpmn:DataObjectReference',{id:'Doc',name:'Workbook'}),di=m.create('bpmndi:BPMNShape',{id:'Doc_di',bpmnElement:bo}),owner={id:'Doc',type:'bpmn:DataObjectReference',di,businessObject:bo},label={id:'Doc_label',type:'label',labelTarget:owner,di,businessObject:bo,x:100,y:100,width:90,height:30};owner.label=label;
 const factory={create:(t,a)=>m.create(t,a),createDiBounds:()=>m.create('dc:Bounds'),createDiLabel:()=>m.create('bpmndi:BPMNLabel')};new Updater(events,factory,{});
 events.on('elements.changed',({elements})=>elements.forEach(element=>events.fire('shape.changed',{element})));
 const registry={getAll:()=>[owner,label]},stack=new CommandStack(events,{instantiate:T=>new T({})});stack.registerHandler('shape.resize',Resize);context.window.NaraVisual.installHistoryGuards(events,registry);
 stack.execute('shape.resize',{shape:label,newBounds:{x:100,y:100,width:120,height:40},hints:{layout:false}});assert.ok(di.label);stack.undo();assert.equal(di.label,undefined);stack.redo();assert.ok(di.label);assert.equal(di.label.bounds.width,120);
});
