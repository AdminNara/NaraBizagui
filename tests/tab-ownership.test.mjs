import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../tab-ownership.js',import.meta.url),'utf8');
function browser(){
  const locks=new Map(),channels=new Set();
  const navigator={locks:{async request(name,options,callback){
    if(locks.has(name))return callback(null);
    locks.set(name,true);try{return await callback({name});}finally{locks.delete(name);}
  }}};
  class Channel{constructor(){channels.add(this);}postMessage(data){for(const c of channels)if(c!==this)queueMicrotask(()=>c.onmessage?.({data}));}}
  return()=>{const events=new Map(),window={addEventListener:(name,fn)=>events.set(name,fn)};vm.runInNewContext(source,{window,navigator,BroadcastChannel:Channel});return{api:window.NaraTabOwnership,close:()=>events.get('pagehide')()};};
}
test('independent files and MCP sessions coexist; a copied session cannot acquire its original owner',async()=>{
  const tab=browser(),a=tab(),b=tab();
  const original=await a.api.claim('mcp:A');assert.ok(original.active);
  assert.equal(await b.api.claim('mcp:A'),null);assert.ok((await b.api.claim('mcp:B')).active);
  assert.ok((await a.api.claim('file:A')).active);assert.ok((await b.api.claim('file:B')).active);
  b.close();assert.equal(original.active,true);a.close();
});
test('transfer respects pending work and a closed owner releases its lock for a legitimate reload',async()=>{
  const tab=browser(),a=tab(),b=tab();let dirty=true,released;
  const original=await a.api.claim('file:A',{canRelease:()=>!dirty,onRelease:reason=>released=reason});
  b.api.requestRelease('file:A');await Promise.resolve();assert.equal(original.active,true);
  dirty=false;b.api.requestRelease('file:A');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(released,'transferred');assert.ok(await b.api.claim('file:A'));b.close();await new Promise(resolve=>setImmediate(resolve));
  assert.ok(await a.api.claim('file:A'));a.close();
});
