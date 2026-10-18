import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../mcp-editor.js',import.meta.url),'utf8');
const start=source.indexOf('  async function presentBatch('),end=source.indexOf('\n  const blocks =',start);
function fixture(visibility='visible',dialog=false){const stats={frames:0,fit:0,expanded:null},c={document:{visibilityState:visibility,querySelector:()=>dialog?{}:null},window:{NaraSetFocus:value=>{stats.expanded=value;}},fit(){stats.fit++;},setTimeout,clearTimeout,requestAnimationFrame:callback=>{stats.frames++;queueMicrotask(callback);}};vm.createContext(c);vm.runInContext(source.slice(start,end),c);return{c,stats};}
test('presentation confirms a frame only for a visible unobstructed canvas',async()=>{const f=fixture(),result=await f.c.presentBatch({expandedCanvas:true,fit:true});assert.equal(result.paintConfirmed,true);assert.equal(f.stats.frames,2);assert.equal(f.stats.fit,1);assert.equal(f.stats.expanded,true);});
test('background or modal-obstructed presentation never claims a visible result or waits for frames',async()=>{for(const [visibility,dialog,reason]of [['hidden',false,'background'],['visible',true,'dialog_open']]){const f=fixture(visibility,dialog),result=await f.c.presentBatch({fit:true});assert.equal(result.paintConfirmed,false);assert.equal(result.reason,reason);assert.equal(f.stats.frames,0);}});
