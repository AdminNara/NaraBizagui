'use strict';
(() => {
  function StyleEditor(eventBus,elementRegistry,modeling,commandStack,moddle,selection,rules,canvas) {
    const M=window.NaraERModel,$=id=>document.getElementById(id);
    const panel=document.createElement('section');panel.id='visualProperties';panel.className='visual-properties';
    panel.innerHTML='<h3>Formato</h3><details open><summary>Estilo</summary><div class="format-grid"><label>Relleno<input id="styleFill" type="color"></label><label>Línea<input id="styleStroke" type="color"></label><label>Grosor<input id="styleStrokeWidth" type="number" min="0.5" max="6" step="0.5"></label></div></details><details><summary>Texto</summary><div class="format-grid"><label>Color<input id="styleFontColor" type="color"></label><label>Tamaño<input id="styleFontSize" type="number" min="9" max="32"></label><label>Negrita<input id="styleBold" type="checkbox"></label><label>Alineación<select id="styleAlign"><option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option></select></label></div></details><details><summary>Organizar</summary><form id="geometryForm"><div class="format-grid"><label>X<input id="styleX" type="number" min="-100000" max="100000" step="any" required></label><label>Y<input id="styleY" type="number" min="-100000" max="100000" step="any" required></label><label>Ancho<input id="styleWidth" type="number" min="20" max="100000" step="any" required></label><label>Alto<input id="styleHeight" type="number" min="20" max="100000" step="any" required></label></div><button type="submit" class="secondary-button">Aplicar posición y tamaño</button></form></details>';
    $('propertiesPanel').appendChild(panel);
    const target=()=>window.NaraER?.active()?window.NaraER.read().tables.find(t=>t.id===window.NaraER.selected())||window.NaraER.read().relationships.find(r=>r.id===window.NaraER.selected()):selection.get()[0];
    function read(element){if(!element)return{};if(!element.businessObject)return element.style||{};const value=element.businessObject.extensionElements?.values?.find(v=>v.$type==='nara:VisualStyle');try{return M.visualStyle(value?JSON.parse(value.json):{});}catch{return{};}}
    commandStack.registerHandler('nara.style.update',function(){
      this.preExecute=context=>{const element=context.element,bo=element.businessObject,s={...read(element),...M.visualStyle(context.style)};
        const value=moddle.create('nara:VisualStyle',{json:JSON.stringify(s)}),extensionElements=moddle.create('bpmn:ExtensionElements',{values:[...(bo.extensionElements?.values||[]).filter(v=>v.$type!=='nara:VisualStyle'),value]});
        modeling.updateProperties(element,{extensionElements});
        if(context.style.fill!==undefined||context.style.stroke!==undefined)modeling.setColor(element,{...(context.style.fill!==undefined?{fill:s.fill}:{}),...(context.style.stroke!==undefined?{stroke:s.stroke}:{})});
      };this.execute=context=>[context.element];this.revert=context=>[context.element];
    });
    function apply(elementId,style){M.visualStyle(style);if(window.NaraPropertyDraftPending?.())throw Error('Aplica o cancela la edición pendiente antes de cambiar el formato.');
      if(window.NaraER?.active())return window.NaraER.edit({type:'style',elementId,style});
      const element=elementRegistry.get(elementId);if(!element?.businessObject||element.labelTarget)throw Error('Selecciona una figura o conexión.');
      commandStack.execute('nara.style.update',{element,style});return elementId;
    }
    function decorate(element){if(!element)return;const base=element.labelTarget||element,s=read(base),gfx=elementRegistry.getGraphics(element);if(!gfx)return;
      for(const text of gfx.querySelectorAll('.djs-visual text')){if(s.fontColor){text.style.fill=s.fontColor;text.setAttribute('fill',s.fontColor);}if(s.fontSize){text.style.fontSize=s.fontSize+'px';text.setAttribute('font-size',s.fontSize);}if(s.bold!==undefined){text.style.fontWeight=s.bold?'700':'400';text.setAttribute('font-weight',s.bold?'700':'400');}}
      if(s.strokeWidth)for(const line of gfx.querySelectorAll('.djs-visual > rect,.djs-visual > circle,.djs-visual > polygon,.djs-visual > path')){line.style.strokeWidth=s.strokeWidth+'px';line.setAttribute('stroke-width',s.strokeWidth);}
      if(base.id.startsWith(window.NaraStagePrefix?.()||'Stage_'))for(const rect of gfx.querySelectorAll('.stage-header-fill'))if(s.fill)rect.setAttribute('fill',s.fill);
    }
    function refresh(){
      const er=!!window.NaraER?.active(),element=target(),host=$(er?'erdPropertiesPanel':'propertiesPanel');if(panel.parentNode!==host)host.appendChild(panel);panel.hidden=!element;if(!element)return;
      const s=read(element),di=element.di;
      for(const [key,value]of Object.entries({Fill:s.fill||di?.fill||'#ffffff',Stroke:s.stroke||di?.stroke||'#345b78',StrokeWidth:s.strokeWidth||1.5,FontColor:s.fontColor||'#213e53',FontSize:s.fontSize||12,Align:s.align||'left'}))$('style'+key).value=value;
      $('styleBold').checked=!!s.bold;$('styleAlign').disabled=!er;
      const shape=Number.isFinite(element.x)&&!element.waypoints&&!element.sourceTableId;$('geometryForm').hidden=!shape;
      if(shape){for(const [key,value]of Object.entries({X:element.x,Y:element.y,Width:element.width,Height:er?M.height(element):element.height}))$('style'+key).value=String(Math.round(value*100)/100);$('styleHeight').disabled=er;$('styleWidth').min=er?'200':'20';$('styleWidth').max=er?'1000':'100000';}
    }
    for(const [key,name]of Object.entries({Fill:'fill',Stroke:'stroke',StrokeWidth:'strokeWidth',FontColor:'fontColor',FontSize:'fontSize',Bold:'bold',Align:'align'}))$('style'+key).onchange=()=>{const element=target();if(!element)return;const el=$('style'+key);try{apply(element.id,{[name]:key==='Bold'?el.checked:['StrokeWidth','FontSize'].includes(key)?Number(el.value):el.value});}catch(error){$('status').textContent=error.message;refresh();}};
    $('geometryForm').onsubmit=event=>{event.preventDefault();const element=target();if(!element)return;try{if(window.NaraPropertyDraftPending?.())throw Error('Aplica o cancela la edición pendiente.');const bounds={x:Number($('styleX').value),y:Number($('styleY').value),width:Number($('styleWidth').value),height:Number($('styleHeight').value)};if(!Object.values(bounds).every(Number.isFinite)||Math.abs(bounds.x)>100000||Math.abs(bounds.y)>100000||bounds.width<20||bounds.width>100000||bounds.height<20||bounds.height>100000)throw Error('Posición o tamaño no válido.');
      if(window.NaraER?.active())window.NaraER.edit({type:'erd_table_update',tableId:element.id,x:bounds.x,y:bounds.y,width:bounds.width});
      else if(rules.allowed('shape.resize',{shape:element}))modeling.resizeShape(element,bounds);
      else if(bounds.width===element.width&&bounds.height===element.height)modeling.moveShape(element,{x:bounds.x-element.x,y:bounds.y-element.y});
      else throw Error('Esta figura conserva su tamaño BPMN; puedes cambiar su posición.');
    }catch(error){$('status').textContent=error.message;}refresh();};
    eventBus.on(['shape.added','shape.changed','connection.changed'],500,event=>{decorate(event.element);});
    eventBus.on('commandStack.changed',500,()=>{for(const el of elementRegistry.getAll())decorate(el);refresh();});
    eventBus.on('import.done',500,()=>{for(const el of elementRegistry.getAll())decorate(el);refresh();});
    window.NaraStylePanel={read,apply,refresh};
  }
  StyleEditor.$inject=['eventBus','elementRegistry','modeling','commandStack','moddle','selection','rules','canvas'];
  window.NaraStyleModule={__init__:['naraStyle'],naraStyle:['type',StyleEditor]};
})();
