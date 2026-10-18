import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('explicit label placement survives the native bottom-anchored text height adjustment',async()=>{
 const handlers=new Map(),stack={registerHandler:(name,handler)=>handlers.set(name,handler)};
 const context={crypto:{randomUUID:()=> 'revision'},window:{},modeler:{get:name=>name==='commandStack'?stack:{on(){}}}};
 vm.runInNewContext(await readFile(new URL('../mcp-editor.js',import.meta.url),'utf8'),context);
 const Handler=handlers.get('nara.mcp.positionedLabel');assert.ok(Handler);
 const label={x:100,y:300,width:90,height:34},element={label},bounds={x:160,y:80,width:140,height:40},commands=[];
 const modeling={updateLabel(target,text,next){commands.push('label');const bottom=label.y+label.height;Object.assign(label,{x:next.x,y:bottom-17,width:next.width,height:17});},moveShape(shape,delta){commands.push('move');shape.x+=delta.x;shape.y+=delta.y;}};
 new Handler(modeling).preExecute({element,text:'Caption',bounds});
 assert.deepEqual(label,{x:160,y:80,width:140,height:17});
 assert.deepEqual(commands,['label','move']);
});
