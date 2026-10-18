import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { MicrosoftAccount } from '../scripts/microsoft-account.js';

const user = { homeAccountId: 'generic-home', localAccountId: 'generic-local', tenantId: 'generic-tenant', username: 'generic@example.invalid' };
const other = { ...user, homeAccountId: 'other-home', localAccountId: 'other-local' };
const settings = { interactionRequired: error => error.code === 'interaction_required', accountChanged: 'active-account-changed' };
const result = account => ({ account, accessToken: 'generic-test-access' });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture(active = user) {
  const shared = { active, accounts: active ? [active] : [], callbacks: new Set() };
  function client() {
    const calls = { silent: 0, login: 0, popup: 0, clear: 0 };
    return {
      calls,
      async initialize() {},
      getActiveAccount() { return shared.active; },
      addEventCallback(callback) { shared.callbacks.add(callback); },
      setActiveAccount(account) { shared.active = account; for (const callback of shared.callbacks) callback(); },
      async clearCache() { calls.clear++; shared.accounts = []; },
      async acquireTokenSilent({ account }) { calls.silent++; return result(account); },
      async loginPopup() { calls.login++; shared.accounts.push(user); return result(user); },
      async acquireTokenPopup({ account }) { calls.popup++; return result(account); }
    };
  }
  return { shared, client, account: c => new MicrosoftAccount(c, settings) };
}

test('reload restores the explicitly active account only after silent access succeeds', async () => {
  const f = fixture(), c = f.client(), auth = f.account(c), changes = [];
  auth.onChange(change => changes.push(change));
  assert.equal(auth.account, null);
  await auth.initialized;
  assert.equal(auth.account, user);
  assert.equal(changes[0].reason, 'restored');
  assert.equal(c.calls.silent, 1);
  assert.equal(c.calls.login + c.calls.popup, 0);
});

test('a cached account list without an active selection cannot resurrect a disconnected user', async () => {
  const f = fixture(null); f.shared.accounts = [other, user];
  const c = f.client(), auth = f.account(c); await auth.initialized;
  assert.equal(auth.account, null);
  assert.equal(c.calls.silent + c.calls.login + c.calls.popup, 0);
});

test('expired consent or offline startup requires an explicit connection without opening a popup', async () => {
  for (const code of ['interaction_required', 'offline']) {
    const f = fixture(), c = f.client();
    c.acquireTokenSilent = async () => { throw Object.assign(new Error('generic error'), { code }); };
    const auth = f.account(c); await auth.initialized;
    assert.equal(auth.account, null);
    assert.equal(c.calls.login + c.calls.popup, 0);
  }
});

test('a new tab recovers the account selected through a successful login', async () => {
  const f = fixture(null), c = f.client(), first = f.account(c); await first.initialized;
  await first.connect();
  const nextClient = f.client(), next = f.account(nextClient); await next.initialized;
  assert.equal(next.account, user);
  assert.equal(nextClient.calls.login + nextClient.calls.popup, 0);
});

test('disconnect clears app cache and invalidates other tabs and their pending token requests', async () => {
  const f = fixture(), a = f.account(f.client()), c = f.client(), b = f.account(c);
  await Promise.all([a.initialized, b.initialized]);
  const pending = deferred(); c.acquireTokenSilent = () => pending.promise;
  const token = b.token(['Files.ReadWrite.All']);
  await Promise.resolve();
  await a.disconnect(); pending.resolve(result(user));
  await assert.rejects(token, { code: 'ACCOUNT_CHANGED' });
  assert.equal(b.account, null);
  assert.equal(f.shared.active, null);
  assert.equal(f.shared.accounts.length, 0);
  const reopened = f.account(f.client()); await reopened.initialized;
  assert.equal(reopened.account, null);
});

test('disconnect wins over an in-flight startup restore', async () => {
  const f = fixture(), c = f.client(), pending = deferred(); c.acquireTokenSilent = () => pending.promise;
  const auth = f.account(c); await auth.clientReady;
  await auth.disconnect(); pending.resolve(result(user)); await auth.initialized;
  assert.equal(auth.account, null);
});

