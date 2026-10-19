import { problem, sharePointPath } from '../microsoft-files.js';

const PREFIX = 'narabizagui.microsoft.workspace.v1.';
const LIMIT = 12;
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 1024 && !/[\x00-\x1f]/.test(value);
const sameFile = (a, b) => a && b && a.driveId === b.driveId && a.id === b.id;
const empty = () => ({ version: 1, folder: null, last: null, recent: [] });
const identity = account => account ? JSON.stringify([account.homeAccountId, account.localAccountId, account.tenantId]) : null;
function reference(value) {
  if (!value || !text(value.id) || !text(value.driveId) || !text(value.name) || !['onedrive', 'sharepoint'].includes(value.provider)) return null;
  const result = { id: value.id, driveId: value.driveId, name: value.name, provider: value.provider };
  if (value.siteUrl) {
    try { sharePointPath(value.siteUrl); result.siteUrl = value.siteUrl; } catch { return null; }
  }
  return result;
}
function clean(value) {
  if (!value || value.version !== 1) return empty();
  const recent = [];
  for (const item of Array.isArray(value.recent) ? value.recent.slice(0, 100) : []) {
    const ref = reference(item);
    if (ref && /\.bpmn$/i.test(ref.name) && !recent.some(other => sameFile(ref, other))) recent.push(ref);
    if (recent.length === LIMIT) break;
  }
  const last = reference(value.last);
  return { version: 1, folder: reference(value.folder), last: last && /\.bpmn$/i.test(last.name) ? last : null, recent };
}

// Persist references only. XML, tokens, download URLs and Graph responses must
// never enter this cache. Each tenant/account has an independent workspace.
export class MicrosoftWorkspace {
  constructor(auth, files, storage = () => window.localStorage, tabStorage = () => window.sessionStorage) { this.auth = auth; this.files = files; this.storage = storage; this.tabStorage = tabStorage; this.current = new Map(); }
  key() { const account = identity(this.auth.account); return account ? PREFIX + encodeURIComponent(account) : null; }
  currentFile() {
    const key = this.key(); if (!key) return null;
    try { return reference(JSON.parse(this.tabStorage().getItem(key + '.current') || 'null')); }
    catch { return this.current.get(key) || null; }
  }
  setCurrent(file) {
    const key = this.key(); if (!key) return;
    const value = reference(file); this.current.set(key, value);
    try { if (value) this.tabStorage().setItem(key + '.current', JSON.stringify(value)); else this.tabStorage().removeItem(key + '.current'); } catch { /* In-memory fallback for this tab only. */ }
  }
  clearCurrent() {
    this.setCurrent(null);this.current.clear();
    try{const s=this.tabStorage();for(let i=s.length-1;i>=0;i--){const key=s.key(i);if(key?.startsWith(PREFIX)&&key.endsWith('.current'))s.removeItem(key);}}catch{/* In-memory selection was cleared. */}
  }
  read() {
    const key = this.key();
    try {
      const raw = key && this.storage().getItem(key);
      if (!raw || raw.length > 65536) return empty();
      return clean(JSON.parse(raw));
    } catch { return empty(); }
  }
  write(value) {
    const key = this.key();
    try { if (key) { this.storage().setItem(key, JSON.stringify(clean(value))); return true; } } catch { /* Browser storage may be unavailable. */ }
    return false;
  }
  forget() { this.clearCurrent(); try { const key = this.key(); if (key) {this.storage().removeItem(key);this.storage().removeItem(key+'.favorites');} } catch { /* No persistent state to clear. */ } }
  favorites() {try{const key=this.key();if(!key)return[];const saved=JSON.parse(this.storage().getItem(key+'.favorites')||'[]');return Array.isArray(saved)?saved.slice(0,12).map(reference).filter(Boolean):[];}catch{return[];}}
  toggleFavorite(folder) {const ref=reference(folder),key=this.key();if(!ref||!key)return false;const values=this.favorites(),existing=values.findIndex(value=>sameFile(value,ref));if(existing>=0)values.splice(existing,1);else values.unshift(ref);try{this.storage().setItem(key+'.favorites',JSON.stringify(values.slice(0,12)));return true;}catch{return false;}}
  rememberFolder(folder) { const value = this.read(); value.folder = reference(folder); return this.write(value); }
  rememberFile(handle, context, { updateFolder = true } = {}) {
    if (handle.storageKind !== 'microsoft' || handle.accountId !== this.auth.account?.homeAccountId) return false;
    const file = reference({ id: handle.itemId, driveId: handle.driveId, name: handle.name, provider: context.provider, siteUrl: context.siteUrl });
    if (!file || !/\.bpmn$/i.test(file.name)) return false;
    this.setCurrent(file);
    const value = this.read();
    value.last = file; value.recent = [file, ...value.recent.filter(other => !sameFile(file, other))].slice(0, LIMIT);
    if (updateFolder && handle.parent?.id) value.folder = reference({ ...file, id: handle.parent.id, name: handle.parent.name || 'Carpeta' });
    return this.write(value);
  }
  removeFile(file, stamp = this.stamp()) {
    try { this.assert(stamp); } catch { return; }
    const value = this.read(); value.recent = value.recent.filter(other => !sameFile(file, other));
    if (sameFile(value.last, file)) value.last = null;
    if (sameFile(this.currentFile(), file)) this.clearCurrent();
    this.write(value);
  }
  clearRecent() { this.clearCurrent(); const value = this.read(); value.last = null; value.recent = []; this.write(value); }
  stamp() { return { identity: identity(this.auth.account), generation: this.auth.generation }; }
  assert(stamp) {
    if (!stamp.identity || stamp.identity !== identity(this.auth.account) || stamp.generation !== this.auth.generation) throw problem('ACCOUNT_CHANGED', 'La cuenta Microsoft cambió. Vuelve a abrir el archivo.');
  }
  async folder(reference) {
    const stamp = this.stamp(), trail = [], seen = new Set();
    let next = reference;
    for (;;) {
      if (trail.length >= 64 || seen.has(next.id)) throw problem('INVALID_TARGET', 'No se pudo recuperar la ruta de la carpeta.');
      seen.add(next.id);
      const item = await this.files.folder(next); this.assert(stamp);
      trail.push({ id: item.id, driveId: reference.driveId, name: item.root && reference.provider === 'onedrive' ? 'OneDrive' : item.name });
      if (item.root || !item.parentReference?.id) break;
      if (item.parentReference.driveId && item.parentReference.driveId !== reference.driveId) throw problem('INVALID_TARGET', 'La carpeta cambió de biblioteca.');
      next = { id: item.parentReference.id, driveId: reference.driveId };
    }
    trail.reverse();
    return { folder: trail.at(-1), parents: trail.slice(0, -1), provider: reference.provider, siteUrl: reference.siteUrl || '' };
  }
  async source(file) {
    const stamp = this.stamp();
    const handle = this.files.handle(file);
    const remote = await handle.getFile(), xml = await remote.text(); this.assert(stamp);
    return { source: { handle, name: remote.name, xml }, stamp };
  }
  async resume(canApply, accept) {
    const file = this.currentFile();
    const current = () => sameFile(file, this.currentFile()) && canApply();
    if (!file || !current()) return false;
    const { source, stamp } = await this.source(file);
    if (!current()) return false;
    this.assert(stamp);
    const applied = await accept(source, () => { this.assert(stamp); return current(); });
    this.assert(stamp);
    if (applied === false) return false;
    this.rememberFile(source.handle, file, { updateFolder: false });
    return true;
  }
}
