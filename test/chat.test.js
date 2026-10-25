const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const {randomUUID}=require('node:crypto');const {createChatHandler}=require('../chat');
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-test-key'};
async function start(t,fetchImpl){const server=http.createServer(createChatHandler({env,fetchImpl}));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));return 'http://127.0.0.1:'+server.address().port+'/api/chat';}
const post=(data,cookie)=>({method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(data)});
test('chat compartilha histórico entre visitantes e não expõe identificadores internos',async t=>{
 const rows=[];let upstream;
 const url=await start(t,async(url,options)=>{upstream=options;if(options.method==='POST'){const p=JSON.parse(options.body);assert.match(p.p_ip_hash,/^[a-f0-9]{64}$/);const row={id:randomUUID(),author:p.p_author,message:p.p_message,visitor_id:p.p_visitor_id,created_at:new Date().toISOString(),ip_hash:p.p_ip_hash};rows.unshift(row);return {ok:true,json:async()=>[row]};}return {ok:true,json:async()=>[...rows]};});
 const first=await fetch(url);const cookie=first.headers.get('set-cookie').split(';')[0];assert.deepEqual(await first.json(),{messages:[]});assert.match(first.headers.get('set-cookie'),/HttpOnly; SameSite=Lax; Path=\/api\/chat/);
 const sent=await fetch(url,post({author:'Ana',message:'<b>Olá!</b>',request_id:randomUUID(),visitor_id:'spoof'},cookie));assert.equal(sent.status,200);const body=await sent.json();assert.equal(body.message.own,true);assert.equal(body.message.message,'<b>Olá!</b>');assert.equal(body.message.visitor_id,undefined);assert.equal(body.message.ip_hash,undefined);
 const other=await fetch(url);const history=await other.json();assert.equal(history.messages[0].own,false);assert.equal(history.messages[0].author,'Ana');assert(!JSON.stringify(history).includes('private-test-key'));assert.equal(upstream.headers.Authorization,'Bearer private-test-key');
 const mine=await fetch(url,{headers:{cookie}});assert.equal((await mine.json()).messages[0].own,true);
});
test('chat valida origem, campos, tamanho e método antes de escrever',async t=>{
 let writes=0;const url=await start(t,async()=>{writes++;return {ok:true,json:async()=>[]};});
 assert.equal((await fetch(url,{method:'DELETE'})).status,405);
 assert.equal((await fetch(url,{...post({}),headers:{origin:'https://other.example','Content-Type':'application/json'}})).status,403);
 for(const data of [null,{}, {author:'A',message:'x',request_id:'bad'},{author:'A'.repeat(31),message:'x',request_id:randomUUID()},{author:'A',message:'x'.repeat(281),request_id:randomUUID()},{author:'A',message:'   ',request_id:randomUUID()}])assert.equal((await fetch(url,post(data))).status,400);
 assert.equal((await fetch(url,post({message:'x'.repeat(5000)}))).status,413);assert.equal(writes,0);
});
test('chat trata limitação e falhas sem expor dados internos e renova cookies adulterados',async t=>{
 let fail=false;const url=await start(t,async()=>({ok:false,json:async()=>({message:fail?'private-test-key internal table':'chat_rate_limit'})}));
 let response=await fetch(url,post({author:'A',message:'x',request_id:randomUUID()},'eleicoes2026_chat=invalid.untrusted'));assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'5');assert(response.headers.get('set-cookie'));
 fail=true;response=await fetch(url);assert.equal(response.status,503);assert(!JSON.stringify(await response.json()).includes('private-test-key'));
});
