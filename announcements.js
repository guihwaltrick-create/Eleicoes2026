const {createCipheriv, createDecipheriv, createHash, randomBytes} = require('node:crypto');

const TABLE = 'eleicoes2026_announcements', COOKIE = 'eleicoes2026_admin';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class HttpError extends Error {
  constructor(status, message) {super(message);this.status = status;}
}
function validateAnnouncement(input) {
  if (!input || !['info','ad'].includes(input.kind)) throw new HttpError(400, 'Selecione informação ou anúncio.');
  if (typeof input.message !== 'string') throw new HttpError(400, 'Informe o texto da publicação.');
  const message = input.message.replace(/\s+/g,' ').trim();
  if (!message || message.length > 240) throw new HttpError(400, 'Use um texto de 1 a 240 caracteres.');
  if (typeof input.active !== 'boolean') throw new HttpError(400, 'Informe se a publicação está ativa.');
  if (!Number.isInteger(input.sort_order) || input.sort_order < 0 || input.sort_order > 9999) throw new HttpError(400, 'A ordem deve estar entre 0 e 9999.');
  let url = null;
  if (input.kind === 'ad') {
    try {
      if (typeof input.url !== 'string' || input.url.length > 2000) throw Error();
      const parsed = new URL(input.url);
      if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw Error();
      url = parsed.href;
    } catch {throw new HttpError(400, 'Informe um link completo começando com https:// ou http://.');}
  }
  return {kind:input.kind, message, url, active:input.active, sort_order:input.sort_order};
}
async function readJSON(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'Envie os dados em JSON.');
  if (Number(req.headers['content-length']) > 8192) {req.resume();throw new HttpError(413,'Conteúdo muito grande.');}
  let size = 0;const chunks = [];
  for await (const chunk of req.iterator({destroyOnReturn:false})) {
    size += chunk.length;
    if (size > 8192) {req.resume();throw new HttpError(413, 'Conteúdo muito grande.');}
    chunks.push(chunk);
  }
  try {return JSON.parse(Buffer.concat(chunks).toString());}
  catch {throw new HttpError(400, 'Dados inválidos.');}
}
function createAnnouncementsHandler({env = process.env, fetchImpl = fetch, now = Date.now} = {}) {
  let publicCache = null;
  const attempts = new Map();
  return async function handle(req, res, pathname) {
    const isPublic = pathname === '/api/announcements';
    const reply = (status, data, headers = {}) => {
      res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...headers});
      res.end(JSON.stringify(data));
    };
    const key = env.SUPABASE_SERVICE_ROLE_KEY, base = env.SUPABASE_URL;
    const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
    const cookieHeader = value => `${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${value ? 28800 : 0}${secure ? '; Secure' : ''}`;
    const clearCookie = () => ({'Set-Cookie':cookieHeader('')});
    let sessionHeaders = {};
    try {
      const write = !['GET','HEAD'].includes(req.method);
      if (write && ((req.headers.origin && req.headers.origin !== `${secure ? 'https' : 'http'}://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site')) throw new HttpError(403, 'Origem não permitida.');
      if (!key || !base) throw new HttpError(503, 'Publicações indisponíveis no momento.');
      const secret = createHash('sha256').update('eleicoes2026-admin:' + key).digest();
      const pack = session => {
        const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', secret, nonce);
        const ciphertext = Buffer.concat([cipher.update(JSON.stringify(session)), cipher.final()]);
        const value = Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64url');
        if (value.length > 3800) throw new HttpError(503, 'Não foi possível iniciar a sessão.');
        return value;
      };
      const unpack = () => {
        try {
          const value = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
          if (!value || value.length > 3800) return null;
          const data = Buffer.from(value,'base64url'), cipher = createDecipheriv('aes-256-gcm',secret,data.subarray(0,12));
          cipher.setAuthTag(data.subarray(12,28));
          const session = JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString());
          return session.until > now() && typeof session.access === 'string' && typeof session.refresh === 'string' ? session : null;
        } catch {return null;}
      };
      const request = async (path, {method='GET', body, token=key, headers={}}={}) => {
        const response = await fetchImpl(new URL(path,base), {
          method, headers:{apikey:key, Authorization:'Bearer '+token, ...(body !== undefined ? {'Content-Type':'application/json'} : {}), ...headers},
          ...(body !== undefined ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(10000)
        });
        return response;
      };
      const sessionFrom = data => {
        if (typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string' || !(data.expires_in > 0)) throw new HttpError(502,'Não foi possível iniciar a sessão.');
        return {access:data.access_token, refresh:data.refresh_token, expires:now()+data.expires_in*1000, until:now()+28800000};
      };
      const authorized = user => user?.app_metadata?.eleicoes2026_admin === true;
      const authenticate = async () => {
        let session = unpack();
        if (!session) throw new HttpError(401,'Entre com seu e-mail e senha.');
        if (session.expires <= now()+30000) {
          const response = await request('/auth/v1/token?grant_type=refresh_token', {method:'POST',body:{refresh_token:session.refresh}});
          if (!response.ok) throw new HttpError(response.status >= 500 ? 503 : 401,response.status >= 500 ? 'Não foi possível verificar sua sessão. Tente novamente.' : 'Sua sessão expirou. Entre novamente.');
          session = sessionFrom(await response.json());
          sessionHeaders = {'Set-Cookie':cookieHeader(pack(session))};
        }
        const response = await request('/auth/v1/user',{token:session.access});
        if (!response.ok) throw new HttpError(response.status >= 500 ? 503 : 401,response.status >= 500 ? 'Não foi possível verificar sua sessão. Tente novamente.' : 'Sua sessão expirou. Entre novamente.');
        const user = await response.json();
        if (!authorized(user)) throw new HttpError(403,'Este usuário não tem acesso à administração.');
        return {user, session};
      };
      if (isPublic) {
        if (req.method !== 'GET') return reply(405,{error:'Método não permitido.'},{Allow:'GET'});
        if (publicCache && now()-publicCache.at < 10000) return reply(200,{items:publicCache.items});
        const response = await request(`/rest/v1/${TABLE}?select=id,kind,message,url,sort_order&active=eq.true&order=sort_order.asc,created_at.asc&limit=100`);
        if (!response.ok) throw new HttpError(503,'Publicações indisponíveis no momento.');
        const items = await response.json();
        if (!Array.isArray(items)) throw new HttpError(503,'Publicações indisponíveis no momento.');
        publicCache = {at:now(),items};return reply(200,{items});
      }
      if (pathname === '/api/admin/session' && req.method === 'POST') {
        const ip = req.socket.remoteAddress || 'unknown';
        for (const [id,value] of attempts) if (value.until <= now()) attempts.delete(id);
        const attempt = attempts.get(ip) || {count:0, until:now()+600000};
        if (attempt.count >= 10) throw new HttpError(429,'Muitas tentativas. Aguarde alguns minutos.');
        attempts.set(ip,{...attempt,count:attempt.count+1});
        const input = await readJSON(req);
        if (typeof input.email !== 'string' || input.email.length > 254 || typeof input.password !== 'string' || !input.password || input.password.length > 1024) throw new HttpError(400,'Informe o e-mail e a senha.');
        const response = await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:input.email.trim(),password:input.password}});
        if (!response.ok) throw new HttpError(response.status >= 500 ? 503 : response.status === 429 ? 429 : 401,response.status >= 500 ? 'Serviço de login indisponível. Tente novamente.' : response.status === 429 ? 'Muitas tentativas. Aguarde alguns minutos.' : 'E-mail ou senha inválidos.');
        const data = await response.json();
        if (!authorized(data.user)) throw new HttpError(403,'Este usuário não tem acesso à administração.');
        const session = sessionFrom(data);
        attempts.delete(ip);
        return reply(200,{user:{email:data.user.email}},{'Set-Cookie':cookieHeader(pack(session))});
      }
      if (pathname === '/api/admin/session' && req.method === 'DELETE') {
        const session = unpack();
        if (session) await request('/auth/v1/logout?scope=local',{method:'POST',token:session.access}).catch(()=>{});
        return reply(200,{ok:true},clearCookie());
      }
      if (pathname === '/api/admin/session' && req.method === 'GET') {
        const {user} = await authenticate();return reply(200,{user:{email:user.email}},sessionHeaders);
      }
      if (pathname === '/api/admin/stats') {
        if (req.method !== 'GET') return reply(405,{error:'Método não permitido.'},{Allow:'GET'});
        await authenticate();
        const response = await request('/rest/v1/rpc/eleicoes2026_online_stats',{method:'POST',body:{}});
        if (!response.ok) throw new HttpError(503,'Estatísticas indisponíveis. Confira a configuração do histórico de acessos.');
        const stats = await response.json();
        if (!stats || !Number.isSafeInteger(stats.online) || !Number.isSafeInteger(stats.peak_online)) throw new HttpError(503,'Estatísticas indisponíveis no momento.');
        return reply(200,stats,sessionHeaders);
      }
      const match = pathname.match(/^\/api\/admin\/announcements(?:\/([0-9a-f-]+))?$/i);
      if (!match) throw new HttpError(404,'Página não encontrada.');
      const id = match[1];
      if (id && !UUID.test(id)) throw new HttpError(400,'Publicação inválida.');
      const methods = id ? ['PUT','DELETE'] : ['GET','POST'];
      if (!methods.includes(req.method)) return reply(405,{error:'Método não permitido.'},{Allow:methods.join(', ')});
      await authenticate();
      if (req.method === 'GET') {
        const response = await request(`/rest/v1/${TABLE}?select=*&order=sort_order.asc,created_at.asc&limit=500`);
        if (!response.ok) throw new HttpError(503,'Não foi possível carregar as publicações. Confira a configuração da tabela.');
        return reply(200,{items:await response.json()},sessionHeaders);
      }
      const payload = req.method === 'DELETE' ? undefined : validateAnnouncement(await readJSON(req));
      const response = await request(`/rest/v1/${TABLE}${id ? '?id=eq.'+id : ''}`, {
        method:req.method === 'PUT' ? 'PATCH' : req.method,
        body:payload && {...payload, updated_at:new Date(now()).toISOString()},
        headers:{Prefer:'return=representation'}
      });
      if (!response.ok) throw new HttpError(503,'Não foi possível salvar a publicação. Confira a configuração da tabela.');
      const items = await response.json();
      if (id && !items.length) throw new HttpError(404,'Publicação não encontrada.');
      publicCache = null;
      reply(req.method === 'POST' ? 201 : 200,req.method === 'DELETE' ? {ok:true} : {item:items[0]},sessionHeaders);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 503;
      reply(status,{error:error instanceof HttpError ? error.message : 'Serviço indisponível. Tente novamente em instantes.'},[401,403].includes(status) && !isPublic ? clearCookie() : sessionHeaders);
    }
  };
}
module.exports = {createAnnouncementsHandler, validateAnnouncement};
