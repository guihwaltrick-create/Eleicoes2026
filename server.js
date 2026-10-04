const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const TSE = "https://resultados.tse.jus.br/oficial/ele2026/6257/dados";
const UFS = ["ac","al","ap","am","ba","ce","df","es","go","ma","mt","ms","mg","pa","pb","pr","pe","pi","rj","rn","rs","ro","rr","sc","sp","se","to"];
const CACHE_MS = 30_000;
let cache = { at: 0, data: null };

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

async function getJSON(uf) {
  const file = `${uf}-c0001-e006257-u.json`;
  const url = `${TSE}/${uf}/${file}?_=${Date.now()}`;
  const r = await fetch(url, {
    headers: { "accept":"application/json", "user-agent":"Mozilla/5.0 TSE-Dashboard/1.0" },
    cache: "no-store"
  });
  if (!r.ok) throw new Error(`${uf.toUpperCase()}: TSE HTTP ${r.status}`);
  return normalize(await r.json(), uf);
}

async function snapshot() {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  const targets = ["br", ...UFS];
  const settled = await Promise.allSettled(targets.map(getJSON));
  const ok = settled.filter(x => x.status === "fulfilled").map(x => x.value);
  const errors = settled.filter(x => x.status === "rejected").map(x => x.reason.message);
  const brasil = ok.find(x => x.uf === "BR") || null;
  const estados = ok.filter(x => x.uf !== "BR");
  const totalValidos = brasil?.validos || estados.reduce((a,x)=>a+x.validos,0);
  estados.forEach(x => x.pesoBrasil = totalValidos ? x.validos / totalValidos * 100 : 0);
  const data = { fonte:"TSE", coletadoEm:new Date().toISOString(), brasil, estados, errors };
  cache = { at: Date.now(), data };
  return data;
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
  if (u.pathname === "/api/resultados") {
    try { return send(res,200,"application/json; charset=utf-8",JSON.stringify(await snapshot())); }
    catch(e){ return send(res,500,"application/json; charset=utf-8",JSON.stringify({error:e.message})); }
  }
  if (u.pathname === "/api/raw") {
    const uf = (u.searchParams.get("uf") || "br").toLowerCase();
    if (![...UFS,"br"].includes(uf)) return send(res,400,"application/json","{\"error\":\"UF inválida\"}");
    try {
      const file = `${uf}-c0001-e006257-u.json`;
      const r = await fetch(`${TSE}/${uf}/${file}?_=${Date.now()}`, {cache:"no-store"});
      return send(res,r.status,"application/json; charset=utf-8",await r.text());
    } catch(e){ return send(res,500,"application/json",JSON.stringify({error:e.message})); }
  }

  let file = u.pathname === "/" ? "/index.html" : u.pathname;
  const full = path.join(__dirname,"public",file);
  if (!full.startsWith(path.join(__dirname,"public"))) return send(res,403,"text/plain","Forbidden");
  fs.readFile(full,(err,b)=>{
    if(err) return send(res,404,"text/plain","Not found");
    const ext=path.extname(full);
    const type=ext===".html"?"text/html; charset=utf-8":ext===".js"?"text/javascript":ext===".png"?"image/png":[".jpg",".jpeg"].includes(ext)?"image/jpeg":"text/plain";
    send(res,200,type,b);
  });
});
server.listen(PORT,()=>console.log(`Dashboard: http://localhost:${PORT}`));
