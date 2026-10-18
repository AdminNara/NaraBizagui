import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {BpmnModdle} from 'bpmn-moddle';
const source=await readFile(new URL('../modelador.js',import.meta.url),'utf8');
const start=source.indexOf('async function combineBrowserSource('),end=source.indexOf('\nasync function pollBrowserFile(',start);
const filesCode=await readFile(new URL('../archivos.js',import.meta.url),'utf8'),mergeCode=await readFile(new URL('../bpmn-merge.js',import.meta.url),'utf8');
const xml=(a='A',b='B')=>`<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="urn:generic"><process id="P"><task id="A" name="${a}"/><task id="B" name="${b}"/></process></definitions>`;
const defer=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
async function fixture({conflict=false}={}){
  let editor=xml('Local A'),remote=conflict?xml('Remote A','Remote B'):xml('A','Remote B'),copies=0,imports=0,writes=0,copyXml,activeAccount=true;
  const handle={name:'Generic.bpmn',storageKind:'microsoft',etag:'base',accountId:'generic',driveId:'drive',itemId:'file',store:{assertAccount(){if(!activeAccount)throw Object.assign(new Error('account changed'),{code:'ACCOUNT_CHANGED'});}},async recoveryCopy(value){copies++;copyXml=value;return{name:'Generic - recuperado.bpmn'};},async isSameEntry(other){return other===this;},async getFile(){this.etag=remote===xml()?'base':'remote';const snapshot=remote;return{name:this.name,text:async()=>snapshot};},async createWritable(){let content;return{async write(value){content=value;},async close(){remote=content;writes++;},async abort(){}};}};
  const elements=new Map(),byId=id=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',open:false});return elements.get(id);};
  const c={DOMParser,XMLSerializer,crypto,TextEncoder,Uint8Array,window:{},ready:true,dirty:true,saving:false,loadingDiagram:false,browserDocumentVersion:1,editSequence:1,autoSavePointer:false,syncNoticeHandle:null,byId,browserEditPending:()=>false,browserFileContext(){},status(message){c.message=message;},setDirty(value){c.dirty=value;},modeler:{saveXML:async()=>({xml:editor}),get:()=>new BpmnModdle()}};
  vm.createContext(c);vm.runInContext(filesCode, c);vm.runInContext(mergeCode,c);c.window.NaraBpmnMerge=c.NaraBpmnMerge;
  c.browserFiles=new c.window.BrowserBpmnFiles();c.browserFiles.validate=()=>{};await c.browserFiles.attach({handle,name:handle.name,xml:xml()});
  c.acceptBrowserSource=async(source,guard,_view,savedSource)=>{if(!guard())return false;imports++;editor=source.xml;c.browserDocumentVersion++;await c.browserFiles.attach(savedSource);return true;};
  vm.runInContext(source.slice(start,end),c);
  const remoteSource=async()=>c.browserFiles.read();
  return{c,handle,remoteSource,editor:()=>editor,remote:()=>remote,copies:()=>copies,copyXml:()=>copyXml,imports:()=>imports,writes:()=>writes,disconnect:()=>activeAccount=false};
}
test('a combined document keeps the remote save base and then persists both edits through the real adapter',async()=>{
  const f=await fixture();assert.equal(await f.c.combineBrowserSource(await f.remoteSource()),true);
  assert.match(f.editor(),/Local A/);assert.match(f.editor(),/Remote B/);assert.equal(f.c.dirty,true);assert.equal(f.c.browserFiles.baseXml,xml('A','Remote B'));assert.equal(f.copies(),0);
  await f.c.browserFiles.save(f.editor(),f.handle);assert.match(f.remote(),/Local A/);assert.match(f.remote(),/Remote B/);assert.equal(f.c.browserFiles.baseXml,f.editor());assert.equal(f.writes(),1);
});
test('ambiguous values require a verified recovery before import and retain compatible changes',async()=>{
  const f=await fixture({conflict:true});assert.equal(await f.c.combineBrowserSource(await f.remoteSource()),true);assert.equal(f.copies(),1);assert.equal(f.copyXml(),xml('Local A'));
  assert.match(f.editor(),/Remote A/);assert.match(f.editor(),/Remote B/);assert.equal(f.c.byId('syncNotice').hidden,false);assert.match(f.c.byId('syncNoticeText').textContent,/recuperado/);
});
test('a failed recovery never replaces the local editor or advances its save base',async()=>{
  const f=await fixture({conflict:true}),before=f.editor(),remote=await f.remoteSource();f.handle.recoveryCopy=async()=>{throw Object.assign(new Error('denied'),{code:'MICROSOFT_PERMISSION'});};
  await assert.rejects(()=>f.c.combineBrowserSource(remote),{code:'MICROSOFT_PERMISSION'});
  assert.equal(f.editor(),before);assert.equal(f.imports(),0);assert.equal(f.c.browserFiles.baseXml,xml());assert.equal(f.c.dirty,true);
});
test('a new edit while a recovery is being created postpones import and preserves the newer local work',async()=>{
  const f=await fixture({conflict:true}),pending=defer(),remote=await f.remoteSource();f.handle.recoveryCopy=()=>pending.promise;
  const task=f.c.combineBrowserSource(remote);await new Promise(resolve=>setImmediate(resolve));f.c.editSequence++;pending.resolve({name:'recovered.bpmn'});
  assert.equal(await task,false);assert.equal(f.imports(),0);assert.equal(f.c.dirty,true);assert.equal(f.c.browserFiles.baseXml,xml());
});
test('drafts and account changes cannot be imported or rebound by synchronization',async()=>{
  let f=await fixture();f.c.browserEditPending=()=>true;assert.equal(await f.c.combineBrowserSource(await f.remoteSource()),false);assert.equal(f.imports(),0);
  f=await fixture();const accept=f.c.acceptBrowserSource,remote=await f.remoteSource();f.c.acceptBrowserSource=async(...args)=>{const result=await accept(...args);f.disconnect();return result;};
  await assert.rejects(()=>f.c.combineBrowserSource(remote),{code:'ACCOUNT_CHANGED'});
  assert.equal(f.c.browserFiles.handle,null);assert.equal(f.c.dirty,true);assert.equal(f.c.loadingDiagram,false);
});
test('a verified recovery is reused and an uncertain recovery is not blindly recreated',async()=>{
  let f=await fixture();await f.c.browserFiles.preserveRecovery(f.editor(),f.handle);await f.c.browserFiles.preserveRecovery(f.editor(),f.handle);assert.equal(f.copies(),1);
  f=await fixture();let attempts=0;f.handle.recoveryCopy=async()=>{attempts++;throw Object.assign(new Error('unknown response'),{code:'SAVE_UNCERTAIN'});};
  for(let n=0;n<2;n++)await assert.rejects(()=>f.c.browserFiles.preserveRecovery(f.editor(),f.handle),{code:'SAVE_UNCERTAIN'});
  assert.equal(attempts,1);assert.equal(f.c.dirty,true);
});
