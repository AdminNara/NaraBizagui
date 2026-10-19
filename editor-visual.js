'use strict';
(() => {
  const instances=new WeakMap(),fail=(code,message)=>Object.assign(Error(message),{code});
  const activity=e=>!!e?.businessObject&&(e.businessObject.$instanceOf?.('bpmn:Task')||e.type==='bpmn:CallActivity'||e.type==='bpmn:SubProcess'&&e.di?.isExpanded===false);
  const external=e=>e.type==='label'||/(?:Event|Gateway|Flow|Reference)$/.test(e.type);
  function installHistoryGuards(events,registry,modeling){
    const labels=new Map();
    events.on(['commandStack.shape.delete.preExecute','commandStack.connection.delete.preExecute'],1800,({context:c})=>{
      const e=c.shape||c.connection,bo=e?.businessObject,parents=[bo?.$parent,e?.di?.$parent,bo?.processRef?.$parent];c.naraParentOrder=[];
      for(const parent of parents.filter(Boolean))for(const key of ['flowElements','artifacts','participants','messageFlows','planeElement','rootElements']){const values=parent.get(key);if(Array.isArray(values))c.naraParentOrder.push({values,before:values.slice()});}
      if(e?.labelTarget||e?.label){c.naraDeletedLabelDi=(e.labelTarget||e).di;c.naraDeletedDiLabel=c.naraDeletedLabelDi?.label;}
      if(c.connection)c.naraEndpointRefs=[[e.source?.businessObject,'outgoing'],[e.target?.businessObject,'incoming']].filter(([owner])=>owner).map(([owner,key])=>({owner,key,value:owner[key]?.slice()}));
    });
    events.on(['commandStack.shape.delete.reverted','commandStack.connection.delete.reverted'],500,({context:c})=>{
      for(const {values,before}of c.naraParentOrder||[]){const current=new Set(values),ordered=before.filter(v=>current.has(v));values.splice(0,values.length,...ordered,...values.filter(v=>!before.includes(v)));}
      for(const {owner,key,value}of c.naraEndpointRefs||[])owner.set(key,value?.slice());
      if(c.naraDeletedLabelDi)labels.set(c.naraDeletedLabelDi,c.naraDeletedDiLabel);
    });
    events.on('commandStack.shape.delete.preExecute',1700,({context:c})=>{
      const bo=c.shape?.businessObject;if(!bo?.$instanceOf?.('bpmn:FlowNode'))return;
      for(const lane of registry.getAll().filter(e=>e.type==='bpmn:Lane')){const refs=lane.businessObject.flowNodeRef||[];if(refs.some(ref=>ref.id===bo.id))modeling.updateModdleProperties(lane,lane.businessObject,{flowNodeRef:refs.filter(ref=>ref.id!==bo.id)});}
    });
    events.on('commandStack.shape.resize.preExecute',1700,({context:c})=>{if(c.shape?.labelTarget)c.naraPreviousDiLabel=c.shape.labelTarget.di?.label;});
    events.on('commandStack.shape.resize.reverted',500,({context:c})=>{if(c.shape?.labelTarget&&Object.hasOwn(c,'naraPreviousDiLabel'))labels.set(c.shape.labelTarget.di,c.naraPreviousDiLabel);});
    // Native updateLaneRefs removes/re-appends even unchanged members. Retain
    // ordering across undo/redo without replacing objects or bypassing commands.
    events.on('commandStack.lane.updateRefs.preExecute',1700,({context:c})=>{c.naraLaneOrder=registry.getAll().filter(e=>e.type==='bpmn:Lane').map(e=>({bo:e.businessObject,before:[...e.businessObject.get('flowNodeRef')]}));});
    const restore=(records,key)=>{for(const r of records||[]){const refs=r.bo.get('flowNodeRef');refs.splice(0,refs.length,...r[key]);}};
    events.on('commandStack.lane.updateRefs.executed',500,({context:c})=>{if(!c.naraLaneOrder)return;for(const r of c.naraLaneOrder)if(!r.after)r.after=[...r.bo.get('flowNodeRef')];restore(c.naraLaneOrder,'after');});
    events.on('commandStack.lane.updateRefs.reverted',500,({context:c})=>restore(c.naraLaneOrder,'before'));
    // Label bounds are materialized during shape.changed, after reverted.
    events.on('commandStack.changed',2000,()=>{for(const [di,label]of labels)di?.set('label',label);labels.clear();});
  }
  function build(modeler){
    const get=name=>modeler.get(name,false),modeling=get('modeling'),registry=get('elementRegistry'),canvas=get('canvas'),moddle=get('moddle'),stack=get('commandStack'),events=get('eventBus'),textRenderer=get('textRenderer'),layouter=get('layouter');
    function extension(element,type){return element.businessObject.extensionElements?.values?.find(value=>value.$type===type);}
    function readStyle(element){try{return window.NaraERModel.visualStyle(JSON.parse(extension(element,'nara:VisualStyle')?.json||'{}'));}catch{return{};}}
    function readRouting(element){try{const r=JSON.parse(extension(element,'nara:ConnectionRouting')?.json||'null');if(!r||!['orthogonal','manual'].includes(r.mode)||!['source','target'].every(end=>window.NaraModelAudit.SIDES.includes(r[end]?.side)&&Number.isFinite(r[end]?.offset)&&r[end].offset>=.05&&r[end].offset<=.95))return null;return r;}catch{return null;}}
    function putExtension(element,type,json){
      const value=moddle.create(type,{json:JSON.stringify(json)}),extensionElements=moddle.create('bpmn:ExtensionElements',{values:[...(element.businessObject.extensionElements?.values||[]).filter(v=>v.$type!==type),value]});
      modeling.updateProperties(element,{extensionElements});
    }
    function applyStyle(element,style){
      const clean=window.NaraERModel.visualStyle(style);
      if(!Object.keys(clean).length||Object.keys(clean).length!==Object.keys(style).length)throw fail('STYLE_INVALID','El formato requiere propiedades visuales admitidas.');
      if(Object.entries(clean).every(([k,v])=>readStyle(element)[k]===v))return;
      stack.execute('nara.visual.style',{element,style:clean});
    }
    stack.registerHandler('nara.visual.style',function(){
      this.preExecute=c=>{const s={...readStyle(c.element),...c.style};putExtension(c.element,'nara:VisualStyle',s);if(c.style.fill!==undefined||c.style.stroke!==undefined)modeling.setColor(c.element,{...(c.style.fill!==undefined?{fill:s.fill}:{}),...(c.style.stroke!==undefined?{stroke:s.stroke}:{})});};
      this.execute=this.revert=c=>[c.element];
    });
    function defaultFont(element){return readStyle(element.labelTarget||element).fontSize??(external(element)?14:16);}
    function textOptions(element,style=readStyle(element),size={width:element.width,height:element.height}){
      const bo=element.businessObject,icon=/^bpmn:(?:User|Manual|Service|Send|Receive|Script|BusinessRule)Task$/.test(element.type),marker=!!bo.loopCharacteristics||bo.isForCompensation||['bpmn:SubProcess','bpmn:CallActivity'].includes(element.type);
      const padding={left:icon?30:10,right:10,top:8,bottom:marker?28:10};
      return{box:{width:size.width,height:Math.max(1,size.height-padding.top-padding.bottom)},padding,align:(style.align||'center')+'-middle',style:{...textRenderer.getDefaultStyle(),fontFamily:'Arial',fontSize:style.fontSize??16,fontWeight:style.bold?'bold':'normal',fill:style.fontColor||element.di?.stroke||'#213e53'}};
    }
    function decorate(element){
      if(element.type==='bpmn:TextAnnotation'){
        const visual=registry.getGraphics?.(element)?.querySelector('.djs-visual'),fill=readStyle(element).fill;if(!visual)return;
        let bg=visual.querySelector('.nara-note-background');if(!fill){bg?.remove();return;}
        if(!bg){bg=document.createElementNS('http://www.w3.org/2000/svg','rect');bg.classList.add('nara-note-background');visual.prepend(bg);}
        for(const [key,value]of Object.entries({x:0,y:0,width:element.width,height:element.height,fill,stroke:'none','pointer-events':'none'}))bg.setAttribute(key,value);return;
      }
      if(!textRenderer?.createText||!activity(element)&&element.type!=='label')return;
      const visual=registry.getGraphics?.(element)?.querySelector('.djs-visual');if(!visual)return;
      const previous=[...visual.children].find(e=>e.tagName.toLowerCase()==='text'&&e.classList.contains('djs-label'));if(!previous)return;
      const owner=element.labelTarget||element;if(owner.type==='bpmn:Group')return;
      const options=activity(element)?textOptions(element):{box:{width:element.width,height:element.height},align:'center-middle',style:{...textRenderer.getExternalStyle(),fontSize:defaultFont(owner),fontWeight:readStyle(owner).bold?'bold':'normal',fill:readStyle(owner).fontColor||'#213e53'}};
      const text=textRenderer.createText(owner.businessObject.name||'',options);text.classList.add('djs-label');text.dataset.naraText=activity(element)?'activity':'external';
      if(activity(element)){text.setAttribute('transform',`translate(0 ${options.padding.top})`);text.dataset.naraTextOffsetY=String(options.padding.top);}
      previous.replaceWith(text);
    }
    function describeText(element){
      const owner=element.labelTarget||element,shape=external(owner)?owner.label:owner,gfx=shape&&registry.getGraphics?.(shape);
      const text=gfx?.querySelector('.djs-visual text.djs-label');if(!text)return null;
      try{
        const b=text.getBBox(),bounds={x:shape.x+b.x,y:shape.y+b.y+Number(text.dataset.naraTextOffsetY||0),width:b.width,height:b.height},style=readStyle(owner),fontSize=style.fontSize??(external(owner)?14:16);
        const output={rendered:true,bounds,fontSize,lineCount:text.querySelectorAll('tspan').length,contentPreserved:(text.textContent||'').replace(/\s/g,'')===(owner.businessObject.name||'').replace(/\s/g,'')};
        if(activity(owner)){
          const {padding}=textOptions(owner),available={x:owner.x+padding.left,y:owner.y+padding.top,width:owner.width-padding.left-padding.right,height:owner.height-padding.top-padding.bottom};
          const markerBounds=[];if(padding.left>10)markerBounds.push({x:owner.x+8,y:owner.y+8,width:20,height:22});if(padding.bottom>10)markerBounds.push({x:owner.x+8,y:owner.y+owner.height-26,width:owner.width-16,height:22});
          Object.assign(output,{available,markerBounds,fits:bounds.x>=available.x-1&&bounds.y>=available.y-1&&bounds.x+bounds.width<=available.x+available.width+1&&bounds.y+bounds.height<=available.y+available.height+1});
        }
        return output;
      }catch{return null;}
    }
    function fitPlan(element,options={}){
      if(!activity(element))throw fail('TEXT_FIT_UNSUPPORTED','El ajuste de texto y tamaño requiere una tarea, actividad de llamada o subproceso contraído.');
      const style={...readStyle(element),fontSize:options.fontSize??readStyle(element).fontSize??16};window.NaraERModel.visualStyle(style);
      const minWidth=Math.max(100,options.minWidth??element.width),maxWidth=Math.max(minWidth,options.maxWidth??Math.max(320,element.width)),minHeight=Math.max(80,options.minHeight??element.height),maxHeight=Math.max(minHeight,options.maxHeight??Math.max(240,element.height));
      const parent=element.parent,ancestors=new Set();for(let p=parent;p&&!ancestors.has(p.id);p=p.parent)ancestors.add(p.id);
      const others=registry.getAll().filter(e=>e.id!==element.id&&!ancestors.has(e.id)&&!e.waypoints&&!e.labelTarget&&!['bpmn:Lane','bpmn:Participant','bpmn:Group','bpmn:Process','bpmn:Collaboration'].includes(e.type)&&canvas.findRoot(e)===canvas.getRootElement()&&e.host?.id!==element.id);
      let best;
      for(let width=minWidth;width<=maxWidth;width=Math.min(maxWidth,width+20)){
        const layout=textOptions(element,style,{width,height:maxHeight}),dimensions=textRenderer.getDimensions(element.businessObject.name||'',layout),height=Math.max(minHeight,Math.ceil(dimensions.height)+layout.padding.top+layout.padding.bottom+2),bounds={x:element.x,y:element.y,width,height};
        const inside=!parent?.parent||bounds.x>=parent.x+4&&bounds.x+width<=parent.x+parent.width-4&&bounds.y>=parent.y+4&&bounds.y+height<=parent.y+parent.height-4;
        if(height<=maxHeight&&inside&&!others.some(e=>e.width>0&&e.height>0&&window.NaraModelAudit.boxesOverlap(bounds,e))){const score=width*height+(width-element.width)*8;if(!best||score<best.score)best={bounds,style,score};}
        if(width===maxWidth)break;
      }
      if(!best)throw fail('TEXT_FIT_NO_SPACE','El texto no cabe con esa fuente y el espacio libre. Amplía o mueve el conjunto afectado; no reduzcas unas tareas para hacerlas caber.');
      return best;
    }
    stack.registerHandler('nara.visual.fitText',function(){
      this.preExecute=c=>{const plan=c.plan||fitPlan(c.element,c.options);applyStyle(c.element,{fontSize:plan.style.fontSize});if(['x','y','width','height'].some(k=>c.element[k]!==plan.bounds[k]))modeling.resizeShape(c.element,plan.bounds,undefined,{autoResize:false});c.bounds=plan.bounds;};
      this.execute=this.revert=c=>[c.element];
    });
    const snapshot=()=>({elements:registry.getAll().filter(e=>e.businessObject&&!e.labelTarget&&canvas.findRoot(e)===canvas.getRootElement()).map(e=>({id:e.id,type:e.type,parentId:e.parent?.id,flowScopeId:e.businessObject.$parent?.id,x:e.x,y:e.y,width:e.width,height:e.height,sourceId:e.source?.id,targetId:e.target?.id,waypoints:e.waypoints,routing:readRouting(e),labelBounds:describeText(e)?.bounds||(e.label?{x:e.label.x,y:e.label.y,width:e.label.width,height:e.label.height}:undefined)}))});
    function planRoute(element,options={}){
      return window.NaraModelAudit.routeOrthogonal(snapshot(),{...options,elementId:element.id});
    }
    stack.registerHandler('nara.visual.route',function(){
      this.preExecute=c=>{
        const connection=c.element;
        let result=c.plan;
        if(c.waypoints){const metrics=window.NaraModelAudit.routeMetrics(c.waypoints);result={waypoints:c.waypoints,routing:{mode:metrics.orthogonal?'orthogonal':'manual',source:window.NaraModelAudit.inferAnchor(connection.source,c.waypoints[0]),target:window.NaraModelAudit.inferAnchor(connection.target,c.waypoints.at(-1))}};}
        else if(!result)result=planRoute(connection,c.options);
        putExtension(connection,'nara:ConnectionRouting',result.routing);modeling.updateWaypoints(connection,result.waypoints,{naraExplicitRoute:true});c.result=result;
      };this.execute=this.revert=c=>[c.element];
    });
    function orthogonal(element,options={}){options={...options};if(options.preserveSides&&!readRouting(element)){options.sourceSide=window.NaraModelAudit.inferAnchor(element.source,element.waypoints[0]).side;options.targetSide=window.NaraModelAudit.inferAnchor(element.target,element.waypoints.at(-1)).side;}const plan=planRoute(element,options);stack.execute('nara.visual.route',{element,options,plan});return element;}
    function manualRoute(element,waypoints){stack.execute('nara.visual.route',{element,waypoints});return element;}
    function compactContainer(element,options={}){const plan=window.NaraModelAudit.planContainerFit(snapshot(),element.id,options);modeling.resizeShape(element,{x:plan.x,y:plan.y,width:plan.width,height:plan.height},undefined,{autoResize:false});return element;}
    function repairEndpoint(points,shape,anchor){
      const first=window.NaraModelAudit.anchorPoint(shape,anchor.side,anchor.offset),v={top:[0,-1],bottom:[0,1],left:[-1,0],right:[1,0]}[anchor.side],next=points[1];points[0]=first;
      if(!next)return points;
      if((next.x-first.x)*v[0]+(next.y-first.y)*v[1]>1){if(v[0])next.y=first.y;else next.x=first.x;}
      else{const stub={x:first.x+v[0]*12,y:first.y+v[1]*12},bend=v[0]?{x:stub.x,y:next.y}:{x:next.x,y:stub.y};points.splice(1,0,stub,bend);}
      return points;
    }
    if(events){
      installHistoryGuards(events,registry,modeling);
      events.on('commandStack.shape.resize.postExecute',500,({context:c})=>{
        const pool=c.shape;if(pool?.type!=='bpmn:Participant'||!c.oldBounds)return;
        const right=pool.x+pool.width;
        for(const lane of registry.getAll().filter(e=>e.type==='bpmn:Lane')){
          let contained=false;for(let p=lane.parent;p;p=p.parent)if(p===pool){contained=true;break;}
          if(contained&&(lane.x+lane.width>right||Math.abs(lane.x+lane.width-c.oldBounds.x-c.oldBounds.width)<.1)&&Math.abs(lane.x+lane.width-right)>.1&&right-lane.x>=60)modeling.resizeShape(lane,{x:lane.x,y:lane.y,width:right-lane.x,height:lane.height},undefined,{autoResize:false});
        }
      });
      events.on('commandStack.shape.resize.canExecute',1600,event=>{const {shape,newBounds}=event.context;if(!activity(shape))return;return !newBounds||[newBounds.x,newBounds.y,newBounds.width,newBounds.height].every(Number.isFinite)&&newBounds.width>=100&&newBounds.height>=80;});
      events.on('commandStack.connection.updateWaypoints.preExecute',1600,event=>{
        const c=event.context,r=readRouting(c.connection);if(r?.mode!=='orthogonal'||c.hints?.naraExplicitRoute||c.newWaypoints.length<3)return;
        let points=c.newWaypoints.map(p=>({...p}));points=repairEndpoint(points,c.connection.source,r.source);points=repairEndpoint(points.reverse(),c.connection.target,r.target).reverse();c.newWaypoints=window.NaraModelAudit.simplifyOrthogonal(points);
      });
      events.on('commandStack.connection.reconnect.postExecute',1600,event=>{
        const c=event.context,connection=c.connection,old=readRouting(connection);if(!old)return;
        const docking=c.dockingOrPoints,points=Array.isArray(docking)?docking:connection.waypoints,hints=c.hints||{},side=hints.docking;
        const source=side!=='target'?window.NaraModelAudit.inferAnchor(connection.source,hints.connectionStart||(Array.isArray(docking)?docking[0]:docking)||points[0]):old.source;
        const target=side!=='source'?window.NaraModelAudit.inferAnchor(connection.target,hints.connectionEnd||(Array.isArray(docking)?docking.at(-1):docking)||points.at(-1)):old.target;
        putExtension(connection,'nara:ConnectionRouting',{...old,source,target});
      });
      events.on('commandStack.connection.create.postExecute',500,event=>{
        const c=event.context,connection=c.connection;if(!connection?.source||!connection?.target||connection.source===connection.target||readRouting(connection))return;
        try{orthogonal(connection,{sourceSide:c.hints?.connectionStart?window.NaraModelAudit.inferAnchor(connection.source,c.hints.connectionStart).side:'auto'});}catch(error){if(error.code!=='ROUTE_BLOCKED')throw error;}
      });
      events.on(['shape.changed','shape.added'],400,event=>decorate(event.element));
      events.on('import.done',400,()=>registry.getAll().forEach(decorate));
    }
    if(layouter){
      const native=layouter.layoutConnection.bind(layouter);
      layouter.layoutConnection=(connection,hints={})=>{
        const routing=readRouting(connection);if(routing?.mode!=='orthogonal')return native(connection,hints);
        try{return planRoute(connection).waypoints;}catch(error){
          // Keep native undo/movement intact when an imported or crowded layout
          // has no local solution. The subsequent quality audit reports it.
          return native(connection,{...hints,connectionStart:window.NaraModelAudit.anchorPoint(connection.source,routing.source.side,routing.source.offset),connectionEnd:window.NaraModelAudit.anchorPoint(connection.target,routing.target.side,routing.target.offset)});
        }
      };
    }
    if(textRenderer?.getExternalLabelBounds){
      const nativeBounds=textRenderer.getExternalLabelBounds.bind(textRenderer);
      textRenderer.getExternalLabelBounds=(bounds,text)=>{
        const owner=bounds.labelTarget||bounds;if(!owner.businessObject)return nativeBounds(bounds,text);
        const style=readStyle(owner),dimensions=textRenderer.getDimensions(text,{box:{width:Math.max(bounds.width,90),height:30},style:{...textRenderer.getExternalStyle(),fontSize:style.fontSize??14,fontWeight:style.bold?'bold':'normal'}});
        return{x:Math.round(bounds.x+bounds.width/2-dimensions.width/2),y:bounds.y,width:Math.ceil(dimensions.width),height:Math.ceil(dimensions.height)};
      };
    }
    return{readStyle,readRouting,applyStyle,defaultFont,decorate,describeText,fitPlan,fitText:(element,options={})=>{const plan=fitPlan(element,options);stack.execute('nara.visual.fitText',{element,options,plan});return element;},orthogonal,manualRoute,compactContainer,activity};
  }
  function create(modeler){const existing=modeler.get('naraVisual',false);if(existing)return existing;if(!instances.has(modeler))instances.set(modeler,build(modeler));return instances.get(modeler);}
  function Service(injector){return build({get:(name,strict)=>injector.get(name,strict)});}Service.$inject=['injector'];
  window.NaraVisual={create,activity,installHistoryGuards};
  window.NaraVisualModule={__init__:['naraVisual'],naraVisual:['type',Service]};
})();
