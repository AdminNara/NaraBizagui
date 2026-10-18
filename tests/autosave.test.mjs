import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const schedulerSource = await readFile(new URL('../autoguardado.js',import.meta.url),'utf8');
const filesSource = await readFile(new URL('../archivos.js',import.meta.url),'utf8');
function scheduler() {
  const timers=new Map(),renders=[],s={target:{},document:1,dirty:true,pending:false,busy:false,saving:false};let n=0,writes=0;
  const context={window:{},setTimeout,clearTimeout};vm.runInNewContext(schedulerSource,context);
  const auto=new context.window.NaraAutoSave({state:()=>({...s}),save:async()=>{writes++;s.dirty=false;return true;},render:(...args)=>renders.push(args),setTimer:(fn,delay)=>{timers.set(++n,{fn,delay});return n;},clearTimer:id=>timers.delete(id)});
  return {auto,s,timers,renders,writes:()=>writes};
}
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};

test('autosave waits for an editing pause and coalesces successive changes',async()=>{
  const f=scheduler();f.auto.refresh(true);f.auto.refresh(true);f.auto.refresh(true);
  assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].delay,2000);assert.equal(f.writes(),0);
  await f.auto.flush();assert.equal(f.writes(),1);assert.equal(f.timers.size,0);assert.equal(f.renders.at(-1)[0],'saved');
});
test('an unbound diagram never triggers a picker, download or save',async()=>{
  const f=scheduler();f.s.target=null;f.auto.refresh(true);await f.auto.flush();
  assert.equal(f.writes(),0);assert.equal(f.timers.size,0);assert.equal(f.renders.at(-1)[0],'destination');
});
test('pending properties or a busy editor postpone autosave until ready',async()=>{
  for(const key of ['pending','busy','saving']){
    const f=scheduler();f.s[key]=true;f.auto.refresh(true);await f.auto.flush();assert.equal(f.writes(),0);
    f.s[key]=false;f.auto.refresh();await f.auto.flush();assert.equal(f.writes(),1);
  }
});
test('writes cannot overlap and edits made during a save receive a second save',async()=>{
  const f=scheduler(),pending=deferred();let writes=0;
  f.auto.save=async()=>{writes++;if(writes===1)await pending.promise;else f.s.dirty=false;return true;};
  f.auto.refresh();const first=f.auto.flush();await f.auto.flush();assert.equal(writes,1);
  f.auto.refresh(true);pending.resolve();await first;assert.equal(f.timers.size,1);
  await f.auto.flush();assert.equal(writes,2);assert.equal(f.s.dirty,false);
});
test('pausing autosave cancels a pending write and reenabling schedules it',async()=>{
  const f=scheduler();f.auto.refresh();f.auto.enable(false);await f.auto.flush();assert.equal(f.writes(),0);assert.equal(f.timers.size,0);
  f.auto.enable(true);await f.auto.flush();assert.equal(f.writes(),1);
});
test('conflicts and ambiguous writes stop retries even when more changes occur',async()=>{
  for(const code of ['EXTERNAL_CHANGE','SAVE_UNCERTAIN','SAVE_NOT_VERIFIED']){
    const f=scheduler();let writes=0;f.auto.save=async()=>{writes++;throw Object.assign(new Error('generic failure'),{code});};
    await f.auto.flush();f.auto.refresh(true);f.auto.retrySafe();await f.auto.flush();
    assert.equal(writes,1);assert.equal(f.timers.size,0);assert.equal(f.renders.at(-1)[0],'blocked');
    f.s.document++;f.s.dirty=false;f.auto.refresh();assert.equal(f.auto.blocked,null);
  }
});
test('only known pre-write network failures can resume when connectivity returns',async()=>{
  const f=scheduler();f.auto.refresh();f.auto.block(Object.assign(new Error('offline'),{code:'NETWORK_ERROR'}));f.auto.retrySafe();await f.auto.flush();assert.equal(f.writes(),1);
});
test('safe retries respect Microsoft Retry-After even if connectivity returns earlier',async()=>{
  const f=scheduler();let now=0;f.auto.now=()=>now;f.auto.refresh();f.auto.block(Object.assign(new Error('wait'),{code:'THROTTLED',retryAfterMs:90000}));
  f.auto.retrySafe();await f.auto.flush();assert.equal(f.writes(),0);now=90001;f.auto.retrySafe();await f.auto.flush();assert.equal(f.writes(),1);
});
test('a new draft discovered during serialization defers without a permanent pause',async()=>{
  const f=scheduler();f.auto.save=async()=>{f.s.pending=true;throw Object.assign(new Error('draft'),{code:'AUTO_DEFERRED'});};
  await f.auto.flush();assert.equal(f.auto.blocked,null);assert.equal(f.renders.at(-1)[0],'draft');
});

