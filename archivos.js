'use strict';
// Solo maneja archivos elegidos por el usuario. No sube BPMN a la web.
class BrowserBpmnFiles {
  constructor() { this.handle=null; this.hash=null; this.version=null; this.name='Sin título.bpmn'; this.busy=false; this.uncertain=null; }
  async digest(xml) {
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(xml));
    return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  }
  validate(xml) {
    const parsed=new DOMParser().parseFromString(xml,'application/xml');
    if (xml.length>8*1024*1024 || /<!DOCTYPE|<!ENTITY/i.test(xml) || parsed.querySelector('parsererror') || parsed.documentElement.localName!=='definitions' || parsed.documentElement.namespaceURI!=='http://www.omg.org/spec/BPMN/20100524/MODEL') throw new Error('El archivo no es un BPMN válido o supera 8 MB.');
  }
  async pickOpen() {
    const [handle]=await window.showOpenFilePicker({multiple:false,types:[{description:'Diagrama BPMN',accept:{'application/xml':['.bpmn','.xml']}}]});
    if(handle.requestPermission)await handle.requestPermission({mode:'readwrite'}).catch(()=>{});
    const file=await handle.getFile(),xml=await file.text(); this.validate(xml);
    return {handle,name:file.name,xml,hash:await this.digest(xml)};
  }
  async attach(source) { this.handle=source.handle||null;this.name=source.name;this.hash=source.hash||await this.digest(source.xml);this.version=this.handle?.etag||null;this.uncertain=null; }
  async read({onlyChanged=false}={}) {
    if (!this.handle) return null;
    const file=await this.handle.getFile(onlyChanged&&this.handle.storageKind==='microsoft'?{ifChangedSince:this.version}:undefined);
    if(!file)return null;
    const xml=await file.text();this.validate(xml);
    return {handle:this.handle,name:file.name,xml,hash:await this.digest(xml)};
  }
  async pickSave(name=this.name) {
    return window.showSaveFilePicker({suggestedName:name,types:[{description:'Diagrama BPMN',accept:{'application/xml':['.bpmn']}}]});
  }
  async historyDatabase() {
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open('narabizagui-history',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('revisions',{keyPath:'id'});
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
  }
  async backup(source) {
    if (!source.xml.trim()) return;
    const db=await this.historyDatabase();
    try { await new Promise((resolve,reject)=>{
      const tx=db.transaction('revisions','readwrite');
      tx.objectStore('revisions').put({id:source.name+'|'+source.hash,name:source.name,sha256:source.hash,date:new Date().toISOString(),xml:source.xml});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('No se pudo conservar la revisión anterior.'));
    }); } finally {db.close();}
  }
  async revisions() {
    const db=await this.historyDatabase();
    try{return await new Promise((resolve,reject)=>{
      const request=db.transaction('revisions').objectStore('revisions').getAll();
      request.onsuccess=()=>resolve(request.result.sort((a,b)=>b.date.localeCompare(a.date)));request.onerror=()=>reject(request.error);
    });}finally{db.close();}
  }
  async save(xml,handle=this.handle,{canCommit=()=>true}={}) {
    this.validate(xml);
    if (this.busy) throw new Error('Ya hay un guardado en curso.');
    if(this.uncertain===handle)throw Object.assign(new Error('Hay un guardado sin confirmar. Recarga el archivo antes de volver a guardar.'),{code:'SAVE_UNCERTAIN'});
    this.busy=true;
    let writable,closing=false;
    const guard=()=>{if(!canCommit())throw Object.assign(new Error('El archivo o la cuenta cambió durante el guardado. Conserva tus cambios.'),{code:'FILE_CHANGED'});};
    const perform=async()=>{
      guard();
      const previous=await handle.getFile(),oldXml=await previous.text(),oldHash=await this.digest(oldXml);
      const same=this.handle && await handle.isSameEntry(this.handle);
      if (same && this.hash!==oldHash) {const error=new Error('El archivo cambió fuera del visor. Exporta tus cambios o carga la revisión del archivo antes de guardar.');error.code='EXTERNAL_CHANGE';throw error;}
      // Cloud documents must not leak through persistent, account-independent history.
      if (handle.storageKind !== 'microsoft') await this.backup({name:previous.name,xml:oldXml,hash:oldHash});
      guard();writable=await handle.createWritable({mode:'exclusive'});
      // Segunda lectura después de obtener permiso y conservar la revisión.
      const latest=await handle.getFile();
      if (await this.digest(await latest.text())!==oldHash) {const error=new Error('El archivo cambió durante el guardado. Se conservó la edición del visor.');error.code='EXTERNAL_CHANGE';throw error;}
      guard();await writable.write(xml);guard();closing=true;await writable.close();writable=null;
      const persisted=await handle.getFile(),savedHash=await this.digest(await persisted.text());
      if(savedHash!==await this.digest(xml))throw Object.assign(new Error('No se pudo comprobar el contenido guardado. Recarga antes de volver a guardar.'),{code:'SAVE_NOT_VERIFIED'});
      guard();this.handle=handle;this.name=handle.name;this.hash=savedHash;this.version=handle.etag||null;this.uncertain=null;
    };
    try{
      const locks=typeof navigator!=='undefined'&&navigator.locks;
      if(handle.storageKind!=='microsoft'&&locks)await locks.request('narabizagui-local-bpmn-write',{mode:'exclusive'},perform);else await perform();
    }catch(error){if(closing&&!['EXTERNAL_CHANGE','MICROSOFT_PERMISSION','MICROSOFT_CONNECT','THROTTLED'].includes(error.code)){this.uncertain=handle;if(error.code!=='SAVE_NOT_VERIFIED')throw Object.assign(new Error('No se pudo confirmar el guardado. Conserva tus cambios y recarga el archivo antes de guardar de nuevo.'),{code:'SAVE_UNCERTAIN',cause:error});}throw error;}
    finally{if(writable)await writable.abort().catch(()=>{});this.busy=false;}
  }
}
window.BrowserBpmnFiles=BrowserBpmnFiles;
