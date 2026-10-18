import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { MicrosoftFiles, graphUrl, bpmnName, sharePointPath, MAX_BYTES } from '../microsoft-files.js';

function fixture() {
  const auth = { account: { homeAccountId: 'generic-user-1' }, async token() { return 'generic-test-token'; } };
  const calls = []; let xml = '<definitions>generic-1</definitions>', tag = '"revision-1"', writes = 0;
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.startsWith('https://example.sharepoint.com/download')) return new Response(xml);
    if (options.method === 'PUT') {
      writes++;
      if (options.headers['If-Match'] !== tag) return new Response('', { status: 412 });
      xml = options.body; tag = '"revision-' + (writes + 1) + '"';
      return Response.json({ id: 'item-1', name: 'Generic.bpmn', eTag: tag });
    }
    const meta = { id: 'item-1', name: 'Generic.bpmn', size: Buffer.byteLength(xml), eTag: tag, file: {}, '@microsoft.graph.downloadUrl': 'https://example.sharepoint.com/download' };
    // Reproduce SharePoint's omitted computed annotation with a projected response.
    if (new URL(url).searchParams.has('$select')) delete meta['@microsoft.graph.downloadUrl'];
    return Response.json(meta);
  };
  const store = new MicrosoftFiles(auth, fetcher);
  return { auth, calls, store, handle: store.handle({ id: 'item-1', name: 'Generic.bpmn', driveId: 'drive-1' }), change() { xml = '<definitions>external</definitions>'; tag = '"external"'; }, writes: () => writes };
}
test('Graph targets and user-provided site/file paths are constrained', () => {
  assert.throws(() => graphUrl('https://attacker.invalid/steal'));
  assert.throws(() => graphUrl('/beta/me'));
  assert.throws(() => sharePointPath('https://tenant.sharepoint.com.attacker.invalid/sites/Process'));
  assert.throws(() => sharePointPath('https://tenant.sharepoint.com/sites/Process?secret=test'));
  assert.equal(sharePointPath('https://tenant.sharepoint.com/sites/Process'), 'sites/tenant.sharepoint.com:/sites/Process');
  assert.throws(() => bpmnName('../Private'));
  assert.equal(bpmnName('Generic'), 'Generic.bpmn');
});

test('version history is read-only, scoped to the current file and rejects account changes', async () => {
  const f=fixture(),responses=[{value:[{id:'2'}],'@odata.nextLink':'https://graph.microsoft.com/v1.0/drives/drive-1/items/item-1/versions?$skiptoken=next'},{value:[{id:'1'}]}];
  f.store.fetcher=async(url,options)=>{f.calls.push({url,options});return Response.json(responses.shift());};
  const first=await f.store.versions(f.handle);assert.equal(first.value[0].id,'2');
  const second=await f.store.versions(f.handle,first['@odata.nextLink']);assert.equal(second.value[0].id,'1');
  assert.ok(f.calls.every(call=>!call.options.method||call.options.method==='GET'));
  const before=f.calls.length;
  await assert.rejects(()=>f.store.versions(f.handle,'https://graph.microsoft.com/v1.0/drives/drive-1/items/other/versions?$skiptoken=next'),{code:'INVALID_TARGET'});
  await assert.rejects(()=>f.store.versions(f.handle,'https://attacker.invalid/history'),{code:'INVALID_TARGET'});
  f.auth.account.homeAccountId='different';await assert.rejects(()=>f.store.versions(f.handle),{code:'ACCOUNT_CHANGED'});
  assert.equal(f.calls.length,before);
});
test('download URL never receives a bearer token and snapshots remain stable', async () => {
  const f = fixture(), file = await f.handle.getFile();
  assert.equal(await file.text(), '<definitions>generic-1</definitions>');
  const download = f.calls.find(c => c.url.includes('/download'));
  assert.equal(download.options.headers, undefined);
  assert.equal(download.options.credentials, 'omit');
  f.change(); await f.handle.getFile();
  assert.equal(await file.text(), '<definitions>generic-1</definitions>');
});

test('an unchanged cloud revision uses metadata only, without reading or downloading XML',async()=>{
  const f=fixture();await f.handle.getFile();const base=f.handle.etag;f.calls.length=0;
  assert.equal(await f.handle.getFile({ifChangedSince:base}),null);
  assert.equal(f.calls.length,1);assert.equal(new URL(f.calls[0].url).hostname,'graph.microsoft.com');
  f.change();const changed=await f.handle.getFile({ifChangedSince:base});assert.equal(await changed.text(),'<definitions>external</definitions>');
});

test('Microsoft throttling exposes Retry-After for the polling backoff',async()=>{
  const auth={account:{homeAccountId:'generic'},async token(){return'generic';}};
  const files=new MicrosoftFiles(auth,async()=>new Response('',{status:429,headers:{'Retry-After':'90'}}));
  await assert.rejects(()=>files.request('me/drive'),{code:'THROTTLED',retryAfterMs:90000});
});
test('recovery copies use the original folder, a unique bounded name and the original account',async()=>{
  const f=fixture();f.handle.parent={id:'generic-folder'};f.handle.name='A'.repeat(190)+'.bpmn';const calls=[];
  f.store.create=async(folder,name,xml)=>{calls.push({folder,name,xml});return{name};};
  await f.handle.recoveryCopy('<definitions/>');await f.handle.recoveryCopy('<definitions/>');
  assert.equal(calls[0].folder.id,'generic-folder');assert.equal(calls[0].folder.driveId,'drive-1');assert.ok(calls[0].name.length<=200);assert.notEqual(calls[0].name,calls[1].name);
  f.handle.parent=null;f.handle.getFile=async()=>{f.handle.parent={id:'generic-folder'};f.auth.account={homeAccountId:'other'};};
  await assert.rejects(()=>f.handle.recoveryCopy('<definitions/>'),{code:'ACCOUNT_CHANGED'});assert.equal(calls.length,2);
});
test('a changed account cannot read or save another account file', async () => {
  const f = fixture(); await f.handle.getFile(); f.auth.account.homeAccountId = 'other-user';
  await assert.rejects(() => f.handle.getFile(), { code: 'ACCOUNT_CHANGED' });
  await assert.rejects(() => f.handle.createWritable(), { code: 'ACCOUNT_CHANGED' });
  assert.equal(f.writes(), 0);
});

