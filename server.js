const http = require("http");
const fs = require("fs");
const path = require("path");
if (fs.existsSync(path.join(__dirname, '.env'))) process.loadEnvFile(path.join(__dirname, '.env'));
const { URL } = require("url");
const { createMapService, STATE_IDS } = require("./map-data");
const { createExteriorService } = require("./exterior-data");
const { createPresenceHandler } = require("./online-presence");
const onlinePresence = createPresenceHandler();

const { electionFor } = require("./elections");
const { createResultCache } = require("./result-cache");
const PORT = process.env.PORT || 3000;
const resultCache = createResultCache();
const UFS = ["ac","al","ap","am","ba","ce","df","es","go","ma","mt","ms","mg","pa","pb","pr","pe","pi","rj","rn","rs","ro","rr","sc","sp","se","to"];
const CACHE_MS = 30_000;

let nextTSERequest = 0;
async function fetchJSON(url, tse = false) {
  if (tse) {
    const start = Math.max(Date.now(), nextTSERequest);
    nextTSERequest = start + 25;
    await new Promise(resolve => setTimeout(resolve, start - Date.now()));
  }
  const response = await fetch(url, {headers:{accept:"application/json", "user-agent":"TSE-Dashboard/1.0"}, signal:AbortSignal.timeout(tse ? 12000 : 8000)});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

const n = v => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim().replace(/\./g,"").replace(",",".").replace("%","");
  const x = Number(s);
  return Number.isFinite(x) ? x : 0;
};
const pct = v => n(v);
const pick = (o, keys, fallback=null) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return fallback;
};
const arr = v => Array.isArray(v) ? v : [];

function candidates(raw) {
  // Cada partido/coligação possui sua própria lista de candidatos no EA20.
  const list = [];
  const walk = obj => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj.cand)) list.push(...obj.cand);
    for (const [key, value] of Object.entries(obj)) {
      if (key !== "cand" && value && typeof value === "object") walk(value);
    }
  };
  // O arquivo presidencial pode conter o cargo encapsulado em carg.
  const presidente = arr(raw.carg).find(c => String(c.cd) === "1");
  walk(presidente || raw);
  return list.map(c => ({
    nome: String(pick(c, ["nmu","nm","nomeUrna","nome"], "")),
    partido: String(pick(c, ["cc","sgp","partido"], "")),
    votos: n(pick(c, ["vap","votos","vt"], 0)),
    percentual: pct(pick(c, ["pvap","percentual","pct"], 0))
  }));
}

function normalize(raw, uf) {
  const cand = candidates(raw);
  const lula = cand.find(c => c.nome.toUpperCase().includes("LULA")) || {votos:0,percentual:0};
  const flavio = cand.find(c => c.nome.toUpperCase().includes("FLAVIO") || c.nome.toUpperCase().includes("FLÁVIO")) || {votos:0,percentual:0};

  // No EA20 atual, s contém as seções e v contém os totais de votos.
  const secoes = raw.s && typeof raw.s === "object" ? raw.s : raw;
  const votos = raw.v && typeof raw.v === "object" ? raw.v : raw;
  const secoesTotalizadas = n(pick(secoes, ["st","str","secoesTotalizadas"], 0));
  const secoesTotal = n(pick(secoes, ["ts","s","se","totalSecoes"], 0));
  const secoesPct = pct(pick(secoes, ["pst","psta","percentualSecoesTotalizadas"],
    secoesTotal ? secoesTotalizadas / secoesTotal * 100 : 0));
  const validosInformados = pick(votos, ["vvc","vv","votosValidos","tvv"]);
  const validos = validosInformados === null
    ? cand.reduce((a,c) => a + c.votos, 0)
    : n(validosInformados);

  return {
    uf: uf.toUpperCase(),
    validos,
    secoesTotalizadas,
    secoesTotal,
    secoesPct,
    lula,
    flavio,
    atualizadoEm: raw.dg && raw.hg ? `${raw.dg} ${raw.hg}` : raw.dt && raw.ht ? `${raw.dt} ${raw.ht}` : pick(raw, ["ultimaAtualizacao"], null),
    rawMeta: { pst: secoes.pst, st: secoes.st, s: secoesTotal, vvc: votos.vvc, vv: votos.vv }
  };
}

async function getJSON(uf, election) {
  const file = `${uf}-c0001-e${election.arquivo}-u.json`;
  const url = `${election.root}/dados/${uf}/${file}`;
  try { return normalize(await fetchJSON(url, true), uf); }
  catch (e) { throw new Error(`${uf.toUpperCase()}: TSE ${e.message}`); }
}
const mapService = createMapService({fetchJSON, normalize});
const exteriorService = createExteriorService({fetchJSON, normalize});

async function snapshot(turn = "2") {
  const election = electionFor(turn);
  return resultCache("national:"+election.codigo,election.turno===1?Infinity:CACHE_MS,async()=>{
  const targets = ["br", ...UFS];
  const settled = await Promise.allSettled(targets.map(uf=>getJSON(uf,election)));
  const ok = settled.filter(x => x.status === "fulfilled").map(x => x.value);
  const errors = settled.filter(x => x.status === "rejected").map(x => x.reason.message);
  const brasil = ok.find(x => x.uf === "BR") || null;
  const estados = ok.filter(x => x.uf !== "BR");
  const totalValidos = brasil?.validos || estados.reduce((a,x)=>a+x.validos,0);
  estados.forEach(x => x.pesoBrasil = totalValidos ? x.validos / totalValidos * 100 : 0);
  const data = { turno:election.turno, eleicao:election.codigo, fonte:"TSE", coletadoEm:new Date().toISOString(), brasil, estados, errors };
  return data;
  }, {persist:election.turno===1,complete:data=>election.turno===2||Boolean(data.brasil&&data.estados.length===27&&data.errors.length===0)});
}