test('logout in another tab prevents a late login result from reconnecting the page', async () => {
  const f = fixture(null), a = f.account(f.client()), c = f.client(), b = f.account(c);
  await Promise.all([a.initialized, b.initialized]);
  const pending = deferred(); c.loginPopup = () => pending.promise;
  const login = b.connect(); await Promise.resolve();
  await a.disconnect(); pending.resolve(result(user));
  await assert.rejects(login, { code: 'ACCOUNT_CHANGED' });
  assert.equal(b.account, null);
  assert.equal(f.shared.active, null);
});

test('switching account or tenant invalidates old access without adopting another identity', async () => {
  for (const next of [other, { ...user, tenantId: 'different-tenant' }]) {
    const f = fixture(), c = f.client(), auth = f.account(c); await auth.initialized;
    c.setActiveAccount(next);
    assert.equal(auth.account, null);
    await assert.rejects(() => auth.token(['User.Read']), { code: 'MICROSOFT_CONNECT' });
  }
});

test('focus reconciliation invalidates a changed selection even if its broadcast was missed', async () => {
  const f = fixture(), auth = f.account(f.client()); await auth.initialized;
  f.shared.active = other; auth.synchronize();
  assert.equal(auth.account, null);
});

test('silent tokens renew access; interactive fallback is restricted to an explicit request', async () => {
  const f = fixture(), c = f.client(), auth = f.account(c); await auth.initialized;
  assert.equal(await auth.token(['User.Read']), 'generic-test-access');
  c.acquireTokenSilent = async () => { throw Object.assign(new Error('generic expired'), { code: 'interaction_required' }); };
  assert.equal(await auth.token(['Sites.Read.All'], true), 'generic-test-access');
  assert.equal(c.calls.popup, 1);
  await assert.rejects(() => auth.token(['User.Read']), { code: 'MICROSOFT_AUTHORIZE' });
  assert.equal(auth.account, null);
  assert.equal(c.calls.popup, 1);
});

test('a token returned for another tenant cannot be used for the selected account', async () => {
  const f = fixture(), c = f.client(), auth = f.account(c); await auth.initialized;
  c.acquireTokenSilent = async () => result({ ...user, tenantId: 'different-tenant' });
  await assert.rejects(() => auth.token(['User.Read']), { code: 'ACCOUNT_CHANGED' });
});

test('a cross-tab disconnect preserves the in-memory diagram and detaches its cloud file', async () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { hidden: false, value: '', textContent: '', childElementCount: 0, classList: { toggle() {} }, setAttribute() {}, querySelectorAll: () => [], replaceChildren() {}, addEventListener() {} });
    return elements.get(id);
  };
  const f = fixture(), auth = f.account(f.client()); await auth.initialized;
  const files = { handle: { storageKind: 'microsoft' }, hash: 'generic-base', name: 'Generic.bpmn' };
  const context = {
    window: { NaraMicrosoft: { create: () => ({ auth, files: {}, workspace: { read: () => ({ last: null }), stamp: () => ({}), resume: async () => false } }) } },
    byId: element, browserFiles: files, saving: false,
    browserFileContext: name => { context.fileName = name; }, setDirty: dirty => { context.dirty = dirty; }, status: message => { context.statusText = message; },
    modeler: { saveXML() { throw new Error('Disconnect must not serialize or replace the diagram'); } }
  };
  vm.runInNewContext(await readFile(new URL('../microsoft-ui.js', import.meta.url), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  f.shared.active = null; auth.synchronize();
  assert.equal(files.handle, null);
  assert.equal(context.fileName, 'Generic.bpmn');
  assert.equal(context.dirty, true);
  assert.match(context.statusText, /diagrama sigue abierto/);
  assert.equal(element('connectMicrosoft').textContent, 'Conectar Microsoft');
});
