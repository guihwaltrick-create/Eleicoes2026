(() => {
  const root=document.createElement('div');root.className='chat-preview';
  root.innerHTML=`<section class="chat-panel" id="chatPreviewPanel" role="dialog" aria-labelledby="chatPreviewTitle" hidden>
    <header class="chat-heading"><div><h2 id="chatPreviewTitle">Conversa da apuração</h2><small>Conversa pública · atualização automática</small></div><button class="chat-close" type="button" aria-label="Fechar chat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
    <p class="chat-note">As mensagens são públicas. Use um apelido e converse com respeito.</p>
    <p class="chat-status" role="status">Abra o chat para conectar.</p>
    <div class="chat-messages" role="log" aria-label="Mensagens da conversa" aria-live="polite" aria-relevant="additions"></div>
    <form class="chat-form"><label class="chat-name">Seu nome <input name="name" aria-label="Seu nome no chat" maxlength="30" value="Visitante" autocomplete="nickname"></label><div class="chat-emoji-picker" id="chatEmojiPicker" role="region" aria-label="Escolha um emoji" hidden></div><div class="chat-compose"><button class="chat-emoji-toggle" type="button" aria-label="Escolher emoji" aria-expanded="false" aria-controls="chatEmojiPicker"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 14a4 4 0 0 0 8 0M8 9h.01M16 9h.01"/></svg></button><input name="message" aria-label="Mensagem" placeholder="Escreva uma mensagem…" maxlength="280" autocomplete="off" required><button class="chat-send" type="submit" aria-label="Enviar mensagem" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/></svg></button></div></form>
  </section><button class="chat-launcher" type="button" aria-controls="chatPreviewPanel" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 3V11.5a10 10 0 0 1 20 0Z"/><path d="M7 10h8M7 14h5"/></svg><span>Chat</span><span class="chat-unread" role="status" aria-live="polite" aria-atomic="true" hidden></span></button>`;
  document.body.append(root);
  const panel=root.querySelector('.chat-panel'),launcher=root.querySelector('.chat-launcher'),form=root.querySelector('form'),message=form.elements.message,send=root.querySelector('.chat-send'),log=root.querySelector('.chat-messages');
  const status=root.querySelector('.chat-status'),badge=root.querySelector('.chat-unread');
  const unread=new Set();
  function syncUnread(){
    const count=unread.size;badge.hidden=!count;badge.textContent=count>99?'99+':String(count);
    const label=count?'Chat · '+count+' nova'+(count===1?' mensagem':'s mensagens'):'Chat';
    launcher.setAttribute('aria-label',label);launcher.title=label;
  }
  const emojiToggle=root.querySelector('.chat-emoji-toggle'),picker=root.querySelector('.chat-emoji-picker');
  function showEmojis(open){picker.hidden=!open;emojiToggle.setAttribute('aria-expanded',String(open));}
  emojiToggle.onclick=()=>showEmojis(picker.hidden);
  for(const [emoji,label] of [['😀','Sorriso'],['😊','Feliz'],['😂','Rindo'],['😍','Apaixonado'],['😎','Óculos de sol'],['🤔','Pensando'],['😮','Surpreso'],['😢','Triste'],['👍','Aprovação'],['👎','Desaprovação'],['👏','Palmas'],['🙌','Comemoração'],['🙏','Agradecimento'],['👋','Aceno'],['❤️','Coração'],['💙','Coração azul'],['💛','Coração amarelo'],['💚','Coração verde'],['🇧🇷','Brasil'],['🗳️','Urna'],['📊','Gráfico'],['🔥','Fogo'],['🎉','Festa'],['✅','Confirmado']]){
    const button=document.createElement('button');button.type='button';button.textContent=emoji;button.title=label;button.setAttribute('aria-label',label);
    button.onclick=()=>{
      const start=message.selectionStart??message.value.length,end=message.selectionEnd??start;
      if(message.value.length-(end-start)+emoji.length>message.maxLength){status.textContent='A mensagem pode ter até 280 caracteres.';return;}
      message.setRangeText(emoji,start,end,'end');syncSend();showEmojis(false);message.focus();
    };
    picker.append(button);
  }
  document.addEventListener('pointerdown',event=>{if(!picker.contains(event.target)&&!emojiToggle.contains(event.target))showEmojis(false);});
  let ready=false,sending=false,fetching=false,pending=null;
  const messages=new Map();
  try{form.elements.name.value=localStorage.getItem('eleicoes2026:chat-name')||'Visitante';}catch{}
  function syncSend(){send.disabled=!ready||sending||!message.value.trim();}
  function render(rows){
    const atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<60;
    for(const row of rows){
      if(ready&&panel.hidden&&!row.own&&!messages.has(row.id))unread.add(row.id);
      messages.set(row.id,row);
    }
    syncUnread();
    const ordered=[...messages.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
    while(ordered.length>100)messages.delete(ordered.shift().id);
    const ids=new Set(ordered.map(row=>row.id));
    for(const node of [...log.children])if(!ids.has(node.dataset.id))node.remove();
    for(const row of ordered){
      let article=[...log.children].find(node=>node.dataset.id===row.id);
      if(article)continue;
      article=document.createElement('article');article.dataset.id=row.id;article.className='chat-message'+(row.own?' is-own':'');
      const meta=document.createElement('div');meta.className='chat-message-meta';
      const author=document.createElement('strong');author.textContent=row.author+(row.own?' · você':'');
      const time=document.createElement('time');time.dateTime=row.created_at;time.textContent=new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date(row.created_at));time.title=new Date(row.created_at).toLocaleString('pt-BR');
      const content=document.createElement('p');content.textContent=row.message;meta.append(author,time);article.append(meta,content);
      const next=[...log.children].find(node=>ordered.findIndex(item=>item.id===node.dataset.id)>ordered.indexOf(row));
      log.insertBefore(article,next||null);
    }
    if(atBottom)log.scrollTop=log.scrollHeight;
  }
  async function responseData(response){const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível conectar ao chat.');return data;}
  async function load(){
    if(document.visibilityState==='hidden'||fetching||sending)return;
    fetching=true;
    try{
      const data=await fetch('/api/chat',{cache:'no-store',signal:AbortSignal.timeout(12000)}).then(responseData);
      if(!Array.isArray(data.messages))throw Error('Resposta inválida do chat.');
      render(data.messages);ready=true;status.textContent=messages.size?'Conectado · novas mensagens a cada 4 segundos':'Seja o primeiro a conversar!';
    }catch(error){status.textContent=error.message||'Chat indisponível. Tentando reconectar…';}
    finally{fetching=false;syncSend();}
  }
  function toggle(open){panel.hidden=!open;launcher.setAttribute('aria-expanded',String(open));if(open){unread.clear();syncUnread();log.scrollTop=log.scrollHeight;root.querySelector('.chat-close').focus({preventScroll:true});load();}else{showEmojis(false);launcher.focus({preventScroll:true});}}
  launcher.onclick=()=>toggle(panel.hidden);root.querySelector('.chat-close').onclick=()=>toggle(false);
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.stopPropagation();if(!picker.hidden){showEmojis(false);emojiToggle.focus();}else toggle(false);}});
  message.addEventListener('input',syncSend);
  form.addEventListener('submit',async event=>{
    event.preventDefault();const text=message.value.trim(),author=form.elements.name.value.trim()||'Visitante';if(!text||sending||!ready)return;
    if(!pending||pending.message!==text||pending.author!==author)pending={author,message:text,request_id:crypto.randomUUID()};
    sending=true;syncSend();status.textContent='Enviando…';
    try{
      const data=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending),signal:AbortSignal.timeout(12000)}).then(responseData);
      render([data.message]);log.scrollTop=log.scrollHeight;if(message.value.trim()===text)message.value='';pending=null;
      try{localStorage.setItem('eleicoes2026:chat-name',author);}catch{}
      status.textContent='Mensagem enviada para a conversa pública.';
    }catch(error){status.textContent=error.message||'Não foi possível enviar. Sua mensagem foi mantida para tentar novamente.';}
    finally{sending=false;syncSend();}
  });
  load();setInterval(load,4000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load();});
  const map=document.getElementById('mapaScreen');
  function syncHost(){const host=map?.classList.contains('is-fullscreen')?map:document.body;if(root.parentNode!==host)host.append(root);}
  if(map)new MutationObserver(syncHost).observe(map,{attributes:true,attributeFilter:['class']});
  document.addEventListener('fullscreenchange',syncHost);syncHost();
})();
