import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../sheets.js', import.meta.url), 'utf8');
function fixture() {
  const nodes = new Map(), listeners = new Map();
  function node() { return { hidden: true, dataset: {}, children: [], classList: { toggle() {} }, setAttribute(k,v) { this[k]=v; }, appendChild(n) { this.children.push(n); }, append(...n) { this.children.push(...n); }, replaceChildren() { this.children=[]; }, addEventListener(k,fn) { this[k]=fn; }, focus() { this.focused=true; } }; }
  const document = { body: node(), createElement: node, addEventListener() {}, getElementById(id) { if (!nodes.has(id)) nodes.set(id,node()); return nodes.get(id); } };
  const events = { on(types, priority, fn) { if (typeof priority==='function') fn=priority; for (const type of Array.isArray(types)?types:[types]) { if (!listeners.has(type)) listeners.set(type,[]); listeners.get(type).push(fn); } }, fire(type,data={}) { for (const fn of listeners.get(type)||[]) fn(data); } };
  let definitions = { diagrams: [] }, root, er = null, box={x:10,y:20,width:1000,height:600,scale:1}, selected=[], pending=false;
  const elements=new Map(), roots=new Map();
  function addRoot(id,type='bpmn:Process',bo={id,name:id,$type:type}) { const result={id,businessObject:bo}; roots.set(id,result); elements.set(id,result); definitions.diagrams.push({plane:{bpmnElement:bo}}); return result; }
  function call(id,origin,target,type='bpmn:CallActivity') { const result={id,type,parent:origin,collapsed:true,businessObject:{id,$type:type,calledElement:target?.businessObject.id},x:100,y:100,width:100,height:80}; elements.set(id,result); return result; }
  const a=addRoot('A'), b=addRoot('B'), c=addRoot('C'); root=a;
  const ab=call('AB',a,b), ab2=call('AB2',a,b), bc=call('BC',b,c), ba=call('BA',b,a);
  const sub=call('Sub',a,null,'bpmn:SubProcess'), detail=addRoot('Sub_plane','bpmn:SubProcess',sub.businessObject);
  const canvas={ findRoot:arg=>typeof arg==='string'?roots.get(arg):arg?.parent||roots.get(arg?.id), getRootElement:()=>root, setRootElement(next) { root=next;events.fire('root.set',{element:next}); }, viewbox(value) { if(value)box={...value,scale:1000/value.width};return {...box}; }, zoom() {}, resized() {}, getSize:()=>({width:1000,height:600}), getContainer:()=>document.getElementById('drawing'), scrollToElement(e) { box.x=e.x;box.y=e.y; } };
  const services={bpmnjs:{getDefinitions:()=>definitions}, canvas, commandStack:{registerHandler() {}},elementFactory:{},bpmnFactory:{},modeling:{},eventBus:events,elementRegistry:{get:id=>elements.get(id)},bpmnReplace:{},selection:{select(value) { selected=Array.isArray(value)?value:[value]; },get:()=>selected},naraER:{active:()=>er,list:()=>[{id:'ER',kind:'erd',name:'Datos'}],close() { er=null; },open(id) { er=id;events.fire('nara.erd.view.changed'); }}};
  const window={NaraPropertyDraftPending:()=>pending,browserBpmnFiles:{documentId:'doc-1'},addEventListener() {}};
  vm.runInNewContext(source,{window,document,crypto});
  const Constructor=window.NaraSheetsModule.naraSheets[1],sheets=new Constructor(...Constructor.$inject.map(key=>services[key]));
  const ready=sheets.importAdditional();
  return {ready,sheets,canvas,events,a,b,c,ab,ab2,bc,ba,sub,detail,elements,roots,window,button:document.getElementById('subprocessReturn'),bar:document.getElementById('subprocessReturnBar'),tab:id=>document.getElementById('sheetNavigation').children.find(n=>n.children[0].dataset.sheet===id).children[0],back:document.getElementById('sheetBack'),selected:()=>selected,pending:value=>pending=value,document:value=>definitions=value,view:()=>box};
}

test('shared processes return to the actual caller and activity with the saved view',async()=>{
  const f=fixture();await f.ready;
  f.canvas.viewbox({x:50,y:60,width:1250,height:750});const view={...f.view()};
  f.sheets.openSubprocess('AB');assert.equal(f.bar.hidden,false);assert.equal(f.button.textContent,'← Volver a A');
  f.canvas.viewbox({x:900,y:900,width:500,height:300});f.button.onclick();
  assert.equal(f.canvas.getRootElement(),f.a);assert.deepEqual(f.view(),view);assert.equal(f.selected()[0],f.ab);assert.equal(f.bar.hidden,true);
  f.sheets.openSubprocess('AB2');f.button.onclick();assert.equal(f.selected()[0],f.ab2);
  f.sheets.open('B');f.sheets.openSubprocess('BA');assert.equal(f.button.textContent,'← Volver a B');f.button.onclick();assert.equal(f.selected()[0],f.ba);
});

