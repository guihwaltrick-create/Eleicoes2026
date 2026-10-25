(() => {
  const tickers=[...document.querySelectorAll('[data-announcement-ticker]')];
  if(!tickers.length)return;
  let signature='',running=false;
  function measure(){
    for(const ticker of tickers){
      const track=ticker.firstElementChild;if(!track||ticker.clientWidth===0)continue;
      ticker.style.setProperty('--ticker-width',ticker.clientWidth+'px');
      ticker.style.setProperty('--ticker-duration',Math.max(14,(ticker.clientWidth+track.scrollWidth)/45)+'s');
    }
  }
  function safeLink(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}}
  function render(items){
    for(const ticker of tickers){
      ticker.replaceChildren();ticker.hidden=!items.length;
      if(!items.length)continue;
      const track=document.createElement('div');track.className='announcement-track';
      items.forEach((item,index)=>{
        if(index){const separator=document.createElement('span');separator.className='announcement-separator';separator.textContent='•';separator.setAttribute('aria-hidden','true');track.append(separator);}
        const href=item.kind==='ad'?safeLink(item.url):null;
        const text=document.createElement(href?'a':'span');text.className='announcement-item'+(href?' is-ad':'');text.textContent=item.message;
        if(href){text.href=href;text.target='_blank';text.rel='noopener noreferrer sponsored';text.title='Abrir anúncio em nova aba';}
        track.append(text);
      });
      ticker.append(track);
    }
    measure();
  }
  async function load(){
    if(running||document.visibilityState==='hidden')return;running=true;
    try{
      const response=await fetch('/api/announcements',{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error();
      const data=await response.json();
      if(!Array.isArray(data.items))throw Error();
      const items=data.items.filter(item=>['info','ad'].includes(item.kind)&&typeof item.message==='string'&&item.message.trim());
      const next=JSON.stringify(items);if(next!==signature){signature=next;render(items);}
    }catch{
      // Uma falha nunca interrompe os resultados eleitorais nem exibe mensagens técnicas.
    }finally{running=false;}
  }
  const observer=new ResizeObserver(measure);tickers.forEach(ticker=>observer.observe(ticker));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load();});
  setInterval(load,30000);load();
})();
