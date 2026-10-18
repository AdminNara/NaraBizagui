import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import vm from 'node:vm';
const source=await readFile(new URL('../mcp-editor.js',import.meta.url),'utf8');
function fixture(){
 const callbacks=new Map(),root={id:'Process',type:'bpmn:Process',businessObject:{$type:'bpmn:Process',name:''}},task={id:'Task',type:'bpmn:Task',businessObject:{$type:'bpmn:Task',name:'Original'}};task.parent=root;
 const counts={serialized:0,digested:0,fit:0,edits:0};
 const context={ready:true,loadingDiagram:false,saving:false,filePolling:false,dirty:false,setTimeout,crypto:{randomUUID},stageName:()=>'',roleFor:()=>'',phaseFor:()=>'',keepDocumentDraft:null,status(){},fit(){counts.fit++;},window:{NaraPropertyDraftPending:()=>false},browserFiles:{name:'Generic.bpmn',handle:null,async digest(xml){counts.digested++;return createHash('sha256').update(xml).digest('hex');}}};
 const services={eventBus:{on:(key,fn)=>callbacks.set(key,fn)},commandStack:{registerHandler(){},canUndo:()=>false,canRedo:()=>false},elementRegistry:{get:id=>id==='Task'?task:root,getAll:()=>[root,task]},canvas:{getRootElement:()=>root,findRoot:e=>e.parent||e},naraSheets:{list:()=>[{id:'Process',name:'Generic'}]},selection:{get:()=>[],select(){}},modeling:{updateLabel(e,text){e.businessObject.name=text;counts.edits++;context.dirty=true;callbacks.get('commandStack.changed')();}}};
 context.modeler={get:key=>services[key],async saveXML(){counts.serialized++;return{xml:'<model name="'+task.businessObject.name+'"/>'};}};
 vm.runInNewContext(source,context);return{context,editor:context.window.NaraBizaguiEditor,counts,task,services};
}
test('reads remain available during autosave and unchanged revisions serialize only once',async()=>{
 const f=fixture();f.context.saving=true;
 const first=await f.editor.read(),second=await f.editor.read({detail:'summary'});
 assert.equal(first.autoSave.running,true);assert.equal(first.readiness.canEdit,false);assert.equal(first.readiness.busyReason,'saving');
 assert.equal(second.revision,first.revision);assert.equal(second.elementsOmitted,true);assert.equal('elements'in second,false);assert.equal(second.totalElements,2);
 assert.equal(f.counts.serialized,1);assert.equal(f.counts.digested,1);
});
test('an edit waits for autosave, applies once and invalidates the cached serialization',async()=>{
 const f=fixture(),before=await f.editor.read();f.context.saving=true;setTimeout(()=>{f.context.saving=false;},10);
 const result=await f.editor.edit({expectedRevision:before.revision,operation:{type:'label',elementId:'Task',text:'Updated'}});
 assert.equal(result.applied,true);assert.equal(f.task.businessObject.name,'Updated');assert.equal(f.counts.edits,1);assert.equal(f.counts.serialized,2);
});
test('waiting for autosave never authorizes overwriting a newer manual revision',async()=>{
 const f=fixture(),before=await f.editor.read();f.context.saving=true;
 setTimeout(()=>{f.services.modeling.updateLabel(f.task,'Manual');f.context.saving=false;},10);
 await assert.rejects(f.editor.edit({expectedRevision:before.revision,operation:{type:'label',elementId:'Task',text:'Stale'}}),{code:'REVISION_CONFLICT'});
 assert.equal(f.task.businessObject.name,'Manual');assert.equal(f.counts.edits,1);
});
test('fit is a view operation and does not change revision, content or dirty state',async()=>{
 const f=fixture(),before=await f.editor.read();const result=await f.editor.edit({expectedRevision:before.revision,operation:{type:'fit'}});
 assert.equal(result.viewOnly,true);assert.equal(result.revision,before.revision);assert.equal(result.sha256,before.sha256);assert.equal(result.dirty,false);assert.equal(f.counts.fit,1);assert.equal(f.counts.edits,0);
});
test('a pending property draft is rejected without silently applying it',async()=>{
 const f=fixture(),before=await f.editor.read();f.context.window.NaraPropertyDraftPending=()=>true;
 await assert.rejects(f.editor.edit({expectedRevision:before.revision,operation:{type:'label',elementId:'Task',text:'Overwrite'}}),{code:'FORM_PENDING'});assert.equal(f.counts.edits,0);
});
