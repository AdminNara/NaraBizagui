import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';
broadcastResponseToMainFrame().catch(() => { document.getElementById('authMessage').textContent = 'Vuelve a NaraBizagui y abre la conexión Microsoft de nuevo.'; });
