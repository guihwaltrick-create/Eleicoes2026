const {randomUUID,createHmac,timingSafeEqual}=require('node:crypto');
const COOKIE='eleicoes2026_chat',UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function createChatHandler({env=process.env,fetchImpl=fetch}={}){
  return async(req,res)=>{
    const reply=(status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));};
    if(!['GET','POST'].includes(req.method))return reply(405,{error:'Método não permitido.'},{Allow:'GET, POST'});
    const secure=req.socket.encrypted||req.headers['x-forwarded-proto']==='https';
    if((req.headers.origin&&req.headers.origin!==`${secure?'https':'http'}://${req.headers.host}`)||req.headers['sec-fetch-site']==='cross-site')return reply(403,{error:'Origem não permitida.'});
    const key=env.SUPABASE_SERVICE_ROLE_KEY,base=env.SUPABASE_URL;
    if(!key||!base)return reply(503,{error:'Chat indisponível no momento.'});
    const sign=id=>createHmac('sha256',key).update('eleicoes2026-chat:'+id).digest('base64url');
    const value=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
    const [candidate,signature]=value.split('.'),expected=UUID.test(candidate||'')?sign(candidate):'';
    const valid=expected&&/^[A-Za-z0-9_-]{43}$/.test(signature||'')&&timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
    const visitor=valid?candidate:randomUUID();
    const cookie={'Set-Cookie':`${COOKIE}=${visitor}.${sign(visitor)}; HttpOnly; SameSite=Lax; Path=/api/chat; Max-Age=2592000${secure?'; Secure':''}`};
    const headers=valid?{}:cookie;
    const publicMessage=row=>({id:row.id,author:row.author,message:row.message,created_at:row.created_at,own:row.visitor_id===visitor});
    async function request(path,options={}){return fetchImpl(new URL(path,base),{...options,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},signal:AbortSignal.timeout(10000)});}
    try{
      if(req.method==='GET'){
        const response=await request('/rest/v1/eleicoes2026_chat_messages?select=id,author,message,created_at,visitor_id&order=created_at.desc,id.desc&limit=100');
        if(!response.ok)throw Error();const rows=await response.json();if(!Array.isArray(rows))throw Error();
        return reply(200,{messages:rows.reverse().map(publicMessage)},headers);
      }
      if(!(req.headers['content-type']||'').startsWith('application/json'))return reply(415,{error:'Envie os dados em JSON.'},headers);
      if(Number(req.headers['content-length'])>4096){req.resume();return reply(413,{error:'Mensagem muito grande.'},headers);}
      let size=0;const chunks=[];
      for await(const chunk of req.iterator({destroyOnReturn:false})){size+=chunk.length;if(size>4096){req.resume();return reply(413,{error:'Mensagem muito grande.'},headers);}chunks.push(chunk);}
      let data;try{data=JSON.parse(Buffer.concat(chunks).toString());}catch{return reply(400,{error:'Dados inválidos.'},headers);}
      const author=typeof data?.author==='string'?data.author.replace(/\s+/g,' ').trim():'',message=typeof data?.message==='string'?data.message.trim():'';
      if(!author||author.length>30||!message||message.length>280||!UUID.test(data?.request_id||''))return reply(400,{error:'Informe seu nome (até 30 caracteres) e uma mensagem de até 280 caracteres.'},headers);
      const ip=req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown';
      const ipHash=createHmac('sha256',key).update('eleicoes2026-chat-ip:'+String(ip).split(',')[0].trim()).digest('hex');
      const response=await request('/rest/v1/rpc/eleicoes2026_chat_send',{method:'POST',body:JSON.stringify({p_visitor_id:visitor,p_request_id:data.request_id,p_ip_hash:ipHash,p_author:author,p_message:message})});
      const result=await response.json();
      if(!response.ok){if(result?.message==='chat_rate_limit')return reply(429,{error:'Aguarde alguns segundos antes de enviar outra mensagem.'},{...headers,'Retry-After':'5'});throw Error();}
      if(!Array.isArray(result)||!result[0])throw Error();
      return reply(200,{message:publicMessage(result[0])},headers);
    }catch{return reply(503,{error:'Não foi possível conectar ao chat. Tente novamente em instantes.'},headers);}
  };
}
module.exports={createChatHandler};