function localFixture({locks}={}){
  const context={window:{},crypto,TextEncoder,Uint8Array,...(locks?{navigator:{locks}}:{})};vm.runInNewContext(filesSource,context);
  let content='<definitions>base</definitions>',writerOpen=false,writes=0,aborts=0;
  const handle={name:'Generic.bpmn',async getFile(){const text=content;return{name:this.name,text:async()=>text};},async isSameEntry(other){return other===this;},async createWritable(options){assert.equal(options.mode,'exclusive');assert.equal(writerOpen,false);writerOpen=true;let staged;return{async write(xml){staged=xml;},async close(){content=staged;writes++;writerOpen=false;},async abort(){aborts++;writerOpen=false;}};}};
  const files=new context.window.BrowserBpmnFiles();files.validate=()=>{};files.backup=async()=>{};
  return{files,handle,context,change:xml=>content=xml,content:()=>content,writes:()=>writes,aborts:()=>aborts};
}
test('local autosave rereads and verifies the real save adapter before marking content saved',async()=>{
  const f=localFixture();await f.files.attach({handle:f.handle,name:f.handle.name,xml:f.content()});await f.files.save('<definitions>new</definitions>');
  assert.equal(f.content(),'<definitions>new</definitions>');assert.equal(f.files.hash,await f.files.digest(f.content()));assert.equal(f.files.busy,false);
});
test('a changed destination during a save aborts before committing the staged file',async()=>{
  const f=localFixture();await f.files.attach({handle:f.handle,name:f.handle.name,xml:f.content()});let checks=0;
  await assert.rejects(()=>f.files.save('<definitions>new</definitions>',f.handle,{canCommit:()=>++checks<3}),{code:'FILE_CHANGED'});
  assert.equal(f.content(),'<definitions>base</definitions>');assert.equal(f.writes(),0);assert.equal(f.aborts(),1);
});
test('two local sessions sharing a lock cannot overwrite a revision saved by the first',async()=>{
  let tail=Promise.resolve();const locks={request(_name,_options,action){const result=tail.then(action);tail=result.catch(()=>{});return result;}};
  const f=localFixture({locks});await f.files.attach({handle:f.handle,name:f.handle.name,xml:f.content()});
  const other=new f.context.window.BrowserBpmnFiles();other.validate=()=>{};other.backup=async()=>{};await other.attach({handle:f.handle,name:f.handle.name,xml:f.content()});
  const [a,b]=await Promise.allSettled([f.files.save('<definitions>A</definitions>'),other.save('<definitions>B</definitions>')]);
  assert.equal(a.status,'fulfilled');assert.equal(b.status,'rejected');assert.equal(b.reason.code,'EXTERNAL_CHANGE');assert.equal(f.content(),'<definitions>A</definitions>');
});
test('post-write mismatch or a lost close response quarantines the file until reloaded',async()=>{
  const f=localFixture();await f.files.attach({handle:f.handle,name:f.handle.name,xml:f.content()});
  f.handle.createWritable=async()=>({async write(){},async close(){throw new Error('response lost');},async abort(){}});
  await assert.rejects(()=>f.files.save('<definitions>new</definitions>'),{code:'SAVE_UNCERTAIN'});
  await assert.rejects(()=>f.files.save('<definitions>retry</definitions>'),{code:'SAVE_UNCERTAIN'});
  await f.files.attach({handle:f.handle,name:f.handle.name,xml:f.content()});assert.equal(f.files.uncertain,null);
});
