import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { MicrosoftWorkspace } from '../scripts/microsoft-workspace.js';

const account = { homeAccountId: 'generic-home', localAccountId: 'generic-local', tenantId: 'generic-tenant' };
const ref = { id: 'file-1', driveId: 'drive-1', name: 'Generic.bpmn', provider: 'onedrive' };
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture() {
  const values = new Map(), reads = [], writes = [];
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const auth = { account: { ...account }, generation: 1 };
  const files = {
    handle(file) {
      return { storageKind: 'microsoft', accountId: auth.account.homeAccountId, itemId: file.id, driveId: file.driveId, name: file.name, parent: { id: 'folder-1', name: 'Folder' },
        async getFile() { reads.push(file.id); return { name: 'Renamed.bpmn', text: async () => '<definitions>fresh remote content</definitions>' }; } };
    },
    async folder(file) {
      reads.push(file.id);
      return file.id === 'root' ? { id: 'root', name: 'Documents', root: {}, folder: {} } : { id: file.id, name: 'Current folder name', folder: {}, parentReference: { id: 'root', driveId: file.driveId } };
    }
  };
  const workspace = new MicrosoftWorkspace(auth, files, () => storage);
  const handle = files.handle(ref);
  return { auth, files, workspace, handle, storage, values, reads, writes };
}

test('workspace persists whitelisted references without XML, tokens or signed URLs', () => {
  const f = fixture();
  f.workspace.rememberFolder({ ...ref, id: 'folder-1', name: 'Folder', xml: 'private XML', accessToken: 'private token', '@microsoft.graph.downloadUrl': 'https://example.invalid/private' });
  f.handle.cache = '<definitions>private XML</definitions>';
  f.workspace.rememberFile(f.handle, { ...ref, token: 'private token' });
  const raw = [...f.values.values()][0];
  assert.doesNotMatch(raw, /private|definitions|downloadUrl|accessToken|cache/);
  assert.equal(f.workspace.read().last.id, 'file-1');
  assert.equal(f.workspace.read().folder.id, 'folder-1');
});

test('account and tenant histories stay isolated, including when switching back', () => {
  const f = fixture(); f.workspace.rememberFile(f.handle, ref);
  f.auth.account = { ...account, tenantId: 'different-tenant' };
  assert.equal(f.workspace.read().recent.length, 0);
  f.auth.account = { ...account, homeAccountId: 'different-home' };
  assert.equal(f.workspace.read().last, null);
  f.auth.account = { ...account };
  assert.equal(f.workspace.read().recent[0].id, 'file-1');
});

test('favorite folders retain only references, are bounded and isolated by tenant', () => {
  const f=fixture();
  for(let index=0;index<16;index++)f.workspace.toggleFavorite({...ref,id:'folder-'+index,name:'Folder '+index,xml:'private-content',accessToken:'private-token'});
  assert.equal(f.workspace.favorites().length,12);
  assert.equal(f.workspace.favorites()[0].id,'folder-15');
  assert.doesNotMatch([...f.values.values()].join(''),/private|xml|accessToken/);
  f.auth.account={...account,tenantId:'another-tenant'};assert.equal(f.workspace.favorites().length,0);
  f.auth.account={...account};assert.equal(f.workspace.favorites().length,12);
  f.workspace.toggleFavorite({...ref,id:'folder-15'});assert.equal(f.workspace.favorites().length,11);
  f.workspace.forget();assert.equal(f.workspace.favorites().length,0);assert.equal(f.values.size,0);
});

test('recents are bounded, unique by drive/item and reordered when reopened', () => {
  const f = fixture();
  for (let n = 0; n < 20; n++) f.workspace.rememberFile({ ...f.handle, itemId: 'file-' + n, name: n + '.bpmn' }, ref);
  assert.equal(f.workspace.read().recent.length, 12);
  f.workspace.rememberFile({ ...f.handle, itemId: 'file-10' }, ref);
  assert.equal(f.workspace.read().recent[0].id, 'file-10');
  assert.equal(f.workspace.read().recent.length, 12);
  f.workspace.rememberFile({ ...f.handle, itemId: 'file-10', driveId: 'another-drive' }, ref);
  assert.equal(f.workspace.read().recent.filter(item => item.id === 'file-10').length, 2);
});

test('forget clears only this account; clearing recents retains the folder and disables resume', () => {
  const f = fixture(); f.workspace.rememberFile(f.handle, ref);
  f.workspace.clearRecent();
  assert.equal(f.workspace.read().last, null);
  assert.equal(f.workspace.read().recent.length, 0);
  assert.equal(f.workspace.read().folder.id, 'folder-1');
  f.workspace.forget();
  assert.equal(f.values.size, 0);
  assert.equal(f.workspace.read().folder, null);
});

