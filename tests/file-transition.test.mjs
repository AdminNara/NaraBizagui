import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../modelador.js',import.meta.url),'utf8');
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function fixture(){
  const pending=defer();let attaches=0,reads=0;const c={ready:true,saving:false,loadingDiagram:false,filePolling:false,dirty:false,browserDocumentVersion:1,window:{},status(){},byId:()=>({hidden:true}),browserFileContext(){},openDiagram:async()=>{},modeler:{createDiagram:()=>pending.promise,saveXML:async()=>({xml:'<definitions/>'}),get:name=>name==='elementRegistry'?{getAll:()=>[]}:{removeElements(){}}},browserFiles:{clearCurrent(){},handle:{name:'Previous.bpmn'},name:'Previous.bpmn',async attach(value){attaches++;this.handle=value.handle;this.name=value.name;},async read(){reads++;return{};}},acceptBrowserSource:async()=>{}};
  const newStart=source.indexOf('async function newBrowserDiagram('),newEnd=source.indexOf('\nasync function acceptBrowserSource(',newStart);
  const reloadStart=source.indexOf('async function reloadBrowserFile('),reloadEnd=source.indexOf('\nfunction browserEditPending(',reloadStart);
  vm.createContext(c);vm.runInContext(source.slice(newStart,newEnd)+'\n'+source.slice(reloadStart,reloadEnd),c);
  return{c,pending,attaches:()=>attaches,reads:()=>reads};
}
test('creating a new document remains busy until the previous destination has been detached',async()=>{
  const f=fixture(),task=f.c.newBrowserDiagram();assert.equal(f.c.loadingDiagram,true);assert.ok(f.c.browserFiles.handle);
  await f.c.newBrowserDiagram();assert.equal(f.attaches(),0);f.pending.resolve();await task;
  assert.equal(f.c.browserFiles.handle,null);assert.equal(f.c.loadingDiagram,false);assert.equal(f.attaches(),1);
});
test('a failed new-document import cannot leave an eligible autosave against the old destination',async()=>{
  const f=fixture(),task=f.c.newBrowserDiagram();f.pending.reject(new Error('generic import failure'));await assert.rejects(task);
  assert.equal(f.c.ready,false);assert.equal(f.c.window.diagramReady,false);assert.equal(f.c.loadingDiagram,false);assert.equal(f.attaches(),0);
});
test('reload cannot replace the current context while a save or a file operation is running',async()=>{
  for(const key of ['saving','loadingDiagram','filePolling']){const f=fixture();f.c[key]=true;await f.c.reloadBrowserFile();assert.equal(f.reads(),0,key);}
});

test('a failed diagram opening rejects instead of being reported as a successful empty startup',async()=>{
 const c={ready:true,window:{},status:message=>{c.message=message;},modeler:{importXML:async()=>{throw Error('Native import failed');}}};
 vm.createContext(c);const start=source.indexOf('async function openDiagram('),end=source.indexOf('\nwindow.openDiagram',start);vm.runInContext(source.slice(start,end),c);
 await assert.rejects(c.openDiagram('<invalid/>'),/Native import failed/);assert.equal(c.ready,false);assert.equal(c.window.diagramError,'Native import failed');assert.match(c.message,/No se pudo abrir/);
});

test('a rejected source import restores the prior model and dirty state without binding a new destination',async()=>{
 const imports=[];let attaches=0;const c={ready:true,dirty:true,browserDocumentVersion:1,window:{},browserFiles:{validate(){},attach:async()=>{attaches++;}},modeler:{saveXML:async()=>({xml:'previous'}),get:()=>({})},openDiagram:async xml=>{imports.push(xml);if(xml==='rejected')throw Error('Bad import');},setDirty:value=>{c.dirty=value;}};
 vm.createContext(c);const start=source.indexOf('async function acceptBrowserSource('),end=source.indexOf('\nasync function openBrowserFile(',start);vm.runInContext(source.slice(start,end),c);
 await assert.rejects(c.acceptBrowserSource({xml:'rejected'}),/Bad import/);assert.deepEqual(imports,['rejected','previous']);assert.equal(c.dirty,true);assert.equal(attaches,0);
});
