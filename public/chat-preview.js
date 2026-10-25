(() => {
  const root=document.createElement('div');root.className='chat-preview';
  root.innerHTML=`<section class="chat-panel" id="chatPreviewPanel" role="dialog" aria-labelledby="chatPreviewTitle" hidden>
    <header class="chat-heading"><div><h2 id="chatPreviewTitle">Conversa da apuração</h2><small>Prévia local · mensagens de demonstração</small></div><button class="chat-close" type="button" aria-label="Fechar chat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
    <p class="chat-note">Experimente o chat. As mensagens ficam apenas nesta página e não são enviadas a outras pessoas.</p>
    <div class="chat-messages" role="log" aria-label="Mensagens da conversa" aria-live="polite" aria-relevant="additions"></div>
    <form class="chat-form"><label class="chat-name">Seu nome <input name="name" aria-label="Seu nome no chat" maxlength="30" value="Visitante" autocomplete="nickname"></label><div class="chat-compose"><input name="message" aria-label="Mensagem" placeholder="Escreva uma mensagem…" maxlength="280" autocomplete="off" required><button class="chat-send" type="submit" aria-label="Enviar mensagem" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/></svg></button></div></form>
  </section><button class="chat-launcher" type="button" aria-controls="chatPreviewPanel" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 3V11.5a10 10 0 0 1 20 0Z"/><path d="M7 10h8M7 14h5"/></svg><span>Chat</span></button>`;
  document.body.append(root);
  const panel=root.querySelector('.chat-panel'),launcher=root.querySelector('.chat-launcher'),form=root.querySelector('form'),message=form.elements.message,send=root.querySelector('.chat-send'),log=root.querySelector('.chat-messages');
  function addMessage(name,text,own=false){
    const article=document.createElement('article');article.className='chat-message'+(own?' is-own':'');
    const meta=document.createElement('div');meta.className='chat-message-meta';
    const author=document.createElement('strong');author.textContent=name;
    const time=document.createElement('time');time.dateTime=new Date().toISOString();time.textContent=own?new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date()):'Exemplo';
    const content=document.createElement('p');content.textContent=text;meta.append(author,time);article.append(meta,content);log.append(article);log.scrollTop=log.scrollHeight;
  }
  addMessage('Marina','Boa noite! Acompanhando a apuração por aqui 👋');
  addMessage('Rafael','Gostei de conseguir ver os resultados de cada cidade no mapa.');
  addMessage('Você','Também estou acompanhando!',true);
  // Os exemplos são identificados como demonstração, sem simular usuários conectados.
  log.querySelector('article:last-child time').textContent='Exemplo';
  function toggle(open){panel.hidden=!open;launcher.setAttribute('aria-expanded',String(open));if(open){log.scrollTop=log.scrollHeight;root.querySelector('.chat-close').focus({preventScroll:true});}else launcher.focus({preventScroll:true});}
  launcher.onclick=()=>toggle(panel.hidden);root.querySelector('.chat-close').onclick=()=>toggle(false);
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.stopPropagation();toggle(false);}});
  message.addEventListener('input',()=>{send.disabled=!message.value.trim();});
  form.addEventListener('submit',event=>{event.preventDefault();const text=message.value.trim();if(!text)return;addMessage(form.elements.name.value.trim()||'Visitante',text,true);message.value='';send.disabled=true;message.focus();});
  const map=document.getElementById('mapaScreen');
  function syncHost(){const host=map?.classList.contains('is-fullscreen')?map:document.body;if(root.parentNode!==host)host.append(root);}
  if(map)new MutationObserver(syncHost).observe(map,{attributes:true,attributeFilter:['class']});
  document.addEventListener('fullscreenchange',syncHost);syncHost();
})();
