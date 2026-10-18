import { PublicClientApplication, InteractionRequiredAuthError, EventType } from '@azure/msal-browser';
import { MicrosoftFiles } from '../microsoft-files.js';
import { MicrosoftAccount } from './microsoft-account.js';

// OAuth client identifiers are public application identifiers, not client secrets.
const clientId = 'f6e8c708-7319-4fde-8220-af052e371621';
window.NaraMicrosoft = { create() {
    const client = new PublicClientApplication({
      auth: { clientId, authority: 'https://login.microsoftonline.com/common', redirectUri: new URL('microsoft-auth.html', location.href).href },
      cache: { cacheLocation: 'localStorage' },
      system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback() {} } }
    });
    const auth = new MicrosoftAccount(client, {
      interactionRequired: error => error instanceof InteractionRequiredAuthError,
      accountChanged: EventType.ACTIVE_ACCOUNT_CHANGED
    });
    window.addEventListener('focus', () => auth.synchronize());
    window.addEventListener('pageshow', () => auth.synchronize());
    return { auth, files: new MicrosoftFiles(auth) };
} };