test('native subprocesses and nested calls unwind one step; cycles require explicit clicks',async()=>{
  const f=fixture();await f.ready;f.sheets.openSubprocess('Sub');assert.equal(f.canvas.getRootElement(),f.detail);f.button.onclick();assert.equal(f.selected()[0],f.sub);
  f.sheets.openSubprocess('AB');f.sheets.openSubprocess('BC');f.button.onclick();assert.equal(f.canvas.getRootElement(),f.b);assert.equal(f.button.textContent,'← Volver a A');f.button.onclick();assert.equal(f.canvas.getRootElement(),f.a);assert.equal(f.bar.hidden,true);
  f.sheets.openSubprocess('AB');f.sheets.openSubprocess('BA');assert.equal(f.canvas.getRootElement(),f.a);f.button.onclick();assert.equal(f.canvas.getRootElement(),f.b);f.button.onclick();assert.equal(f.canvas.getRootElement(),f.a);assert.equal(f.bar.hidden,true);
});

test('direct tabs, including the current one, discard callers and preserve general back',async()=>{
  const f=fixture();await f.ready;f.sheets.openSubprocess('AB');f.tab('B').onclick();assert.equal(f.bar.hidden,true);
  f.back.onclick();assert.equal(f.canvas.getRootElement(),f.a);assert.equal(f.bar.hidden,true);
  f.sheets.openSubprocess('AB');f.sheets.open('C');f.back.onclick();assert.equal(f.canvas.getRootElement(),f.b);assert.equal(f.bar.hidden,true);
  f.sheets.open('A');f.sheets.openSubprocess('AB');f.sheets.open('ER');assert.equal(f.bar.hidden,true);
});

test('pending Properties blocks opening and returning without consuming the call',async()=>{
  const f=fixture();await f.ready;f.pending(true);assert.throws(()=>f.sheets.openSubprocess('AB'),{code:'FORM_PENDING'});assert.equal(f.bar.hidden,true);
  f.pending(false);f.sheets.openSubprocess('AB');f.pending(true);f.button.onclick();assert.equal(f.canvas.getRootElement(),f.b);assert.equal(f.bar.hidden,false);
  assert.throws(()=>f.sheets.open('C'),{code:'FORM_PENDING'});f.pending(false);f.button.onclick();assert.equal(f.canvas.getRootElement(),f.a);
});

test('deleted, replaced, moved or retargeted callers invalidate rather than invent a parent',async()=>{
  for(const invalidate of [f=>f.elements.delete('AB'),f=>f.elements.set('AB',{...f.ab}),f=>f.ab.parent=f.c,f=>f.ab.businessObject.calledElement='C',f=>f.roots.delete('A'),f=>f.roots.set('A',{...f.a}),f=>f.document({diagrams:[]}),f=>f.window.browserBpmnFiles.documentId='doc-2']) {
    const f=fixture();await f.ready;f.sheets.openSubprocess('AB');invalidate(f);f.events.fire('element.changed');assert.equal(f.bar.hidden,true);f.button.onclick();assert.equal(f.canvas.getRootElement(),f.b);
  }
});

test('import/clear and separate editor instances never inherit a call with reused IDs',async()=>{
  const f=fixture(),other=fixture();await Promise.all([f.ready,other.ready]);f.sheets.openSubprocess('AB');assert.equal(other.bar.hidden,true);
  f.events.fire('import.parse.start');assert.equal(f.bar.hidden,true);await f.sheets.importAdditional();f.sheets.open('A');f.sheets.openSubprocess('AB');f.events.fire('diagram.clear');assert.equal(f.bar.hidden,true);
});

test('root removal invalidates before the native registry has removed the root',async()=>{
  const f=fixture();await f.ready;f.sheets.openSubprocess('AB');f.events.fire('root.removed',{element:f.a});assert.equal(f.bar.hidden,true);assert.ok(f.roots.has('A'));
});

test('failed opens and wrong-sheet requests do not register calls or mutate expanded subprocesses',async()=>{
  const f=fixture();await f.ready;f.ab.businessObject.calledElement='missing';assert.throws(()=>f.sheets.openSubprocess('AB'),{code:'SHEET_NOT_FOUND'});assert.equal(f.bar.hidden,true);
  assert.throws(()=>f.sheets.openSubprocess('BC'),{code:'WRONG_SHEET'});f.sub.collapsed=false;assert.throws(()=>f.sheets.openSubprocess('Sub'),{code:'SUBPROCESS_EXPANDED'});assert.equal(f.sub.collapsed,false);
  f.ab.businessObject.calledElement='B';const navigate=f.canvas.setRootElement;f.canvas.setRootElement=()=>{throw Error('open failed');};assert.throws(()=>f.sheets.openSubprocess('AB'),/open failed/);assert.equal(f.bar.hidden,true);f.canvas.setRootElement=navigate;
  f.sheets.openSubprocess('AB');assert.throws(()=>f.sheets.openSubprocess('missing'),{code:'ELEMENT_NOT_FOUND'});assert.equal(f.bar.hidden,false);f.button.onclick();assert.equal(f.canvas.getRootElement(),f.a);
});

test('renamed origins have full accessible labels and moved activities are located without moving them',async()=>{
  const f=fixture();await f.ready;f.sheets.openSubprocess('AB');f.a.businessObject.name='Origen con un nombre muy largo '.repeat(8);f.events.fire('element.changed');assert.equal(f.button.title,'Volver a '+f.a.businessObject.name);assert.equal(f.button['aria-label'],f.button.title);
  f.ab.x=5000;f.ab.y=6000;const geometry=JSON.stringify(f.ab);f.button.onclick();assert.equal(f.selected()[0],f.ab);assert.equal(f.view().x,5000);assert.equal(JSON.stringify(f.ab),geometry);
});
