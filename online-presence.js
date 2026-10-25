const {randomUUID, createHmac, timingSafeEqual} = require('node:crypto');

const COOKIE = 'eleicoes2026_visitor';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createPresenceHandler({env = process.env, fetchImpl = fetch} = {}) {
  return async function presence(req, res) {
    const reply = (status, data, extra = {}) => {
      res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', ...extra});
      res.end(JSON.stringify(data));
    };
    if (req.method !== 'POST') return reply(405, {error:'Método não permitido.'}, {Allow:'POST'});
    const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
    const origin = `${secure ? 'https' : 'http'}://${req.headers.host}`;
    if ((req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') {
      return reply(403, {error:'Origem não permitida.'});
    }
    // O cliente não envia IDs ou datas: a identificação assinada é emitida pelo servidor.
    if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] || 0) !== 0) {
      req.resume();
      return reply(400, {error:'Esta consulta não recebe conteúdo.'});
    }
    const key = env.SUPABASE_SERVICE_ROLE_KEY, base = env.SUPABASE_URL;
    if (!key || !base) return reply(503, {error:'Contador online indisponível.'});
    const sign = id => createHmac('sha256', key).update('eleicoes2026-online:' + id).digest('base64url');
    const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
    const [candidate, signature] = cookie.split('.');
    const expected = candidate && UUID.test(candidate) ? sign(candidate) : '';
    const valid = !!expected && /^[A-Za-z0-9_-]{43}$/.test(signature || '') && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    const id = valid ? candidate : randomUUID();
    try {
      const response = await fetchImpl(new URL('/rest/v1/rpc/eleicoes2026_online_heartbeat', base), {
        method:'POST',
        headers:{apikey:key, Authorization:'Bearer ' + key, 'Content-Type':'application/json'},
        body:JSON.stringify({p_visitor_id:id}), signal:AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error('Falha no serviço de presença');
      const rawCount = await response.json();
      const count = (typeof rawCount === 'number' || (typeof rawCount === 'string' && /^\d+$/.test(rawCount))) ? Number(rawCount) : NaN;
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Contagem inválida');
      const headers = valid ? {} : {'Set-Cookie':`${COOKIE}=${id}.${sign(id)}; HttpOnly; SameSite=Lax; Path=/api/online; Max-Age=86400${secure ? '; Secure' : ''}`};
      reply(200, {online:count, windowSeconds:120}, headers);
    } catch {
      // Nunca devolve credenciais ou detalhes internos do banco ao navegador.
      reply(503, {error:'Contador online indisponível.'});
    }
  };
}

module.exports = {createPresenceHandler};
