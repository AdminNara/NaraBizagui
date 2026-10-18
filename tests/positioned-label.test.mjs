import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

test('explicit label placement survives the native bottom-anchored text height adjustment',async()=>{
 const handlers=new Map(),stack={registerHandler:(name,handler)=>handlers.set(name,handler)};
 const context={crypto:{randomUUID:()=> 'revision'},window:{},modeler:{get:name=>name==='commandStack'?stack:{on(){}}}};
 vm.runInNewContext(await readFile(new URL('../editor-readiness.js',import.meta.url),'utf8'),context);
 vm.runInNewContext(await readFile(new URL('../mcp-editor.js',import.meta.url),'utf8'),context);
 const Handler=handlers.get('nara.mcp.positionedLabel');assert.ok(Handler);
 const label={x:100,y:300,width:90,height:34},element={label},bounds={x:160,y:80,width:140,height:40},commands=[];
 const modeling={updateLabel(target,text,next){commands.push('label');const bottom=label.y+label.height;Object.assign(label,{x:next.x,y:bottom-17,width:next.width,height:17});},moveShape(shape,delta){commands.push('move');shape.x+=delta.x;shape.y+=delta.y;}};
 new Handler(modeling).preExecute({element,text:'Caption',bounds});
 assert.deepEqual(label,{x:160,y:80,width:140,height:17});
 assert.deepEqual(commands,['label','move']);
});

test('native internal label Undo preserves absent DI and an existing styled label across Redo',async()=>{
 const built=await build({stdin:{contents:`export {BpmnModdle} from 'bpmn-moddle'; export {default as EventBus} from 'diagram-js/lib/core/EventBus.js'; export {default as CommandStack} from 'diagram-js/lib/command/CommandStack.js'; export {default as BpmnUpdater} from 'bpmn-js/lib/features/modeling/BpmnUpdater.js'; export {default as UpdateLabel} from 'bpmn-js/lib/features/label-editing/cmd/UpdateLabelHandler.js';`,resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,platform:'node',format:'cjs',write:false});
 const m={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const {BpmnModdle,EventBus,CommandStack,BpmnUpdater,UpdateLabel}=m.exports;
 for(const styled of [false,true]){
  const moddle=new BpmnModdle(),bo=moddle.create('bpmn:Task',{id:'Task',name:'Original'}),di=moddle.create('bpmndi:BPMNShape',{id:'Task_di',bpmnElement:bo});
  if(styled)di.label=moddle.create('bpmndi:BPMNLabel',{labelStyle:moddle.create('bpmndi:BPMNLabelStyle',{font:moddle.create('dc:Font',{name:'Arial',size:14})})});
  const original=di.label,element={id:'Task',type:'bpmn:Task',businessObject:bo,di},eventBus=new EventBus(),factory={create:(type,attrs)=>moddle.create(type,attrs)},modeling={};
  new BpmnUpdater(eventBus,factory,{});
  const services={eventBus,modeling,textRenderer:{},bpmnFactory:factory},stack=new CommandStack(eventBus,{instantiate:Type=>new Type(...(Type.$inject||[]).map(k=>services[k]))});
  stack.registerHandler('element.updateLabel',UpdateLabel);
  const modeler={get:key=>key==='commandStack'?stack:key==='eventBus'?eventBus:{}};
  const c={modeler,window:{},crypto:{randomUUID:()=> 'revision'}};
  vm.runInNewContext(await readFile(new URL('../editor-readiness.js',import.meta.url),'utf8'),c);
  vm.runInNewContext(await readFile(new URL('../mcp-editor.js',import.meta.url),'utf8'),c);
  const before=(await moddle.toXML(di,{format:true})).xml;
  stack.execute('element.updateLabel',{element,newLabel:styled?'':'Renamed'});const applied=(await moddle.toXML(di,{format:true})).xml;
  stack.undo();assert.equal(bo.name,'Original');assert.equal(di.label,original);assert.equal((await moddle.toXML(di,{format:true})).xml,before);
  stack.redo();assert.equal((await moddle.toXML(di,{format:true})).xml,applied);
  stack.undo();assert.equal((await moddle.toXML(di,{format:true})).xml,before);
 }
});
