'use strict';
(() => {
  const button = document.getElementById('connectCodex');
  const dialog = document.getElementById('codexDialog');
  const input = document.getElementById('codexCode');
  const message = document.getElementById('codexMessage');
  const connect = document.getElementById('codexPair');
  const disconnect = document.getElementById('codexDisconnect');
  let live = null;
  let pairing = false;
  let reconnecting = false;
  const storageKey = 'narabizagui.codex.session.v1';
  function remember(session) {
    try {
      if (session) sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, port: session.port, id: session.id, token: session.token }));
      else sessionStorage.removeItem(storageKey);
    } catch { /* The live connection still works when tab storage is unavailable. */ }
  }
  function restore() {
    if (live || pairing || input.value.trim()) return;
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (!stored) return;
      if (stored.version !== 1 || !Number.isInteger(stored.port) || stored.port < 1 || stored.port > 65535 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored.id) || !/^[A-Za-z0-9_-]{43}$/.test(stored.token)) { remember(null); return; }
      live = { port: stored.port, id: stored.id, token: stored.token, controller: new AbortController() };
      reconnecting = true; render(); say('Restableciendo el vínculo de esta pestaña con el MCP local.');
      loop(live);
    } catch { remember(null); }
  }
  const say = text => { message.textContent = text; };
  function render() {
    button.textContent = live ? reconnecting ? 'Reconectando con Codex' : 'Codex conectado' : 'Conectar con Codex';
    button.classList.toggle('codex-connected', Boolean(live) && !reconnecting);
    input.disabled = Boolean(live) || pairing;
    connect.hidden = Boolean(live);
    connect.disabled = pairing;
    disconnect.hidden = !live;
  }
  async function send(session, path, data, limit = 22000) {
    const response = await fetch(`http://127.0.0.1:${session.port}${path}`, { method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}) }, body: JSON.stringify(data), signal: AbortSignal.any([session.controller.signal, AbortSignal.timeout(limit)]) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'El puente rechazó la solicitud.'), { status: response.status });
    return result;
  }
  async function loop(session) {
    let failures = 0;
    while (live === session) {
      try {
        const response = await send(session, `/sessions/${session.id}/poll`, { name: document.getElementById('diagramTitle').textContent });
        failures = 0;
        if (live === session && reconnecting) { reconnecting = false; render(); say('Vínculo restablecido con el MCP local.'); }
        if (live !== session || !response.command) continue;
        const command = response.command;
        let result;
        try {
          if (command.deadline <= Date.now()) throw Object.assign(new Error('El comando venció antes de ejecutarse.'), { code: 'EXPIRED' });
          if (!['read', 'edit', 'save', 'exportPng', 'validate', 'editBatch'].includes(command.action)) throw new Error('Comando no admitido.');
          result = { commandId: command.id, result: await window.NaraBizaguiEditor[command.action](command.args) };
        } catch (error) { result = { commandId: command.id, error: { code: error.code || 'EDITOR_ERROR', message: error.message } }; }
        // Retry only delivery of the result, never execution of an edit or save.
        for (let attempt = 0; attempt < 3; attempt++) {
          try { await send(session, `/sessions/${session.id}/result`, result); break; }
          catch (error) { if (error.status === 409) break; if (attempt === 2) throw error; }
        }
      } catch (error) {
        if (live !== session) return;
        if ([401, 410].includes(error.status)) {
          live = null; reconnecting = false; remember(null); session.controller.abort(); render();
          say('El MCP local ya no reconoce este vínculo. Tu diagrama conserva sus cambios. Solicita otro código para vincularlo nuevamente.');
          return;
        }
        failures++;
        reconnecting = true; render();
        say('El puente no responde. Comprobando de nuevo; el diagrama sigue abierto.');
        await new Promise(resolve => setTimeout(resolve, Math.min(15000, 1000 * 2 ** Math.min(failures - 1, 4))));
      }
    }
  }
  button.onclick = () => { render(); dialog.showModal(); input.focus(); };
  document.getElementById('codexClose').onclick = () => dialog.close();
  document.getElementById('codexForm').onsubmit = async event => {
    event.preventDefault();
    if (live || pairing) return;
    const match = /^(\d{1,5})\.([A-Za-z0-9_-]{43})$/.exec(input.value.trim());
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535) { say('Pega el código completo que te proporciona Codex.'); return; }
    const session = { port: Number(match[1]), controller: new AbortController() };
    pairing = true; render(); say('Vinculando esta pestaña. Autoriza el acceso local si el navegador lo solicita.');
    try {
      const result = await send(session, '/pair', { code: match[2], name: document.getElementById('diagramTitle').textContent }, 15000);
      session.id = result.sessionId; session.token = result.sessionToken; live = session; reconnecting = false;
      remember(session);
      input.value = '';
      say('Esta pestaña está vinculada. Codex puede consultar y editar su diagrama. Puedes desconectarla cuando quieras.');
      loop(session);
    } catch (error) {
      session.controller.abort();
      say(error.status ? error.message : 'No se pudo conectar. Comprueba que el plugin está activo y que permitiste el acceso local del navegador. Después solicita un código nuevo.');
    } finally { pairing = false; render(); }
  };
  disconnect.onclick = async () => {
    const session = live;
    if (!session) return;
    live = null; reconnecting = false; remember(null); render();
    try { await send(session, `/sessions/${session.id}/disconnect`, {}, 3000); } catch { /* Local revocation still ends this browser connection. */ }
    session.controller.abort();
    say('Pestaña desconectada. El diagrama y sus cambios siguen disponibles.');
  };
  // Reloading closes the pending poll, but keeps this tab's explicit authorization.
  window.addEventListener('pagehide', () => { const session = live; live = null; session?.controller.abort(); });
  window.addEventListener('pageshow', event => { if (event.persisted) restore(); });
  const fragment = new URLSearchParams(location.hash.slice(1));
  const code = fragment.get('mcp');
  if (code) {
    fragment.delete('mcp');
    history.replaceState(null, '', location.pathname + location.search + (fragment.size ? '#' + fragment : ''));
    input.value = code; dialog.showModal();
    say('Pulsa Vincular para conectar esta pestaña con tu plugin local de NaraBizagui.');
  } else restore();
})();