test('an invalid site cannot trigger an additional permission request', async () => {
  const f = fixture(); let tokenRequests = 0;
  f.auth.token = async () => { tokenRequests++; return 'generic-test-token'; };
  await assert.rejects(() => f.store.siteDrives('https://attacker.invalid/sites/test', { authorize: true }), { code: 'INVALID_SITE' });
  assert.equal(tokenRequests, 0);
  assert.equal(f.calls.length, 0);
});
test('etag conflict is refused and no automatic overwrite is attempted', async () => {
  const f = fixture(); await f.handle.getFile(); const writer = await f.handle.createWritable();
  await writer.write('<definitions>local-change</definitions>'); f.change();
  await assert.rejects(() => writer.close(), { code: 'EXTERNAL_CHANGE' });
  assert.equal(f.writes(), 1);
  assert.equal(f.calls.find(c => c.options.method === 'PUT').options.headers['If-Match'], '"revision-1"');
});
test('successful save rereads and verifies the remote content', async () => {
  const f = fixture(); await f.handle.getFile(); const writer = await f.handle.createWritable();
  await writer.write('<definitions>saved</definitions>'); await writer.close();
  assert.equal(await (await f.handle.getFile()).text(), '<definitions>saved</definitions>');
  assert.equal(f.handle.uncertain, false);
});
test('ambiguous writes require reconciliation and cannot be blindly retried', async () => {
  const f = fixture(); await f.handle.getFile(); const writer = await f.handle.createWritable();
  f.store.fetcher = async () => { throw new Error('generic network interruption'); };
  await writer.write('<definitions>changed</definitions>');
  await assert.rejects(() => writer.close(), { code: 'SAVE_UNCERTAIN' });
  await assert.rejects(() => f.handle.createWritable(), { code: 'SAVE_UNCERTAIN' });
});
test('large downloads are refused and remote identity includes account and drive', async () => {
  const f = fixture(); f.store.fetcher = async () => Response.json({ eTag: '"v1"', file: {}, size: MAX_BYTES + 1 });
  await assert.rejects(() => f.handle.getFile(), { code: 'FILE_TOO_LARGE' });
  assert.equal(await f.handle.isSameEntry(f.store.handle({ id: 'item-1', driveId: 'drive-1' })), true);
  assert.equal(await f.handle.isSameEntry(f.store.handle({ id: 'item-1', driveId: 'different-drive' })), false);
});
test('save as requests fail-on-conflict and verifies the created file', async () => {
  const f = fixture(); let created;
  const fetcher = f.store.fetcher;
  f.store.fetcher = async (url, options) => {
    if (options.method === 'PUT') { created = { url, options }; return Response.json({ id: 'item-1', name: 'Generic.bpmn' }); }
    return fetcher(url, options);
  };
  await f.store.create({ driveId: 'drive-1', id: 'folder-1' }, 'Generic', '<definitions>generic-1</definitions>');
  assert.match(created.url, /conflictBehavior=fail$/);
  assert.equal(created.options.headers.Authorization, 'Bearer generic-test-token');
});

const browserSource = await readFile(new URL('../archivos.js', import.meta.url), 'utf8');
function browserSession() {
  const context = { window: {}, crypto, TextEncoder, Uint8Array };
  vm.runInNewContext(browserSource, context);
  const files = new context.window.BrowserBpmnFiles();
  // XML parsing belongs to the browser; this exercises the real storage contract.
  files.validate = () => {};
  files.historyDatabase = () => { throw new Error('Cloud content must not enter persistent history'); };
  return files;
}

test('the browser save path verifies a Microsoft handle without persistent history', async () => {
  const f = fixture(), files = browserSession();
  const xml = await (await f.handle.getFile()).text();
  await files.attach({ handle: f.handle, name: 'Generic.bpmn', xml });
  await files.save('<definitions>browser-save</definitions>');
  assert.equal(files.hash, await files.digest('<definitions>browser-save</definitions>'));
  assert.equal(files.handle, f.handle);
  assert.equal(f.writes(), 1);
  assert.equal(files.busy, false);
});

test('a conflict during browser save preserves its base and the remote edit', async () => {
  const f = fixture(), files = browserSession();
  await files.attach({ handle: f.handle, name: 'Generic.bpmn', xml: await (await f.handle.getFile()).text() });
  const base = files.hash, fetcher = f.store.fetcher;
  f.store.fetcher = (url, options) => {
    if (options.method === 'PUT') f.change();
    return fetcher(url, options);
  };
  await assert.rejects(() => files.save('<definitions>local-unsaved</definitions>'), { code: 'EXTERNAL_CHANGE' });
  assert.equal(files.hash, base);
  assert.equal(await (await f.handle.getFile()).text(), '<definitions>external</definitions>');
  assert.equal(files.busy, false);
});
