import http from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export const VERSION = '0.3.2';
const token = () => randomBytes(32).toString('base64url');
const same = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const fail = (code, message) => Object.assign(new Error(message), { code });

// HTTP is only the browser bridge. MCP itself uses the host's stdio transport.
export async function startBridge({ allowedOrigins = ['https://demo.naraconsultores.com'], timeoutMs = 25000, pairingTtlMs = 300000, now = Date.now } = {}) {
  const sessions = new Map();
  let pairing;
  let closed = false;
  const origins = new Set(allowedOrigins);
  const reply = (res, status, data) => {
    if (!res.writableEnded && !res.destroyed) {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(data));
    }
  };
  async function body(req) {
    if (!req.headers['content-type']?.startsWith('application/json')) throw fail('CONTENT_TYPE', 'Se requiere JSON.');
    let bytes = 0;
    const chunks = [];
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 12 * 1024 * 1024) throw fail('TOO_LARGE', 'La respuesta supera 12 MB.');
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw fail('INVALID_JSON', 'JSON inválido.'); }
  }
  function disconnect(id) {
    const session = sessions.get(id);
    if (!session) return;
    if (session.poll) { clearTimeout(session.poll.timer); reply(session.poll.res, 410, { error: 'Sesión desconectada.' }); }
    if (session.pending) {
      clearTimeout(session.pending.timer);
      session.pending.reject(fail(session.pending.delivered ? 'RESULT_UNKNOWN' : 'DISCONNECTED', 'Sesión desconectada. Lee el diagrama antes de repetir una modificación.'));
    }
    sessions.delete(id);
  }
  function deliver(session, res) {
    const pending = session.pending;
    if (pending && !pending.delivered && pending.command.deadline > Date.now()) {
      pending.delivered = true;
      reply(res, 200, { command: pending.command });
      return true;
    }
    return false;
  }
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.host !== `127.0.0.1:${server.address().port}`) return reply(res, 403, { error: 'Host rechazado.' });
      const origin = req.headers.origin;
      if (!origins.has(origin)) return reply(res, 403, { error: 'Origen no autorizado.' });
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
        return reply(res, 204, {});
      }
      if (req.method !== 'POST') return reply(res, 405, { error: 'Método no permitido.' });
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/pair') {
        const input = await body(req);
        if (!pairing || pairing.expiresAt <= now() || !same(input.code, pairing.secret)) return reply(res, 401, { error: 'Código inválido o vencido. Solicita otro a Codex.' });
        if (sessions.size >= 8) return reply(res, 409, { error: 'Desconecta una sesión antes de agregar otra.' });
        pairing = null;
        const id = randomUUID();
        const auth = token();
        sessions.set(id, { id, auth, origin, name: String(input.name || 'Diagrama').slice(0, 180), lastSeen: Date.now(), pending: null, poll: null });
        return reply(res, 200, { sessionId: id, sessionToken: auth, version: VERSION });
      }
      const match = /^\/sessions\/([0-9a-f-]+)\/(poll|result|disconnect)$/.exec(url.pathname);
      const session = match && sessions.get(match[1]);
      if (!session || session.origin !== origin || !same(req.headers.authorization, `Bearer ${session.auth}`)) return reply(res, 401, { error: 'Sesión no autorizada.' });
      session.lastSeen = Date.now();
      const input = await body(req);
      if (match[2] === 'disconnect') { reply(res, 200, { disconnected: true }); disconnect(session.id); return; }
      if (match[2] === 'result') {
        const pending = session.pending;
        if (!pending || input.commandId !== pending.command.id || !pending.delivered) return reply(res, 409, { error: 'Comando vencido o ya confirmado.' });
        clearTimeout(pending.timer);
        session.pending = null;
        if (input.error) pending.reject(fail(String(input.error.code || 'EDITOR_ERROR'), String(input.error.message || 'El visor rechazó la operación.')));
        else pending.resolve(input.result);
        reply(res, 200, { accepted: true });
        return;
      }
      if (typeof input.name === 'string') session.name = input.name.slice(0, 180);
      if (session.poll) return reply(res, 409, { error: 'Ya hay una consulta activa.' });
      if (deliver(session, res)) return;
      const timer = setTimeout(() => { session.poll = null; reply(res, 200, { command: null }); }, 15000);
      session.poll = { res, timer };
      res.on('close', () => { if (session.poll?.res === res) { clearTimeout(timer); session.poll = null; } });
    } catch (error) { reply(res, error.code === 'TOO_LARGE' ? 413 : 400, { error: error.message }); }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  return {
    port,
    pair() {
      pairing = { secret: token(), expiresAt: now() + pairingTtlMs };
      const code = `${port}.${pairing.secret}`;
      return { pairingCode: code, expiresAt: new Date(pairing.expiresAt).toISOString(), editorUrl: `https://demo.naraconsultores.com/NaraBizagui/#mcp=${code}`, instructions: 'En la pestaña del BPMN elegido pulsa Conectar con Codex, pega el código y pulsa Vincular. El enlace alternativo abre el editor. Autoriza el acceso local si el navegador lo solicita. Después consulta narabizagui_sessions. El código es de un solo uso y vence en cinco minutos.' };
    },
    list() { return [...sessions.values()].map(s => ({ sessionId: s.id, name: s.name, connected: Date.now() - s.lastSeen < 45000, lastSeen: new Date(s.lastSeen).toISOString(), busy: Boolean(s.pending) })); },
    request(id, action, args) {
      if (closed) return Promise.reject(fail('CLOSED', 'El puente está cerrado.'));
      const session = sessions.get(id);
      if (!session || Date.now() - session.lastSeen >= 45000) return Promise.reject(fail('NOT_CONNECTED', 'Vincula la pestaña y comprueba sus permisos de red local.'));
      if (session.pending) return Promise.reject(fail('BUSY', 'Espera el resultado de la operación anterior.'));
      return new Promise((resolve, reject) => {
        const command = { id: randomUUID(), action, args, deadline: Date.now() + timeoutMs };
        const pending = { command, resolve, reject, delivered: false };
        pending.timer = setTimeout(() => {
          session.pending = null;
          reject(fail(pending.delivered ? 'RESULT_UNKNOWN' : 'NOT_RESPONDING', pending.delivered ? 'La pestaña recibió el comando pero no confirmó el resultado. Lee su estado antes de repetir cualquier cambio o guardado.' : 'La pestaña no recibió el comando a tiempo. No se aplicó. Comprueba que sigue abierta.'));
        }, timeoutMs);
        session.pending = pending;
        if (session.poll) { clearTimeout(session.poll.timer); const res = session.poll.res; session.poll = null; deliver(session, res); }
      });
    },
    disconnect,
    async close() {
      closed = true;
      for (const id of sessions.keys()) disconnect(id);
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  };
}
