import { FILE_SCOPES, problem } from '../microsoft-files.js';

const identity = account => account ? JSON.stringify([account.homeAccountId, account.localAccountId, account.tenantId]) : null;

// MSAL owns its persistent cache. Never serialize tokens or choose an arbitrary
// cached account: only the account explicitly selected by the user may resume.
export class MicrosoftAccount {
  constructor(client, { interactionRequired, accountChanged }) {
    this.client = client;
    this.interactionRequired = interactionRequired;
    this.account = null;
    this.generation = 0;
    this.listeners = new Set();
    this.clientReady = client.initialize();
    this.initialized = this.clientReady.then(async () => {
      client.addEventCallback(() => {
        // Also invalidate pending sign-ins/restores when a different tab logs out.
        this.generation++;
        this.synchronize();
      }, [accountChanged]);
      await this.restore();
    });
  }
  onChange(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  update(account, reason) {
    if (identity(this.account) === identity(account)) return;
    const previous = this.account;
    this.account = account;
    this.generation++;
    for (const listener of this.listeners) listener({ previous, account, reason });
  }
  synchronize() {
    // A switch in another tab invalidates this tab's file binding. It must not
    // silently adopt the other account or reuse that account's open file.
    if (this.account && identity(this.client.getActiveAccount()) !== identity(this.account)) this.update(null, 'changed');
  }
  async restore() {
    const account = this.client.getActiveAccount(), generation = this.generation;
    if (!account) return;
    try {
      const result = await this.client.acquireTokenSilent({ scopes: FILE_SCOPES, account });
      if (generation === this.generation && identity(this.client.getActiveAccount()) === identity(account) && identity(result.account) === identity(account)) this.update(result.account, 'restored');
    } catch {
      // Startup never opens a popup. Microsoft policies, expiry or offline use
      // may require the user to reconnect; keep any diagram in memory intact.
    }
  }
  async connect() {
    await this.initialized;
    const generation = this.generation, active = identity(this.client.getActiveAccount());
    const result = await this.client.loginPopup({ scopes: FILE_SCOPES, prompt: 'select_account' });
    if (generation !== this.generation || active !== identity(this.client.getActiveAccount())) throw problem('ACCOUNT_CHANGED', 'La conexión cambió en otra pestaña. Vuelve a conectar tu cuenta.');
    this.update(result.account, 'connected');
    this.client.setActiveAccount(result.account);
    return this.account;
  }
  async token(scopes, interactive = false) {
    await this.initialized;
    this.synchronize();
    if (!this.account) throw problem('MICROSOFT_CONNECT', 'Conecta tu cuenta Microsoft.');
    const account = this.account, generation = this.generation;
    let result;
    try { result = await this.client.acquireTokenSilent({ scopes, account }); }
    catch (error) {
      if (!interactive || !this.interactionRequired(error)) {
        if (this.interactionRequired(error) && generation === this.generation) this.update(null, 'expired');
        throw problem('MICROSOFT_AUTHORIZE', 'Vuelve a conectar tu cuenta o elige SharePoint y pulsa Continuar para autorizar el sitio.');
      }
      this.synchronize();
      if (generation !== this.generation) throw problem('ACCOUNT_CHANGED', 'La cuenta Microsoft cambió. Conecta de nuevo.');
      result = await this.client.acquireTokenPopup({ scopes, account });
    }
    this.synchronize();
    if (generation !== this.generation || identity(result.account) !== identity(account)) throw problem('ACCOUNT_CHANGED', 'La cuenta Microsoft cambió. Conecta de nuevo.');
    return result.accessToken;
  }
  async disconnect() {
    this.generation++;
    this.update(null, 'disconnected');
    await this.clientReady;
    this.client.setActiveAccount(null);
    // Clear every cached account belonging to this app, not Microsoft 365 SSO.
    // With no active account, reload cannot resurrect a previously used account.
    await this.client.clearCache();
  }
}
