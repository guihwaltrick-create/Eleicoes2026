(() => {
  const memory=new Map(), pending=new Map();
  const prefix='eleicoes2026:primeiro-turno:v1:';
  function complete(data){
    if(data.errors?.length)return false;
    if(Array.isArray(data.localidades)&&Array.isArray(data.paises))return Boolean(data.resumo&&data.paginas>0);
    if(Array.isArray(data.estados))return Boolean((data.brasil&&data.estados.length===27)||(data.total&&data.estados.every(state=>Array.isArray(state.municipios))));
    return Array.isArray(data.municipios);
  }
  async function get(path,turn='2'){
    turn=String(turn);
    const key=turn+':'+path;
    if(turn==='1'){
      if(memory.has(key))return memory.get(key);
      try {const saved=JSON.parse(localStorage.getItem(prefix+path));if(saved&&complete(saved)){memory.set(key,saved);return saved;}} catch {}
    }
    if(pending.has(key))return pending.get(key);
    const request=(async()=>{
      const url=new URL(path,location.origin);url.searchParams.set('turno',turn);
      const response=await fetch(url.pathname+url.search);
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Falha ao consultar os resultados');
      if(turn==='1'&&complete(data)){
        memory.set(key,data);
        try {localStorage.setItem(prefix+path,JSON.stringify(data));}catch{}
      }
      return data;
    })().finally(()=>pending.delete(key));
    pending.set(key,request);
    return request;
  }
  window.electionResults={get};
})();
