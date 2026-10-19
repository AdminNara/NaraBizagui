import {boxesOverlap,lineHitsBox,segments} from './geometry.mjs';
import {routeMetrics,simplifyOrthogonal,anchorPoint} from './routing.mjs';
const activity=e=>/Task$/.test(e.type)||e.type==='bpmn:CallActivity'||e.type==='bpmn:SubProcess'&&e.expanded!==true;
export function reviewVisualQuality(snapshot,{elementIds,maxIssues=200}={}){
  const elements=snapshot.elements||[],index=new Map(elements.map(e=>[e.id,e])),scope=elementIds?new Set(elementIds):null,issues=[];let total=0;
  if(scope)for(const e of elements)if(e.waypoints&&(scope.has(e.sourceId)||scope.has(e.targetId)))scope.add(e.id);
  const add=(code,ids,message,details={})=>{if(scope&&!ids.some(id=>scope.has(id)))return;total++;if(issues.length<maxIssues)issues.push({code,severity:'warning',elementIds:ids,message,...details});};
  const affected=e=>!scope||scope.has(e.id),missingText=[];
  for(const e of elements){
    if(e.waypoints?.length>1&&affected(e)){
      const metrics=routeMetrics(e.waypoints),simple=simplifyOrthogonal(e.waypoints),first=e.waypoints[0],last=e.waypoints.at(-1),minimum=Math.abs(first.x-last.x)+Math.abs(first.y-last.y);
      if(!metrics.orthogonal)add('ROUTE_DIAGONAL',[e.id],'La conexión contiene un tramo diagonal.');
      if(simple.length<e.waypoints.length)add('ROUTE_REDUNDANT_POINTS',[e.id],'El recorrido conserva puntos colineales o repetidos que se pueden eliminar.');
      if(metrics.shortLegs&&metrics.bends)add('ROUTE_SHORT_LEG',[e.id],'La conexión tiene un tramo corto junto a un quiebre.',{metrics});
      if(metrics.length>minimum*2.5&&metrics.length-minimum>200)add('ROUTE_DETOUR',[e.id],'La conexión hace un rodeo largo; evitar cruces no basta para considerarla una buena ruta.',{metrics,minimum});
      for(const [end,point]of [['source',first],['target',last]]){
        const anchor=e.routing?.[end],shape=index.get(e[end+'Id']);
        if(anchor&&shape){try{const expected=anchorPoint(shape,anchor.side,anchor.offset);if(Math.hypot(point.x-expected.x,point.y-expected.y)>2)add('ROUTE_ANCHOR_CHANGED',[e.id,shape.id],'El extremo ya no coincide con el lado de anclaje elegido.',{end,expected,actual:point});}catch{add('ROUTE_ANCHOR_INVALID',[e.id],'El anclaje guardado no tiene un lado y una posición válidos.',{end});}}
      }
    }
    if(!e.name?.trim()||!activity(e)||!affected(e))continue;
    const text=e.textLayout;
    if(!text?.rendered){missingText.push(e.id);continue;}
    if(!text.fits||text.contentPreserved===false)add('TEXT_OUTSIDE_ACTIVITY',[e.id],'El texto no cabe completo en el espacio reservado de la actividad.',{fontSize:text.fontSize,bounds:text.bounds,available:text.available});
    for(const marker of text.markerBounds||[])if(text.bounds&&boxesOverlap(text.bounds,marker))add('TEXT_OVER_MARKER',[e.id],'El texto se superpone al icono o marcador de la actividad.');
    let parent=index.get(e.parentId);const seen=new Set();
    while(parent&&!seen.has(parent.id)){seen.add(parent.id);if(parent.type==='bpmn:Lane'&&text.bounds){const b=text.bounds;if(b.x<parent.x||b.x+b.width>parent.x+parent.width||b.y<parent.y||b.y+b.height>parent.y+parent.height)add('TEXT_OVER_LANE_BORDER',[e.id,parent.id],'El texto de la actividad invade el borde del carril.');break;}parent=index.get(parent.parentId);}
  }
  const activities=elements.filter(e=>activity(e)&&e.name?.trim()&&affected(e)),sizes=new Map();
  for(const e of activities){const size=e.textLayout?.fontSize??e.visualStyle?.fontSize??16;const ids=sizes.get(size)||[];ids.push(e.id);sizes.set(size,ids);}
  if(sizes.size>1)add('ACTIVITY_FONT_INCONSISTENT',activities.map(e=>e.id),'Las actividades del conjunto revisado usan tamaños de letra distintos.',{fontSizes:[...sizes.keys()]});
  // Rendered text can extend beyond an external label's saved DI bounds.
  for(const e of elements.filter(e=>affected(e)&&e.textLayout?.rendered&&e.textLayout.bounds&&!activity(e))){
    const bounds=e.textLayout.bounds;
    for(const f of elements.filter(f=>f.id!==e.id&&f.waypoints?.length>1))if(segments(f).some(([a,b])=>lineHitsBox(a,b,bounds)))add('RENDERED_TEXT_OVER_LINE',[e.id,f.id],'El texto renderizado se superpone a una línea.');
  }
  return{ok:total===0,complete:missingText.length===0&&!snapshot.elementsTruncated&&!snapshot.elementsFiltered&&total<=maxIssues,scope:scope?'affected-elements':'active-sheet',elementIds:scope?[...scope]:undefined,issues,totalIssues:total,coverage:{missingRenderedText:missingText},businessApproval:false};
}
