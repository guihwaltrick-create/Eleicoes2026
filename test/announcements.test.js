const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {randomUUID} = require('node:crypto');
const {createAnnouncementsHandler, validateAnnouncement} = require('../announcements');

const env = {SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-server-only-secret'};
const valid = {kind:'ad',message:'Conheça a GW Digital',url:'https://example.com/oferta',active:true,sort_order:1};
function backend() {
  const rows = new Map(), requests = [];
  let admin = true, fail = false, refreshCount = 0;
  const fetchImpl = async (url, options) => {
    const u = new URL(url), body = options.body && JSON.parse(options.body);
    requests.push({url:u, options, body});
    if (fail) throw Error(env.SUPABASE_SERVICE_ROLE_KEY);
    const response = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
    const user = {id:'test-user',email:'admin@example.com',app_metadata:{eleicoes2026_admin:admin},user_metadata:{eleicoes2026_admin:true}};
    if (u.pathname === '/auth/v1/token') {
      if (u.searchParams.get('grant_type') === 'refresh_token') refreshCount++;
      else if (body.password !== 'correct-password') return response({error:'invalid'},400);
      return response({access_token:'user-access-token',refresh_token:'user-refresh-token',expires_in:3600,user});
    }
    if (u.pathname === '/auth/v1/user') return response(user);
    if (u.pathname === '/auth/v1/logout') return new Response(null,{status:204});
    if (u.pathname === '/rest/v1/rpc/eleicoes2026_online_stats') return response({online:12,peak_online:34,peak_at:'2026-10-25T14:35:00Z',tracking_since:'2026-10-25T12:00:00Z'});
    assert.equal(u.pathname,'/rest/v1/eleicoes2026_announcements');
    assert.equal(options.headers.Authorization,'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY);
    const id = u.searchParams.get('id')?.slice(3);
    if (options.method === 'GET') return response([...rows.values()].filter(row=>u.searchParams.get('active')!=='eq.true'||row.active).sort((a,b)=>a.sort_order-b.sort_order));
    if (options.method === 'POST') {const row={id:randomUUID(),created_at:'2026-10-25T10:00:00Z',...body};rows.set(row.id,row);return response([row],201);}
    if (options.method === 'PATCH') {if(!rows.has(id))return response([]);const row={...rows.get(id),...body};rows.set(id,row);return response([row]);}
    if (options.method === 'DELETE') {const row=rows.get(id);rows.delete(id);return response(row?[row]:[]);}
    throw Error('Unexpected request');
  };
  return {rows,requests,fetchImpl,setAdmin:value=>{admin=value;},setFailure:value=>{fail=value;},refreshes:()=>refreshCount};
}
async function start(t) {
  const mock = backend();let clock=Date.now();
  const handler = createAnnouncementsHandler({env,fetchImpl:mock.fetchImpl,now:()=>clock});
  const server = http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://localhost').pathname));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const call=(path,options={})=>fetch(base+path,options);
  const login=async (extra={})=>{
    const response=await call('/api/admin/session',{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify({email:'admin@example.com',password:'correct-password'})});
    return {response,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  return {mock,call,login,advance:ms=>{clock+=ms;}};
}

test('valida mensagens, URLs de anúncios, ordem e campos permitidos',()=>{
  assert.equal(validateAnnouncement({...valid,message:'  Mensagem\n em uma linha  ',id:'injected'}).message,'Mensagem em uma linha');
  assert.equal(validateAnnouncement({...valid,kind:'info',url:'javascript:alert(1)'}).url,null);
  assert.equal(validateAnnouncement(valid).id,undefined);
  for(const url of ['javascript:alert(1)','data:text/html,x','file:///etc/passwd','https://user:password@example.com','/relative'])assert.throws(()=>validateAnnouncement({...valid,url}));
  for(const input of [{...valid,message:' '},{...valid,message:'x'.repeat(241)},{...valid,kind:'other'},{...valid,sort_order:-1},{...valid,sort_order:1.2},{...valid,active:'true'}])assert.throws(()=>validateAnnouncement(input));
});

test('login usa Supabase Auth e retorna somente cookie criptografado HttpOnly',async t=>{
  const {call,login,mock}=await start(t);
  assert.equal((await call('/api/admin/announcements')).status,401);
  const {response,cookie}=await login();assert.equal(response.status,200);
  assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Path=\/api\/admin/);
  assert.ok(!cookie.includes('user-access-token'));assert.ok(!cookie.includes('user-refresh-token'));assert.ok(!cookie.includes(env.SUPABASE_SERVICE_ROLE_KEY));
  assert.deepEqual(await response.json(),{user:{email:'admin@example.com'}});
  const session=await call('/api/admin/session',{headers:{cookie}});assert.equal(session.status,200);
  assert.equal(mock.requests.find(r=>r.url.pathname==='/auth/v1/user').options.headers.Authorization,'Bearer user-access-token');
  const logout=await call('/api/admin/session',{method:'DELETE',headers:{cookie}});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
});

test('usuário comum ou permissão revogada não administra, mesmo com user_metadata alterável',async t=>{
  const {call,login,mock}=await start(t);
  const {cookie}=await login();mock.setAdmin(false);
  assert.equal((await call('/api/admin/announcements',{headers:{cookie}})).status,403);
  assert.equal((await login()).response.status,403);
  assert.equal((await call('/api/admin/session',{headers:{cookie:cookie+'tampered'}})).status,401);
});

test('CRUD autenticado, publicações inativas e invalidação do cache público',async t=>{
  const {call,login}=await start(t);const {cookie}=await login();
  const headers={cookie,'Content-Type':'application/json'};
  assert.deepEqual(await (await call('/api/announcements')).json(),{items:[]});
  const created=await call('/api/admin/announcements',{method:'POST',headers,body:JSON.stringify(valid)});assert.equal(created.status,201);
  const {item}=await created.json();
  assert.equal((await (await call('/api/announcements')).json()).items.length,1);
  const inactive=await call('/api/admin/announcements/'+item.id,{method:'PUT',headers,body:JSON.stringify({...valid,active:false})});assert.equal(inactive.status,200);
  assert.deepEqual(await (await call('/api/announcements')).json(),{items:[]});
  assert.equal((await (await call('/api/admin/announcements',{headers})).json()).items.length,1);
  assert.equal((await call('/api/admin/announcements/'+item.id,{method:'DELETE',headers})).status,200);
  assert.equal((await call('/api/admin/announcements/'+item.id,{method:'DELETE',headers})).status,404);
});

test('protege escrita contra origem externa, corpo grande, JSON inválido e acesso anônimo',async t=>{
  const {call,login}=await start(t);const {cookie}=await login();
  const headers={cookie,'Content-Type':'application/json'};
  assert.equal((await call('/api/admin/announcements',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(valid)})).status,401);
  assert.equal((await call('/api/admin/announcements',{method:'POST',headers:{...headers,origin:'https://other.example'},body:JSON.stringify(valid)})).status,403);
  assert.equal((await call('/api/admin/announcements',{method:'POST',headers,body:'x'.repeat(9000)})).status,413);
  assert.equal((await call('/api/admin/announcements',{method:'POST',headers,body:'invalid'})).status,400);
  assert.equal((await call('/api/admin/announcements',{method:'POST',headers,body:JSON.stringify({...valid,url:'javascript:alert(1)'})})).status,400);
  assert.equal((await call('/api/announcements',{method:'POST'})).status,405);
});

test('renova sessão expirada no servidor e bloqueia cookie após 8h',async t=>{
  const {call,login,mock,advance}=await start(t);const {cookie}=await login();
  advance(3600000);
  const refreshed=await call('/api/admin/session',{headers:{cookie}});assert.equal(refreshed.status,200);assert.ok(refreshed.headers.get('set-cookie'));assert.equal(mock.refreshes(),1);
  advance(28800000);
  assert.equal((await call('/api/admin/session',{headers:{cookie}})).status,401);
});

test('falhas não expõem credenciais e tentativas de login incorretas são limitadas',async t=>{
  const {call,mock}=await start(t);
  for(let i=0;i<10;i++)assert.equal((await call('/api/admin/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@example.com',password:'wrong'})})).status,401);
  assert.equal((await call('/api/admin/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,429);
  mock.setFailure(true);
  const response=await call('/api/announcements');assert.equal(response.status,503);assert.ok(!(await response.text()).includes(env.SUPABASE_SERVICE_ROLE_KEY));
});

test('estatísticas do pico e horário ficam disponíveis somente ao administrador',async t=>{
  const {call,login,mock}=await start(t);
  assert.equal((await call('/api/admin/stats')).status,401);
  const {cookie}=await login();
  const response=await call('/api/admin/stats',{headers:{cookie}});assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{online:12,peak_online:34,peak_at:'2026-10-25T14:35:00Z',tracking_since:'2026-10-25T12:00:00Z'});
  mock.setAdmin(false);assert.equal((await call('/api/admin/stats',{headers:{cookie}})).status,403);
});
