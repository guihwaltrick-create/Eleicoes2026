const fs = require('node:fs/promises');
const path = require('node:path');
function createResultCache({directory = path.join(__dirname,'.cache','primeiro-turno'), now = Date.now} = {}) {
  const memory = new Map(), pending = new Map();
  return function cached(key, ttl, loader, {persist = false, complete = () => true} = {}) {
    const hit = memory.get(key);
    if (hit && now() - hit.at < ttl) return Promise.resolve(hit.value);
    if (pending.has(key)) return pending.get(key);
    const file = path.join(directory,encodeURIComponent(key)+'.json');
    const request = (async () => {
      if (persist) {
        try {
          const saved = JSON.parse(await fs.readFile(file,'utf8'));
          if (complete(saved)) {memory.set(key,{at:now(),value:saved});return saved;}
        } catch { /* Cache ausente ou inválido: consulta a fonte. */ }
      }
      const value = await loader();
      if (complete(value)) {
        if (persist) {
          try {
            await fs.mkdir(directory,{recursive:true});
            const temporary = file+'.'+process.pid+'.tmp';
            await fs.writeFile(temporary,JSON.stringify(value));
            await fs.rename(temporary,file);
          } catch (e) { console.warn('Não foi possível persistir cache do primeiro turno:',e.message); }
        }
        memory.set(key,{at:now(),value});
      }
      return value;
    })().finally(()=>pending.delete(key));
    pending.set(key,request);
    return request;
  };
}
module.exports = {createResultCache};
