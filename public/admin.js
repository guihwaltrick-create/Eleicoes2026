(() => {
  const el=id=>document.getElementById(id);
  let editing=null, items=[], working=false,statsRunning=false;
  const status=(text,type='')=>{el('adminStatus').textContent=text;el('adminStatus').className='status'+(type?' is-'+type:'');};
  const node=(tag,className,text)=>{const element=document.createElement(tag);element.className=className;if(text!==undefined)element.textContent=text;return element;};
  async function api(path,options={}){
    const response=await fetch('/api/admin/'+path,{credentials:'same-origin',...options,headers:options.body?{'Content-Type':'application/json'}:{}});
    const data=await response.json();
    if(!response.ok){
      if(response.status===401||response.status===403)showLogin();
      throw new Error(data.error||'Não foi possível concluir a ação.');
    }
    return data;
  }
  function showLogin(){el('loginPanel').hidden=false;el('editorPanel').hidden=true;items=[];el('announcementList').replaceChildren();}
  async function loadStats(){
    if(statsRunning||el('editorPanel').hidden||document.visibilityState==='hidden')return;statsRunning=true;
    try{
      const data=await api('stats'),nf=new Intl.NumberFormat('pt-BR');
      el('statsOnline').textContent=nf.format(data.online);el('statsPeak').textContent=nf.format(data.peak_online);
      const format=value=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(value));
      el('statsPeakAt').textContent=data.peak_at?format(data.peak_at):'Aguardando acessos';
      el('statsStatus').textContent='Histórico desde '+format(data.tracking_since)+'. Atualiza a cada 30 segundos. Horários de Brasília.';
    }catch(error){el('statsOnline').textContent='—';el('statsPeak').textContent='—';el('statsPeakAt').textContent='—';el('statsStatus').textContent=error.message;}
    finally{statsRunning=false;}
  }
  function showEditor(user){el('loginPanel').hidden=true;el('editorPanel').hidden=false;el('adminEmail').textContent=user.email;loadStats();}
  function syncForm(){
    const ad=el('announcementKind').value==='ad';el('linkField').hidden=!ad;el('announcementUrl').required=ad;
    const message=el('announcementMessage').value;
    el('messageCount').textContent=message.length+'/240';
    el('announcementPreview').textContent=message.replace(/\s+/g,' ').trim()||'Sua publicação aparecerá aqui.';
  }
  function resetForm(){editing=null;el('announcementForm').reset();el('formTitle').textContent='Nova publicação';el('cancelEditButton').hidden=true;syncForm();}
  function edit(item){
    editing=item.id;el('announcementKind').value=item.kind;el('announcementMessage').value=item.message;
    el('announcementUrl').value=item.url||'';el('announcementOrder').value=item.sort_order;el('announcementActive').checked=item.active;
    el('formTitle').textContent='Editar publicação';el('cancelEditButton').hidden=false;syncForm();el('announcementMessage').focus();
  }
  function setWorking(value){working=value;document.querySelectorAll('button').forEach(button=>button.disabled=value);}
  async function reload(){const data=await api('announcements');items=data.items;render();}
  async function mutate(action,success){
    if(working)return;setWorking(true);status('Salvando…');
    try{await action();await reload();status(success,'success');}
    catch(error){status(error.message,'error');}
    finally{setWorking(false);}
  }
  function render(){
    const list=el('announcementList');list.replaceChildren();
    if(!items.length){list.append(node('p','empty','Nenhuma publicação cadastrada. Crie a primeira no formulário.'));return;}
    for(const item of items){
      const card=node('article','publication'), meta=node('div','publication-meta');
      meta.append(node('span','badge',item.kind==='ad'?'Anúncio':'Informação'),node('span','badge'+(item.active?' active':''),item.active?'Ativa':'Inativa'),node('span','','Ordem '+item.sort_order));
      card.append(meta,node('p','',item.message));
      if(item.url){const link=node('a','publication-link',item.url);link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';card.append(link);}
      const actions=node('div','publication-actions');
      const editButton=node('button','secondary','Editar');editButton.type='button';editButton.onclick=()=>edit(item);
      const toggle=node('button','secondary',item.active?'Desativar':'Ativar');toggle.type='button';toggle.onclick=()=>mutate(()=>api('announcements/'+item.id,{method:'PUT',body:JSON.stringify({...item,active:!item.active})}),'Status da publicação atualizado.');
      const remove=node('button','danger','Excluir');remove.type='button';remove.onclick=()=>{
        if(!confirm('Excluir esta publicação?'))return;
        mutate(async()=>{await api('announcements/'+item.id,{method:'DELETE'});if(editing===item.id)resetForm();},'Publicação excluída.');
      };
      actions.append(editButton,toggle,remove);card.append(actions);list.append(card);
    }
  }
  el('loginForm').onsubmit=async event=>{
    event.preventDefault();if(working)return;setWorking(true);status('Entrando…');
    try{
      const data=await api('session',{method:'POST',body:JSON.stringify({email:el('loginEmail').value,password:el('loginPassword').value})});
      el('loginPassword').value='';showEditor(data.user);await reload();status('Acesso autorizado.');
    }catch(error){el('loginPassword').value='';status(error.message,'error');}
    finally{setWorking(false);}
  };
  el('logoutButton').onclick=async()=>{
    if(working)return;setWorking(true);
    try{await api('session',{method:'DELETE'});showLogin();resetForm();status('Você saiu da administração.');}
    catch(error){status(error.message,'error');}finally{setWorking(false);}
  };
  el('announcementForm').onsubmit=event=>{
    event.preventDefault();const id=editing;
    const input={kind:el('announcementKind').value,message:el('announcementMessage').value,url:el('announcementUrl').value,sort_order:Number(el('announcementOrder').value),active:el('announcementActive').checked};
    mutate(async()=>{await api('announcements'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify(input)});resetForm();},id?'Publicação atualizada.':'Publicação criada.');
  };
  el('cancelEditButton').onclick=resetForm;
  el('announcementKind').onchange=syncForm;el('announcementMessage').oninput=syncForm;
  el('reloadButton').onclick=async()=>{if(working)return;setWorking(true);try{await reload();status('Lista atualizada.');}catch(error){status(error.message,'error');}finally{setWorking(false);}};
  syncForm();
  setInterval(loadStats,30000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')loadStats();});
  (async()=>{try{const data=await api('session');showEditor(data.user);await reload();status('Acesso autorizado.');}catch(error){if(el('editorPanel').hidden){showLogin();status('Entre com seu e-mail e senha.');}else status(error.message,'error');}})();
})();
