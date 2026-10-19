import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import {BpmnModdle} from 'bpmn-moddle';

const context={crypto:{randomUUID}};
vm.runInNewContext(await readFile(new URL('../erd-model.js',import.meta.url),'utf8'),context);
const M=context.NaraERModel;
function fixture(){let model=M.empty('Datos genéricos');let r=M.apply(model,{type:'erd_table_create',name:'Origen',x:10,y:20});model=r.model;const source=r.affectedId;r=M.apply(model,{type:'erd_table_create',name:'Destino',x:450,y:120,fields:[{name:'id',primaryKey:true},{name:'origen_id',dataType:'bigint'}]});model=r.model;return{model,source,target:r.affectedId};}
test('duplicating an ER sheet remaps all IDs and field relationships without altering its source',()=>{
  let {model,source,target}=fixture();model=M.apply(model,{type:'erd_relationship_create',sourceTableId:source,sourceFieldId:model.tables[0].fields[0].id,targetTableId:target,targetFieldId:model.tables[1].fields[1].id,sourceCardinality:'1',targetCardinality:'N'}).model;
  const before=JSON.stringify(model),copy=M.duplicate(model,'Copia'),oldIds=new Set([model.id,...model.tables.flatMap(t=>[t.id,...t.fields.map(f=>f.id)]),...model.relationships.map(r=>r.id)]);
  assert.equal(JSON.stringify(model),before);assert.equal(copy.name,'Copia');assert.ok([copy.id,...copy.tables.flatMap(t=>[t.id,...t.fields.map(f=>f.id)]),...copy.relationships.map(r=>r.id)].every(id=>!oldIds.has(id)));
  assert.equal(copy.relationships[0].sourceTableId,copy.tables[0].id);assert.equal(copy.relationships[0].targetFieldId,copy.tables[1].fields[1].id);assert.equal(copy.tables[0].x,model.tables[0].x);assert.equal(copy.tables[1].fields[1].foreignKey,true);assert.equal(M.validate(copy),copy);
});

test('ER edits preserve stable IDs and delete only relations attached to the removed field',()=>{
  let {model,source,target}=fixture();const original=JSON.stringify(model),sourceField=M.table(model,source).fields[0].id,targetField=M.table(model,target).fields[1].id;
  let result=M.apply(model,{type:'erd_relationship_create',sourceTableId:source,sourceFieldId:sourceField,targetTableId:target,targetFieldId:targetField,sourceCardinality:'1',targetCardinality:'N'});
  assert.equal(JSON.stringify(model),original,'Applying an edit must not mutate its undo snapshot');
  model=result.model;assert.equal(M.field(model,target,targetField).foreignKey,true);
  const relationId=result.affectedId;
  model=M.apply(model,{type:'erd_table_update',tableId:source,name:'Origen renombrado',x:70}).model;
  assert.equal(model.relationships[0].id,relationId);assert.equal(model.relationships[0].sourceFieldId,sourceField);
  const deleted=M.apply(model,{type:'erd_field_delete',tableId:target,fieldId:targetField}).model;
  assert.equal(deleted.relationships.length,0);assert.equal(M.table(deleted,target).fields[0].id,M.table(model,target).fields[0].id);
  assert.equal(model.relationships.length,1,'Snapshot retains both field and relationship for undo');
});

test('ER rejects dangling endpoints, duplicate field names and invalid geometry atomically',()=>{
  const {model,source,target}=fixture(),before=JSON.stringify(model);
  assert.throws(()=>M.apply(model,{type:'erd_relationship_create',sourceTableId:source,sourceFieldId:'missing',targetTableId:target,targetFieldId:M.table(model,target).fields[0].id}),/No existe ese campo/);
  assert.throws(()=>M.apply(model,{type:'erd_field_upsert',tableId:source,name:'ID',dataType:'integer'}),/únicos/);
  assert.throws(()=>M.apply(model,{type:'erd_table_update',tableId:source,width:10}),/200–1000/);
  assert.equal(JSON.stringify(model),before);
});

test('BPMN extension roundtrip preserves ER, foreign extensions, process IDs, documentation and geometry',async()=>{
  const moddle=new BpmnModdle({nara:context.NaraERModdle});
  const {model}=fixture();model.tables[0].name='Nombre <demo> & "texto"';
  const task=moddle.create('bpmn:Task',{id:'Task_original',name:'Actividad genérica',documentation:[moddle.create('bpmn:Documentation',{text:'Descripción original'})]});
  const process=moddle.create('bpmn:Process',{id:'Process_original',flowElements:[task]});
  const shape=moddle.create('bpmndi:BPMNShape',{id:'Task_original_di',bpmnElement:task,bounds:moddle.create('dc:Bounds',{x:123,y:234,width:100,height:80})});
  const diagram=moddle.create('bpmndi:BPMNDiagram',{id:'Diagram_original',plane:moddle.create('bpmndi:BPMNPlane',{id:'Plane_original',bpmnElement:process,planeElement:[shape]})});
  const foreign=moddle.createAny('other:Review','https://example.test/other',{state:'keep', $body:'Valor ajeno que se conserva'});
  const er=moddle.create('nara:EntityRelationship',{id:model.id,name:model.name,version:'1',json:JSON.stringify(model)});
  const definitions=moddle.create('bpmn:Definitions',{id:'Definitions_original',targetNamespace:'https://example.test/bpmn',rootElements:[process],diagrams:[diagram],extensionElements:moddle.create('bpmn:ExtensionElements',{values:[foreign,er]})});
  const {xml}=await moddle.toXML(definitions,{format:true});
  const parsed=await moddle.fromXML(xml);assert.equal(parsed.warnings.length,0);
  const result=parsed.rootElement;
  assert.equal(result.rootElements[0].flowElements[0].id,'Task_original');assert.equal(result.rootElements[0].flowElements[0].documentation[0].text,'Descripción original');
  assert.equal(result.diagrams[0].plane.planeElement[0].bounds.x,123);assert.equal(result.diagrams[0].plane.planeElement[0].bounds.y,234);
  assert.equal(result.extensionElements.values[0].state,'keep');assert.equal(result.extensionElements.values[0].$body,'Valor ajeno que se conserva');
  assert.equal(result.extensionElements.values[1].json,JSON.stringify(model));
  const plain=new BpmnModdle();const generic=await plain.fromXML(xml);assert.equal(generic.warnings.length,0,'A modeler without the Nara descriptor can retain the extension as generic XML');
  const written=await plain.toXML(generic.rootElement);const reopened=await moddle.fromXML(written.xml);assert.equal(reopened.rootElement.extensionElements.values[1].json,JSON.stringify(model));
});
test('field order and visual style are reversible values with stable endpoints',()=>{
  let {model,source,target}=fixture();const before=JSON.stringify(model),fields=M.table(model,target).fields.map(f=>f.id);
  model=M.apply(model,{type:'erd_field_move',tableId:target,fieldId:fields[1],direction:'up'}).model;
  assert.equal(M.table(model,target).fields[0].id,fields[1]);
  model=M.apply(model,{type:'style',elementId:source,style:{fill:'#fff2cc',stroke:'#123456',fontSize:18,bold:true}}).model;
  assert.equal(M.table(model,source).style.fill,'#fff2cc');assert.equal(M.table(model,source).x,10);
  assert.equal(M.table(JSON.parse(before),target).fields[0].id,fields[0]);
  assert.throws(()=>M.apply(model,{type:'style',elementId:source,style:{fill:'url(https://invalid.test/)'}}),/hexadecimal/);
  assert.throws(()=>M.apply(model,{type:'style',elementId:source,style:{fontSize:200}}),/rango/);
});
