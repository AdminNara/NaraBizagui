import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const context={window:{}};vm.runInNewContext(await readFile(new URL('../editor-tools.js',import.meta.url),'utf8'),context);
const {directionalTarget}=context.window.NaraConnectionTools;
const node=(id,x,y,width=100,height=80)=>({id,type:'bpmn:Task',x,y,width,height}),source=node('A',300,300);
test('one click finds a valid nearby node in each direction using edge distance',()=>{
 const choices=[node('Left',100,300),node('Right',500,300),node('Top',300,100),node('Bottom',300,500)];
 for(const direction of ['left','right','top','bottom'])assert.equal(directionalTarget(source,direction,choices,()=>true).id,direction[0].toUpperCase()+direction.slice(1));
 const wide=node('Wide',440,300,600);assert.equal(directionalTarget(source,'right',[wide],()=>true),wide);
 const diagonal=node('Diagonal',420,400),aligned=node('Aligned',550,300);assert.equal(directionalTarget(source,'right',[aligned,diagonal],()=>true),diagonal);
});
test('nearest lookup skips invalid, distant, already linked, hidden and container targets',()=>{
 const near=node('Near',450,300),far=node('Far',900,300),linked=node('Linked',420,300),invalid=node('Invalid',430,300),hidden=node('Hidden',410,300),lane={...node('Lane',401,300),type:'bpmn:Lane'};
 const sourceWithLink={...source,outgoing:[{target:linked}]};assert.equal(directionalTarget(sourceWithLink,'right',[far,linked,invalid,hidden,lane,near],(_,t)=>t!==invalid,t=>t!==hidden),near);
 assert.equal(directionalTarget(source,'left',[near,far],()=>true),undefined);
});
