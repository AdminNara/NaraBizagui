import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {BpmnModdle} from 'bpmn-moddle';
const context={DOMParser,XMLSerializer,crypto};
vm.runInNewContext(await readFile(new URL('../erd-model.js',import.meta.url),'utf8'),context);
vm.runInNewContext(await readFile(new URL('../bpmn-merge.js',import.meta.url),'utf8'),context);
const merge=context.NaraBpmnMerge.merge;
const base=`<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:nara="https://naralab.io/schema/diagrams/1" xmlns:foreign="urn:generic" id="Defs" targetNamespace="urn:generic"><bpmn:process id="P"><bpmn:task id="A" name="Base A"><bpmn:documentation>Original documentation</bpmn:documentation><bpmn:outgoing>F</bpmn:outgoing></bpmn:task><bpmn:task id="B" name="Base B"><bpmn:incoming>F</bpmn:incoming></bpmn:task><bpmn:sequenceFlow id="F" sourceRef="A" targetRef="B" /></bpmn:process><bpmndi:BPMNDiagram id="D"><bpmndi:BPMNPlane id="Plane" bpmnElement="P"><bpmndi:BPMNShape id="Shape_A" bpmnElement="A"><dc:Bounds x="0" y="0" width="100" height="80" /></bpmndi:BPMNShape><bpmndi:BPMNShape id="Shape_B" bpmnElement="B"><dc:Bounds x="200" y="0" width="100" height="80" /></bpmndi:BPMNShape><bpmndi:BPMNEdge id="Edge_F" bpmnElement="F"><di:waypoint x="100" y="40"/><di:waypoint x="200" y="40"/></bpmndi:BPMNEdge></bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>`;
const doc=xml=>new DOMParser().parseFromString(xml,'application/xml');
const byId=(xml,id)=>Array.from(doc(xml).getElementsByTagName('*')).find(n=>n.getAttribute('id')===id);
const change=(xml,id,attr,value)=>{const d=doc(xml),n=Array.from(d.getElementsByTagName('*')).find(n=>n.getAttribute('id')===id);n.setAttribute(attr,value);return new XMLSerializer().serializeToString(d);};
async function valid(xml){const result=await new BpmnModdle({nara:context.NaraERModdle}).fromXML(xml);assert.equal(result.warnings.length,0,result.warnings.map(w=>w.message).join('\n'));return result.rootElement;}
test('independent task changes combine and retain documentation, identities and geometry',async()=>{
  const r=merge(base,change(base,'A','name','Local A'),change(base,'B','name','Remote B'));
  assert.equal(r.conflicts.length,0);assert.equal(r.hasLocalChanges,true);assert.equal(byId(r.xml,'A').getAttribute('name'),'Local A');assert.equal(byId(r.xml,'B').getAttribute('name'),'Remote B');
  assert.equal(byId(r.xml,'A').textContent,'Original documentationF');assert.equal(byId(r.xml,'Shape_A').toString(),byId(base,'Shape_A').toString());await valid(r.xml);
});
test('different properties of the same element combine without choosing a whole file',()=>{
  const r=merge(base,change(base,'A','name','New label'),base.replace('Original documentation','Remote documentation'));
  assert.equal(r.conflicts.length,0);assert.equal(byId(r.xml,'A').getAttribute('name'),'New label');assert.match(r.xml,/Remote documentation/);
});
test('same-property disagreement keeps the committed remote value and reports required recovery',()=>{
  const local=change(change(base,'A','name','Local'),'B','name','Independent'),remote=change(base,'A','name','Remote');const r=merge(base,local,remote);
  assert.ok(r.conflicts.length>0);assert.equal(byId(r.xml,'A').getAttribute('name'),'Remote');assert.equal(byId(r.xml,'B').getAttribute('name'),'Independent');
});
test('identical simultaneous edits do not create a conflict or a recovery copy',()=>{
  const xml=change(base,'A','name','Same');const r=merge(base,xml,xml);assert.equal(r.conflicts.length,0);assert.equal(r.hasLocalChanges,false);
});
test('distinct additions are retained; additions reusing an identity require recovery',async()=>{
  const add=(xml,id,label)=>xml.replace('</bpmn:process>',`<bpmn:task id="${id}" name="${label}"/></bpmn:process>`);
  let r=merge(base,add(base,'Local','One'),add(base,'Remote','Two'));assert.equal(r.conflicts.length,0);assert.ok(byId(r.xml,'Local'));assert.ok(byId(r.xml,'Remote'));await valid(r.xml);
  r=merge(base,add(base,'Collision','One'),add(base,'Collision','Two'));assert.ok(r.conflicts.length>0);assert.equal(byId(r.xml,'Collision').getAttribute('name'),'Two');await valid(r.xml);
});
test('concurrent moves never synthesize a third position from separate coordinates',()=>{
  const move=(xml,x,y)=>xml.replace('x="0" y="0"',`x="${x}" y="${y}"`);const r=merge(base,move(base,50,0),move(base,0,90));
  const box=byId(r.xml,'Shape_A').firstChild;assert.equal(box.getAttribute('x'),'0');assert.equal(box.getAttribute('y'),'90');assert.ok(r.conflicts.length>0);
});
test('renaming and moving one element are independent operations',()=>{
  const r=merge(base,change(base,'A','name','Local'),base.replace('x="0" y="0"','x="80" y="20"'));assert.equal(r.conflicts.length,0);assert.equal(byId(r.xml,'A').getAttribute('name'),'Local');assert.equal(byId(r.xml,'Shape_A').firstChild.getAttribute('x'),'80');
});
test('delete versus edit is reported and a remote reference cannot be left dangling',async()=>{
  const clean=base.replace(/<bpmn:task id="A"[\s\S]*?<\/bpmn:task>/,'').replace('<bpmn:incoming>F</bpmn:incoming>','').replace(/<bpmn:sequenceFlow[^>]+\/>/,'').replace(/<bpmndi:BPMNShape id="Shape_A"[\s\S]*?<\/bpmndi:BPMNShape>/,'').replace(/<bpmndi:BPMNEdge[\s\S]*?<\/bpmndi:BPMNEdge>/,'');
  const r=merge(base,clean,change(base,'A','name','Edited'));assert.ok(r.conflicts.length>0);assert.ok(byId(r.xml,'A'));assert.ok(byId(r.xml,'F'));await valid(r.xml);
});
test('formatting alone does not turn independent edits into conflicts',()=>{
  const local=change(base,'A','name','Local').replaceAll('><','>\n  <');const r=merge(base,local,change(base,'B','name','Remote'));assert.equal(r.conflicts.length,0);
});
test('foreign extensions survive unrelated changes and opaque conflicting content is retained remotely',()=>{
  const b=base.replace('<bpmn:task id="A" name="Base A">','<bpmn:task id="A" name="Base A"><bpmn:extensionElements><foreign:payload flag="keep">original</foreign:payload></bpmn:extensionElements>');
  const r=merge(b,change(b,'B','name','Local'),b.replace('>original<','>remote<'));assert.equal(r.conflicts.length,0);assert.match(r.xml,/<foreign:payload flag="keep">remote/);assert.equal(byId(r.xml,'B').getAttribute('name'),'Local');
});
function erFixture(){const m=context.NaraERModel;let model=m.empty('Generic ER');let r=m.apply(model,{type:'erd_table_create',name:'One',x:10,y:20});model=r.model;r=m.apply(model,{type:'erd_table_create',name:'Two',x:400,y:20});model=r.model;const embed=data=>base.replace('<bpmn:process',`<bpmn:extensionElements><nara:entityRelationship id="${data.id}" name="${data.name}" version="1">${JSON.stringify(data).replaceAll('&','&amp;').replaceAll('<','&lt;')}</nara:entityRelationship></bpmn:extensionElements><bpmn:process`);return{model,embed};}
test('ER changes merge by table and field identities and validate the resulting model',async()=>{
  const {model,embed}=erFixture(),m=context.NaraERModel;
  const l=m.apply(model,{type:'erd_table_update',tableId:model.tables[0].id,name:'Local table'}).model;
  const r=m.apply(model,{type:'erd_field_upsert',tableId:model.tables[1].id,name:'Remote field',dataType:'text'}).model;
  const result=merge(embed(model),embed(l),embed(r));assert.equal(result.conflicts.length,0);const merged=JSON.parse(byId(result.xml,model.id).textContent);assert.equal(merged.tables[0].name,'Local table');assert.equal(merged.tables[1].fields.length,2);m.validate(merged);await valid(result.xml);
});
test('incompatible ER edits cannot leave dangling relationships or invalid field names',()=>{
  const {model,embed}=erFixture(),l=structuredClone(model),r=structuredClone(model);l.tables[0].fields.push({...l.tables[0].fields[0],id:'LocalField',name:'same'});r.tables[0].fields.push({...r.tables[0].fields[0],id:'RemoteField',name:'same'});
  const result=merge(embed(model),embed(l),embed(r));assert.ok(result.conflicts.length>0);context.NaraERModel.validate(JSON.parse(byId(result.xml,model.id).textContent));
});
test('DTD, malformed XML and duplicate identities are rejected before merging',()=>{
  assert.throws(()=>merge('<!DOCTYPE x>'+base,base,base),{code:'MERGE_INVALID'});assert.throws(()=>merge(base,base.replace('id="B"','id="A"'),base),{code:'MERGE_INVALID'});assert.throws(()=>merge(base,'<oops/>',base),{code:'MERGE_INVALID'});
});
test('nested subprocesses merge without exponential canonical-string growth',async()=>{
  let inner='<bpmn:task id="Deep" name="Deep base"/>';
  for(let i=0;i<18;i++)inner=`<bpmn:subProcess id="Sub_${i}">${inner}</bpmn:subProcess>`;
  const b=base.replace('</bpmn:process>',inner+'</bpmn:process>');const result=merge(b,change(b,'Deep','name','Deep local'),change(b,'B','name','Remote'));
  assert.equal(result.conflicts.length,0);assert.equal(byId(result.xml,'Deep').getAttribute('name'),'Deep local');assert.equal(byId(result.xml,'B').getAttribute('name'),'Remote');await valid(result.xml);
});