test('malformed or inaccessible storage never blocks the editor or restores arbitrary data', () => {
  const f = fixture(); f.workspace.rememberFile(f.handle, ref);
  const key = [...f.values.keys()][0];
  for (const raw of ['{bad json', JSON.stringify({ version: 999, last: ref }), 'x'.repeat(70000)]) {
    f.values.set(key, raw); assert.equal(f.workspace.read().last, null);
  }
  f.values.set(key, JSON.stringify({ version: 1, last: { ...ref, siteUrl: 'https://attacker.invalid/' }, recent: [null, { ...ref, name: 'not-bpmn.txt' }] }));
  assert.equal(f.workspace.read().last, null);
  assert.equal(f.workspace.read().recent.length, 0);
  const blocked = new MicrosoftWorkspace(f.auth, f.files, () => { throw new Error('storage blocked'); });
  assert.equal(blocked.rememberFile(f.handle, ref), false);
  assert.equal(blocked.read().last, null);
  assert.doesNotThrow(() => blocked.forget());
});

test('resume rereads fresh cloud content, not a cached document, and retains the chosen folder', async () => {
  const f = fixture(); f.workspace.rememberFile(f.handle, ref);
  f.workspace.rememberFolder({ ...ref, id: 'other-folder', name: 'Other folder' });
  let opened;
  assert.equal(await f.workspace.resume(() => true, async source => { opened = source; }), true);
  assert.deepEqual(f.reads, ['file-1']);
  assert.equal(opened.xml, '<definitions>fresh remote content</definitions>');
  assert.equal(f.workspace.read().folder.id, 'other-folder');
});

test('resume cannot replace a manual choice, edit or draft that appears during download', async () => {
  const f = fixture(); f.workspace.rememberFile(f.handle, ref);
  let eligible = false, opened = 0;
  assert.equal(await f.workspace.resume(() => eligible, async () => { opened++; }), false);
  assert.equal(f.reads.length, 0);
  eligible = true;
  const pending = defer(); f.files.handle = () => ({ getFile: () => pending.promise });
  const task = f.workspace.resume(() => eligible, async () => { opened++; });
  eligible = false; pending.resolve({ name: 'Generic.bpmn', text: async () => '<definitions/>' });
  assert.equal(await task, false);
  assert.equal(opened, 0);
});

test('disconnect or a tenant change invalidates a pending resume without writing another history', async () => {
  for (const next of [null, { ...account, tenantId: 'other-tenant' }]) {
    const f = fixture(); f.workspace.rememberFile(f.handle, ref);
    const pending = defer(); f.files.handle = () => ({ getFile: () => pending.promise });
    const task = f.workspace.resume(() => true, async () => assert.fail('Must not import another identity'));
    f.auth.account = next; f.auth.generation++;
    pending.resolve({ name: 'Generic.bpmn', text: async () => '<definitions/>' });
    await assert.rejects(task, { code: 'ACCOUNT_CHANGED' });
    assert.equal(f.workspace.read().last, null);
  }
});

test('clearing recent references in another tab cancels an already pending resume', async () => {
  const f = fixture(); f.workspace.rememberFile(f.handle, ref);
  const pending = defer(); f.files.handle = () => ({ getFile: () => pending.promise });
  const task = f.workspace.resume(() => true, async () => assert.fail('A cleared last file cannot reopen'));
  f.workspace.clearRecent(); pending.resolve({ name: 'Generic.bpmn', text: async () => '<definitions/>' });
  assert.equal(await task, false);
});

test('unavailable recent cleanup cannot clear another account after switching identity', () => {
  const f = fixture(); f.workspace.rememberFile(f.handle, ref); const stamp = f.workspace.stamp();
  f.auth.account = { ...account, tenantId: 'other-tenant' }; f.auth.generation++;
  f.workspace.rememberFile(f.handle, ref);
  f.workspace.removeFile(ref, stamp);
  assert.equal(f.workspace.read().last.id, ref.id);
});

test('folder recovery resolves current names and breadcrumbs for OneDrive and SharePoint', async () => {
  const f = fixture();
  const oneDrive = await f.workspace.folder({ ...ref, id: 'folder-1', name: 'Old folder' });
  assert.equal(oneDrive.folder.name, 'Current folder name');
  assert.equal(oneDrive.parents[0].name, 'OneDrive');
  const sp = await f.workspace.folder({ ...ref, id: 'folder-1', provider: 'sharepoint', siteUrl: 'https://example.sharepoint.com/sites/Generic' });
  assert.equal(sp.parents[0].name, 'Documents');
  assert.equal(sp.siteUrl, 'https://example.sharepoint.com/sites/Generic');
  f.files.folder = async () => ({ id: 'folder-1', name: 'Loop', parentReference: { id: 'folder-1' } });
  await assert.rejects(() => f.workspace.folder({ ...ref, id: 'folder-1' }), { code: 'INVALID_TARGET' });
});

test('deleting a stale recent reference updates the last pointer without deleting cloud files', async () => {
  const f = fixture(); f.workspace.rememberFile(f.handle, ref); f.workspace.removeFile(ref);
  assert.equal(f.workspace.read().recent.length, 0); assert.equal(f.workspace.read().last, null);
  assert.equal(f.reads.length, 0);
});

