import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../modelador.js',import.meta.url),'utf8');
const start=source.indexOf('async function pollBrowserFile('),end=source.indexOf('\nasync function showHistory(',start);
const defer=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
function fixture(){
  let reads=0,imports=0,conflicts=0,combinations=0,now=100000;
  const handle={storageKind:'microsoft'},context={browserFiles:{handle,hash:'base',async read(options){assert.equal(options.onlyChanged,true);reads++;return{hash:'remote'};}},filePolling:false,loadingDiagram:false,saving:false,ready:true,autoSavePointer:false,browserDocumentVersion:1,editSequence:0,dirty:false,document:{visibilityState:'visible'},window:{NaraPropertyDraftPending:()=>false},modeler:{get:()=>({isActive:()=>false})},Date:{now:()=>now},status(message){context.message=message;},showExternalChange(){conflicts++;},async acceptBrowserSource(_source,guard){if(!guard())return false;imports++;return true;}};
  context.browserEditPending=()=>context.window.NaraPropertyDraftPending()||context.autoSavePointer||context.modeler.get().isActive();
  context.combineBrowserSource=async()=>{combinations++;return true;};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  return{c:context,reads:()=>reads,imports:()=>imports,conflicts:()=>conflicts,combinations:()=>combinations,advance:ms=>now+=ms};
}
test('remote changes refresh a clean editor; unchanged metadata never imports again',async()=>{
  const f=fixture();await f.c.pollBrowserFile();assert.equal(f.imports(),1);assert.match(f.c.message,/actualizados automáticamente/);
  f.c.browserFiles.read=async()=>null;f.advance(16000);await f.c.pollBrowserFile();assert.equal(f.imports(),1);assert.equal(f.conflicts(),0);
});
test('dirty models combine automatically and unapplied drafts defer without a choice prompt',async()=>{
  for(const kind of ['dirty','draft']){const f=fixture();if(kind==='dirty')f.c.dirty=true;else f.c.window.NaraPropertyDraftPending=()=>true;
    await f.c.pollBrowserFile();assert.equal(f.imports(),0);assert.equal(f.conflicts(),0);assert.equal(f.combinations(),kind==='dirty'?1:0);}
});
test('a change of file or account while checking cannot replace the new document',async()=>{
  const f=fixture(),pending=defer();f.c.browserFiles.read=()=>pending.promise;const task=f.c.pollBrowserFile();f.c.browserFiles.handle={};f.c.browserDocumentVersion++;
  pending.resolve({hash:'remote'});await task;assert.equal(f.imports(),0);assert.equal(f.conflicts(),0);
});
test('edits begun during download or serialization prevent replacement by a late response',async()=>{
  for(const phase of ['download','serialization']){
    const f=fixture(),pending=defer();
    if(phase==='download')f.c.browserFiles.read=()=>pending.promise;
    else f.c.acceptBrowserSource=async(_source,guard)=>{await pending.promise;assert.equal(guard(),false);return false;};
    const task=f.c.pollBrowserFile();await Promise.resolve();f.c.editSequence++;f.c.dirty=true;pending.resolve({hash:'remote'});await task;
    assert.equal(f.imports(),0);assert.equal(f.conflicts(),0);
  }
});
test('polls do not overlap and pause in hidden tabs, gestures, inline editors and dialogs',async()=>{
  for(const key of ['filePolling','loadingDiagram','saving','autoSavePointer','hidden','inline','dialog']){
    const f=fixture();if(key==='hidden')f.c.document.visibilityState='hidden';else if(key==='inline')f.c.modeler.get=()=>({isActive:()=>true});else if(key==='dialog')f.c.window.NaraMicrosoftDialogOpen=true;else f.c[key]=true;
    await f.c.pollBrowserFile();assert.equal(f.reads(),0,key);
  }
  const f=fixture(),pending=defer();f.c.browserFiles.read=()=>pending.promise;const task=f.c.pollBrowserFile();await f.c.pollBrowserFile();pending.resolve(null);await task;assert.equal(f.c.filePolling,false);
});
test('checks are spaced and Microsoft Retry-After is respected before another request',async()=>{
  const f=fixture();await f.c.pollBrowserFile();await f.c.pollBrowserFile();assert.equal(f.reads(),1);
  f.advance(16000);let reads=0;f.c.browserFiles.read=async()=>{reads++;throw Object.assign(new Error('throttled'),{code:'THROTTLED',retryAfterMs:90000});};
  await f.c.pollBrowserFile();f.advance(60000);await f.c.pollBrowserFile();assert.equal(reads,1);f.advance(31000);await f.c.pollBrowserFile();assert.equal(reads,2);
});