function send(res, code, type, body) {
  res.writeHead(code, {
    "Content-Type": type,
    "Cache-Control":"no-store",
    "Access-Control-Allow-Origin":"*"
  });
  res.end(body);
}

const server = http.createServer(async (req,res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  if (u.pathname === '/api/online') return onlinePresence(req, res);
  let election;
  if(u.pathname.startsWith("/api/")){
    try {election=electionFor(u.searchParams.get("turno")??"2");}
    catch(e){return send(res,400,"application/json",JSON.stringify({error:e.message}));}
  }
  if (u.pathname === '/api/exterior') {
    const value = u.searchParams.get('pagina') || '0', page = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(page) || page > 100) return send(res,400,'application/json',JSON.stringify({error:'Página inválida'}));
    try {return send(res,200,'application/json; charset=utf-8',JSON.stringify(await exteriorService.page(page,election.turno)));}
    catch {return send(res,502,'application/json',JSON.stringify({error:'Não foi possível consultar o exterior no TSE.'}));}
  }
  if(u.pathname==="/api/municipios/catalogo"){
    try {
      const estados=await mapService.catalog(election.turno);
      return send(res,200,"application/json; charset=utf-8",JSON.stringify({turno:election.turno,eleicao:election.codigo,estados,total:estados.reduce((sum,state)=>sum+state.municipios.length,0)}));
    }catch(e){return send(res,502,"application/json",JSON.stringify({error:e.message}));}
  }
  if (["/api/municipios", "/api/mapa"].includes(u.pathname)) {
    const uf = (u.searchParams.get("uf") || (u.pathname === "/api/mapa" ? "br" : "")).toLowerCase();
    if (!Object.hasOwn(STATE_IDS,uf) && !(uf === "br" && u.pathname === "/api/mapa")) return send(res,400,"application/json",JSON.stringify({error:"UF inválida"}));
    try {
      const pageParam = u.searchParams.get("pagina");
      const page = pageParam === null ? null : Number(pageParam);
      if (page !== null && (!/^\d+$/.test(pageParam) || !Number.isSafeInteger(page) || page > 100)) return send(res,400,"application/json",JSON.stringify({error:"Página inválida"}));
      const data = await (u.pathname === "/api/mapa" ? mapService.geometry(uf) : mapService.municipalities(uf, page, election.turno, {national:u.searchParams.get("nacional")==="1"}));
      return send(res,200,"application/json; charset=utf-8",JSON.stringify(data));
    } catch(e) { return send(res,502,"application/json",JSON.stringify({error:e.message})); }
  }
  if (u.pathname === "/api/resultados") {
    try { return send(res,200,"application/json; charset=utf-8",JSON.stringify(await snapshot(election.turno))); }
    catch(e){ return send(res,500,"application/json; charset=utf-8",JSON.stringify({error:e.message})); }
  }
  if (u.pathname === "/api/raw") {
    const uf = (u.searchParams.get("uf") || "br").toLowerCase();
    if (![...UFS,"br"].includes(uf)) return send(res,400,"application/json","{\"error\":\"UF inválida\"}");
    try {
      const file = `${uf}-c0001-e${election.arquivo}-u.json`;
      const raw = await resultCache(`raw:${election.codigo}:${uf}`,election.turno===1?Infinity:CACHE_MS,()=>fetchJSON(`${election.root}/dados/${uf}/${file}`,true),{persist:election.turno===1});
      return send(res,200,"application/json; charset=utf-8",JSON.stringify(raw));
    } catch(e){ return send(res,500,"application/json",JSON.stringify({error:e.message})); }
  }

  let file = u.pathname === "/" ? "/index.html" : u.pathname;
  const full = path.join(__dirname,"public",file);
  if (!full.startsWith(path.join(__dirname,"public"))) return send(res,403,"text/plain","Forbidden");
  fs.readFile(full,(err,b)=>{
    if(err) return send(res,404,"text/plain","Not found");
    const ext=path.extname(full);
    const type=ext===".html"?"text/html; charset=utf-8":ext===".js"?"text/javascript":ext===".geojson"?"application/geo+json":ext===".json"?"application/json; charset=utf-8":ext===".css"?"text/css; charset=utf-8":ext===".png"?"image/png":[".jpg",".jpeg"].includes(ext)?"image/jpeg":"text/plain";
    if (ext === ".html") {
      // URLs absolutas permitem que os aplicativos encontrem a imagem de compartilhamento.
      const protocol = req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted ? "https" : "http";
      const origin = new URL(process.env.SITE_URL || protocol + "://" + req.headers.host).origin;
      const escapedOrigin = origin.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      b = b.toString("utf8").replaceAll("__SITE_ORIGIN__", escapedOrigin);
    }
    send(res,200,type,b);
  });
});
if (require.main === module) server.listen(PORT,()=>console.log(`Dashboard: http://localhost:${PORT}`));
// A Vercel recebe uma função HTTP; o servidor também fica disponível para testes locais.
module.exports = server.listeners("request")[0];
module.exports.server = server;
module.exports.normalize = normalize;
