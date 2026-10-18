'use strict';
// Only schedules the existing verified save path. Never chooses a destination.
class NaraAutoSave {
  constructor({state,save,render,delay=2000,setTimer=setTimeout,clearTimer=clearTimeout}) {
    Object.assign(this,{state,save,render,delay,setTimer,clearTimer});
    this.enabled=true;this.running=false;this.timer=null;this.blocked=null;this.target=null;this.document=null;
  }
  cancel(){if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;}
  schedule(delay){this.cancel();this.timer=this.setTimer(()=>{this.timer=null;void this.flush();},delay);}
  reset(){this.blocked=null;this.refresh();}
  enable(value){this.enabled=value;this.refresh();}
  block(error){this.blocked=error;this.cancel();this.refresh();}
  retrySafe(){if(['NETWORK_ERROR','THROTTLED'].includes(this.blocked?.code)){this.blocked=null;this.refresh();}}
  bind(s){if(s.target!==this.target||s.document!==this.document){this.target=s.target;this.document=s.document;this.blocked=null;this.cancel();}}
  refresh(edited=false){
    const s=this.state();
    this.bind(s);
    if(this.running||s.saving)return this.render('saving','Guardando…');
    if(!this.enabled){this.cancel();return this.render('paused',s.dirty?'Sin guardar · Autoguardado pausado':'Autoguardado pausado');}
    if(this.blocked){this.cancel();return this.render('blocked',this.blocked.code==='EXTERNAL_CHANGE'?'Conflicto · Sin guardar':'Sin guardar · Revisa el aviso',this.blocked.message);}
    if(s.pending){if(s.dirty&&s.target)this.schedule(500);return this.render('draft','Edición sin aplicar');}
    if(!s.target){this.cancel();return this.render('destination','Elige dónde guardar');}
    if(!s.dirty){this.cancel();return this.render('saved','Guardado');}
    this.render('pending','Cambios pendientes');
    if(edited||this.timer===null)this.schedule(s.busy?500:this.delay);
  }
  async flush(){
    this.cancel();const s=this.state();this.bind(s);
    if(this.running||!this.enabled||this.blocked||!s.dirty||!s.target){this.refresh();return false;}
    if(s.busy||s.pending||s.saving){this.refresh();return false;}
    this.running=true;this.render('saving','Guardando…');
    try{return await this.save(s);}
    catch(error){if(error.code!=='AUTO_DEFERRED')this.blocked=error;return false;}
    finally{this.running=false;this.refresh();}
  }
}
window.NaraAutoSave=NaraAutoSave;
