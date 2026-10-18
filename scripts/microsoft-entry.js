import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { MicrosoftFiles, FILE_SCOPES, problem } from '../microsoft-files.js';

// OAuth client identifiers are public application identifiers, not client secrets.
const clientId = 'f6e8c708-7319-4fde-8220-af052e371621';
class MicrosoftAccount {
  constructor() {
    this.account = null;
    this.client = new PublicClientApplication({
      auth: { clientId, authority: 'https://login.microsoftonline.com/common', redirectUri: new URL('microsoft-auth.html', location.href).href },
      cache: { cacheLocation: 'memoryStorage' },
      system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback() {} } }
    });
    this.initialized = this.client.initialize();
  }
  async connect() {
    await this.initialized;
    const result = await this.client.loginPopup({ scopes: FILE_SCOPES, prompt: 'select_account' });
    this.account = result.account;
    this.client.setActiveAccount(this.account);
    return this.account;
  }
  async token(scopes, interactive = false) {
    if (!this.account) throw problem('MICROSOFT_CONNECT', 'Conecta tu cuenta Microsoft.');
    const original = this.account.homeAccountId;
    let result;
    try { result = await this.client.acquireTokenSilent({ scopes, account: this.account }); }
    catch (error) {
      if (!interactive || !(error instanceof InteractionRequiredAuthError)) throw problem('MICROSOFT_AUTHORIZE', 'Vuelve a conectar tu cuenta o elige SharePoint y pulsa Continuar para autorizar el sitio.');
      result = await this.client.acquireTokenPopup({ scopes, account: this.account });
    }
    if (this.account?.homeAccountId !== original || result.account.homeAccountId !== original) throw problem('ACCOUNT_CHANGED', 'La cuenta Microsoft cambió. Conecta de nuevo.');
    return result.accessToken;
  }
  async disconnect() {
    const account = this.account; this.account = null; this.client.setActiveAccount(null);
    if (account) await this.client.clearCache({ account });
  }
}
window.NaraMicrosoft = { create() { const auth = new MicrosoftAccount(); return { auth, files: new MicrosoftFiles(auth) }; } };
