import test from 'node:test';
import assert from 'node:assert/strict';
import {routeOrthogonal,anchorPoint,routeMetrics,simplifyOrthogonal} from '../plugins/narabizagui/shared/routing.mjs';
import {lineHitsBox} from '../plugins/narabizagui/shared/geometry.mjs';
const source={id:'Task',type:'bpmn:Task',x:200,y:180,width:100,height:80},target={id:'Document',type:'bpmn:DataObjectReference',x:480,y:390,width:36,height:50};
const flow={id:'Output',type:'bpmn:Association',sourceId:source.id,targetId:target.id,waypoints:[{x:300,y:220},{x:310,y:220},{x:310,y:250},{x:400,y:250},{x:400,y:415},{x:480,y:415}]};
const snapshot=(extra=[])=>({elements:[structuredClone(source),structuredClone(target),structuredClone(flow),...extra]});
test('output to a document below/right is a simple L with fixed sides and no short hook',()=>{
 const before=snapshot(),copy=structuredClone(before),result=routeOrthogonal(before,{elementId:'Output',sourceSide:'bottom',targetSide:'left'});
 assert.deepEqual(result.waypoints,[{x:250,y:260},{x:250,y:415},{x:480,y:415}]);assert.equal(result.metrics.bends,1);assert.equal(result.metrics.shortLegs,0);assert.deepEqual(before,copy);
});
test('automatic sides choose a short L, and a blocking box is avoided locally',()=>{
 const direct=routeOrthogonal(snapshot(),{elementId:'Output'});assert.equal(direct.metrics.bends,1);assert.ok(direct.metrics.length<400);
 const obstacle={id:'Other',type:'bpmn:Task',x:310,y:280,width:125,height:180};
 const result=routeOrthogonal(snapshot([obstacle]),{elementId:'Output',sourceSide:'bottom',targetSide:'left'});
 assert.ok(result.metrics.orthogonal);assert.ok(result.metrics.length<700);assert.ok(result.metrics.bends<=4);
 for(let i=1;i<result.waypoints.length;i++)assert.equal(lineHitsBox(result.waypoints[i-1],result.waypoints[i],obstacle,9.9),false);
});
test('a top anchor persists across movement and JSON serialization without changing ends',()=>{
 const s=snapshot();const first=routeOrthogonal(s,{elementId:'Output',sourceSide:'right',targetSide:'top'});Object.assign(s.elements[2],{routing:first.routing,waypoints:first.waypoints});s.elements[1].x+=90;s.elements[1].y+=40;
 const reopened=JSON.parse(JSON.stringify(s)),next=routeOrthogonal(reopened,{elementId:'Output'});
 assert.deepEqual(next.waypoints.at(-1),anchorPoint(reopened.elements[1],'top'));assert.equal(next.routing.target.side,'top');assert.equal(reopened.elements[2].sourceId,'Task');assert.equal(reopened.elements[2].targetId,'Document');
});
test('connection obstacles do not force a trip around the entire diagram',()=>{
 const cross={id:'OtherFlow',type:'bpmn:SequenceFlow',sourceId:'X',targetId:'Y',waypoints:[{x:350,y:150},{x:350,y:450}]};
 const unrelated=Array.from({length:150},(_,i)=>({id:'Far'+i,type:'bpmn:Task',x:10000+i*200,y:10000,width:100,height:80}));
 const result=routeOrthogonal(snapshot([cross,...unrelated]),{elementId:'Output'});assert.ok(result.metrics.length<700);assert.ok(result.metrics.bends<=4);
});
test('a blocked explicit departure is rejected without changing the snapshot',()=>{
 const s=snapshot([{id:'Block',type:'bpmn:Task',x:150,y:260,width:200,height:80}]),before=JSON.stringify(s);
 assert.throws(()=>routeOrthogonal(s,{elementId:'Output',sourceSide:'bottom',targetSide:'left'}),{code:'ROUTE_BLOCKED'});assert.equal(JSON.stringify(s),before);
});
test('normalization removes only redundant collinear points and preserves reversals',()=>{
 assert.deepEqual(simplifyOrthogonal([{x:0,y:0},{x:0,y:0},{x:20,y:0},{x:40,y:0},{x:40,y:30}]),[{x:0,y:0},{x:40,y:0},{x:40,y:30}]);
 assert.equal(simplifyOrthogonal([{x:0,y:0},{x:20,y:0},{x:10,y:0}]).length,3);assert.equal(routeMetrics([{x:0,y:0},{x:3,y:0},{x:3,y:20}]).shortLegs,1);
});
