const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const vm = require('node:vm');
const {createPresenceHandler} = require('../online-presence');

const env = {SUPABASE_URL:'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY:'private-test-key'};
async function start(t, options = {}) {
  const server = http.createServer(createPresenceHandler({env, ...options}));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return 'http://127.0.0.1:' + server.address().port + '/api/online';
}

test('emite cookie assinado e reutiliza visitante entre abas sem expor o ID ou a chave', async t => {
  const ids = new Set(), requests = [];
  const url = await start(t, {fetchImpl:async (url, options) => {
    requests.push({url, options});
    ids.add(JSON.parse(options.body).p_visitor_id);
    return {ok:true, json:async () => ids.size};
  }});
  const first = await fetch(url, {method:'POST'});
  assert.equal(first.status, 200);
  const cookie = first.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; SameSite=Lax; Path=\/api\/online/);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.equal(first.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(await first.json(), {online:1, windowSeconds:120});
  const second = await fetch(url, {method:'POST', headers:{cookie:cookie.split(';')[0]}});
  assert.equal((await second.json()).online, 1);
  assert.equal(second.headers.get('set-cookie'), null);
  const other = await fetch(url, {method:'POST'});
  assert.equal((await other.json()).online, 2);
  assert.match(String(requests[0].url), /\/rpc\/eleicoes2026_online_heartbeat$/);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer private-test-key');
  assert.equal(requests[0].options.headers.apikey, 'private-test-key');
});

test('rejeita origem externa, métodos incorretos e conteúdo enviado pelo cliente', async t => {
  let calls = 0;
  const url = await start(t, {fetchImpl:async () => {calls++;}});
  assert.equal((await fetch(url)).status, 405);
  assert.equal((await fetch(url, {method:'POST', headers:{origin:'https://other.example'}})).status, 403);
  assert.equal((await fetch(url, {method:'POST', headers:{'sec-fetch-site':'cross-site'}})).status, 403);
  assert.equal((await fetch(url, {method:'POST', body:'{"online":999}'})).status, 400);
  assert.equal(calls, 0);
});

test('cookies alterados e assinaturas Unicode geram uma nova identificação válida', async t => {
  const ids = [];
  const url = await start(t, {fetchImpl:async (_, options) => {
    ids.push(JSON.parse(options.body).p_visitor_id);
    return {ok:true, json:async () => 1};
  }});
  const cookie = (await fetch(url, {method:'POST'})).headers.get('set-cookie').split(';')[0];
  const id = cookie.split('=')[1].split('.')[0];
  for (const signature of ['x'.repeat(43), 'é'.repeat(43), 'invalid']) {
    const result = await fetch(url, {method:'POST', headers:{cookie:`eleicoes2026_visitor=${id}.${signature}`}});
    assert.equal(result.status, 200);
    assert.ok(result.headers.get('set-cookie'));
  }
  assert.equal(new Set(ids).size, 4);
});

test('HTTPS emite cookie Secure; falhas e contagens inválidas não viram zero nem vazam segredos', async t => {
  let result = {ok:true, json:async () => 2};
  const url = await start(t, {fetchImpl:async () => result});
  const secure = await fetch(url, {method:'POST', headers:{'x-forwarded-proto':'https', origin:url.replace('http:', 'https:').replace('/api/online', '')}});
  assert.match(secure.headers.get('set-cookie'), /; Secure/);
  for (const value of [null, {}, -1, 1.5, 'NaN']) {
    result = {ok:true, json:async () => value};
    const response = await fetch(url, {method:'POST'});
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {error:'Contador online indisponível.'});
  }
  result = {ok:false};
  assert.equal((await fetch(url, {method:'POST'})).status, 503);
  const timeoutUrl = await start(t, {fetchImpl:async () => {throw new Error(env.SUPABASE_SERVICE_ROLE_KEY);}});
  assert.deepEqual(await (await fetch(timeoutUrl, {method:'POST'})).json(), {error:'Contador online indisponível.'});
  const missingUrl = await start(t, {env:{}});
  assert.equal((await fetch(missingUrl, {method:'POST'})).status, 503);
});

test('cliente pausa em aba oculta, retoma ao voltar, impede sobreposição e sinaliza falha', async () => {
  const indicators = Array.from({length:2}, () => ({textContent:'', classList:{add(){}, remove(){}}, setAttribute(){}, removeAttribute(){}}));
  const events = {}, intervals = [];
  let calls = 0, release;
  const context = {
    document:{visibilityState:'hidden', querySelectorAll:() => indicators, addEventListener:(name, fn) => {events[name] = fn;}},
    window:{addEventListener(){}}, Intl, AbortSignal,
    setInterval:(fn, ms) => {intervals.push({fn, ms});},
    fetch:async () => {calls++; return new Promise(resolve => {release = resolve;});}
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/online.js'), 'utf8'), context);
  assert.equal(calls, 0);
  assert.equal(intervals[0].ms, 30000);
  context.document.visibilityState = 'visible';
  events.visibilitychange(); intervals[0].fn();
  assert.equal(calls, 1);
  release({ok:true, json:async () => ({online:12})});
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(indicators.every(node => node.textContent === '12 online'));
  intervals[0].fn();
  assert.equal(calls, 2);
  release({ok:false});
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(indicators.every(node => node.textContent === 'Online indisponível'));
});