test('the real import guard preserves user work changed during asynchronous serialization', async () => {
  const source = await readFile(new URL('../modelador.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function acceptBrowserSource('), end = source.indexOf('\nasync function openBrowserFile(', start);
  const pending = defer(); let imports = 0;
  const context = { browserFiles: { validate() {} }, dirty: true, ready: true, browserDocumentVersion: 1, modeler: { saveXML: () => pending.promise }, openDiagram: async () => { imports++; } };
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  let eligible = true;
  const task = context.acceptBrowserSource({ xml: '<definitions/>' }, () => eligible);
  eligible = false; pending.resolve({ xml: '<definitions>my changes</definitions>' });
  assert.equal(await task, false);
  assert.equal(imports, 0);
  assert.equal(context.dirty, true);
  assert.equal(context.browserDocumentVersion, 1);
});

test('the UI exposes restoration as pending until startup and workspace resume both settle',async()=>{
 const f=fixture(),startup=defer(),resume=defer();f.auth.initialized=Promise.resolve();f.auth.onChange=()=>{};f.workspace.resume=()=>resume.promise;
 const nodes=new Map(),byId=id=>{if(!nodes.has(id))nodes.set(id,{open:false,value:'',classList:{toggle(){}},setAttribute(){},querySelectorAll:()=>[],replaceChildren(){},addEventListener(){}});return nodes.get(id);};
 const context={URLSearchParams,location:{search:''},byId,browserFiles:{handle:null},saving:false,ready:true,dirty:false,loadingDiagram:false,filePolling:false,standalone:true,browserDocumentVersion:1,window:{projectReady:true,NaraInitialDocumentVersion:1,NaraPropertyDraftPending:()=>false,NaraStartup:startup.promise,NaraMicrosoft:{create:()=>({auth:f.auth,files:f.files,workspace:f.workspace})}},status(){}};
 vm.runInNewContext(await readFile(new URL('../microsoft-ui.js',import.meta.url),'utf8'),context);
 assert.equal(context.window.NaraMicrosoftUI.restoring(),true);startup.resolve();await new Promise(resolve=>setImmediate(resolve));assert.equal(context.window.NaraMicrosoftUI.restoring(),true);
 resume.resolve(false);await new Promise(resolve=>setImmediate(resolve));assert.equal(context.window.NaraMicrosoftUI.restoring(),false);
});

test('the UI preserves a recovered diagram as an unsaved copy if its account changes during import', async () => {
  const f = fixture(); f.workspace.rememberFile(f.handle, ref);
  f.auth.initialized = Promise.resolve(); f.auth.onChange = () => {};
  const elements = new Map();
  const byId = id => {
    if (!elements.has(id)) elements.set(id, { open: false, value: '', classList: { toggle() {} }, setAttribute() {}, querySelectorAll: () => [], replaceChildren() {}, addEventListener() {} });
    return elements.get(id);
  };
  const files = { handle: null, hash: null, name: 'Generic.bpmn' };
  const context = { URLSearchParams,location:{search:''},byId, browserFiles: files, standalone: true, ready: true, dirty: false, saving: false, loadingDiagram: false, filePolling: false, browserDocumentVersion: 1,
    window: { projectReady: true, NaraInitialDocumentVersion: 1, NaraStartup: Promise.resolve(), NaraPropertyDraftPending: () => false, NaraMicrosoft: { create: () => ({ auth: f.auth, files: f.files, workspace: f.workspace }) } },
    acceptBrowserSource: async source => { files.handle = source.handle; f.auth.account = null; f.auth.generation++; return true; },
    browserFileContext() {}, setDirty(value) { context.dirty = value; }, status(message) { context.statusMessage = message; }
  };
  vm.runInNewContext(await readFile(new URL('../microsoft-ui.js', import.meta.url), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(files.handle, null);
  assert.equal(context.dirty, true);
  assert.match(context.statusMessage, /diagrama sigue abierto/);
});

test('an explicit new-document link never reads or resumes a remembered Microsoft file',async()=>{
 const f=fixture();f.workspace.rememberFile(f.handle,ref);f.auth.initialized=Promise.resolve();f.auth.onChange=()=>{};let resumes=0;f.workspace.resume=async()=>{resumes++;return false;};
 const nodes=new Map(),byId=id=>{if(!nodes.has(id))nodes.set(id,{open:false,value:'',classList:{toggle(){}},setAttribute(){},querySelectorAll:()=>[],replaceChildren(){},addEventListener(){}});return nodes.get(id);};
 const context={URLSearchParams,location:{search:'?nuevo=1'},byId,browserFiles:{handle:null},saving:false,ready:true,dirty:false,loadingDiagram:false,filePolling:false,standalone:true,browserDocumentVersion:1,window:{projectReady:true,NaraInitialDocumentVersion:1,NaraPropertyDraftPending:()=>false,NaraStartup:Promise.resolve(),NaraMicrosoft:{create:()=>({auth:f.auth,files:f.files,workspace:f.workspace})}},status(){}};
 vm.runInNewContext(await readFile(new URL('../microsoft-ui.js',import.meta.url),'utf8'),context);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(resumes,0);assert.equal(f.reads.length,0);assert.equal(f.workspace.read().last.id,ref.id);assert.equal(context.window.NaraMicrosoftUI.restoring(),false);
});
