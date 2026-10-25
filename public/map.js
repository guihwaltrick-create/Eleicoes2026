(() => {
  const el = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const colors = {lula:'#df263b',flavio:'#0875dc',tie:'#768397',missing:'#414b5b'};
  const VIEW_WIDTH=900;
  let mobileLayout=window.matchMedia('(max-width:600px)').matches;
  const VIEW_HEIGHT=900;
  let contextMap=null;
  const contextReady=json('/map-context.geojson').then(data=>{contextMap=data;}).catch(()=>{});
  const nf = new Intl.NumberFormat('pt-BR');
  const percent = n => Number(n || 0).toFixed(2).replace('.',',')+'%';
  const meshes = new Map(), nationalSnapshots = new Map(), exteriorSnapshots = new Map();
  let stateLabels=[];
  const labelsReady=json('/map-state-labels.json').then(data=>{stateLabels=data;});
  let nationalView='states', recordsById=new Map(), listLimit=120, stateGeography=null;
  const stateIds={RO:11,AC:12,AM:13,RR:14,PA:15,AP:16,TO:17,MA:21,PI:22,CE:23,RN:24,PB:25,PE:26,AL:27,SE:28,BA:29,MG:31,ES:32,RJ:33,SP:35,PR:41,SC:42,RS:43,MS:50,MT:51,GO:52,DF:53};
  const exteriorView=()=>uf==='zz';
  const viewHeight=()=>exteriorView()?600:VIEW_HEIGHT;
  const nationalCityView=()=>uf==='br'&&nationalView==='cities';
  const stateView=()=>uf==='br'&&!nationalCityView();
  let turn='2';
  let national, geography, cities, uf = 'br', selectedCity = null, selectedState = null, version = 0, loading = false, zoom = 1, moved = false;
  const pendingUpdates=new Map();
  let refreshSpinStarted=0,refreshSpinTimer;
  function syncRefreshIndicator(){
    const busy=loading||[...pendingUpdates.values()].includes(turn);
    clearTimeout(refreshSpinTimer);
    const refreshButton=el('mapDetailRefresh');
    if(busy){
      if(!refreshButton.classList.contains('is-updating'))refreshSpinStarted=performance.now();
      refreshButton.classList.add('is-updating');
    }else if(refreshButton.classList.contains('is-updating')){
      // Uma resposta rápida também precisa renderizar um ciclo de feedback.
      const remaining=Math.max(0,900-(performance.now()-refreshSpinStarted));
      refreshSpinTimer=setTimeout(()=>refreshButton.classList.remove('is-updating'),remaining);
    }
    for(const id of ['mapDetailRefresh','mapRefresh']){
      const button=el(id);
      button.setAttribute('aria-busy',String(busy));
      button.disabled=busy;
    }
    const label=busy?'Atualizando os resultados…':'Atualizar os resultados deste local';
    el('mapDetailRefresh').title=label;
    el('mapDetailRefresh').setAttribute('aria-label',label);
  }
  function setLoading(value){loading=value;syncRefreshIndicator();}
  function beginUpdate(requestedTurn){
    const request=Symbol();pendingUpdates.set(request,String(requestedTurn));syncRefreshIndicator();
    return ()=>{pendingUpdates.delete(request);syncRefreshIndicator();};
  }
  const leader = row => !row || row.indisponivel ? 'missing' : row.lula.votos > row.flavio.votos ? 'lula' : row.flavio.votos > row.lula.votos ? 'flavio' : 'tie';
  function regionColor(row){
    const ahead=leader(row);
    if(ahead==='missing'||ahead==='tie')return colors[ahead];
    const share=Math.max(0,Math.min(100,Number(row[ahead].percentual)||0));
    // Mais contraste nas faixas em que os resultados costumam se concentrar.
    const stops=ahead==='flavio'
      ? [[0,[235,246,255]],[40,[198,226,255]],[50,[135,193,250]],[60,[36,143,238]],[70,[0,83,184]],[80,[0,43,112]],[100,[0,16,48]]]
      : [[0,[255,240,242]],[40,[255,208,215]],[50,[255,151,166]],[60,[244,64,88]],[70,[187,0,35]],[80,[116,0,24]],[100,[48,0,12]]];
    const end=stops.findIndex(stop=>stop[0]>=share);
    const [low,light]=stops[Math.max(0,end-1)], [high,strong]=stops[end];
    const weight=high===low?0:(share-low)/(high-low);
    return '#'+light.map((value,index)=>Math.round(value+(strong[index]-value)*weight).toString(16).padStart(2,'0')).join('');
  }
  const lookup = () => new Map((stateView() ? national?.estados || [] : cities?.municipios || []).map(r => [stateView() ? r.uf : r.ibge,r]));
  async function json(url) {
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os dados');
    return data;
  }
  function mesh(region) {
    if(region==='zz'){if(!meshes.has(region))meshes.set(region,json('/world-countries.geojson').catch(error=>{meshes.delete(region);throw error;}));return meshes.get(region);}
    if (!meshes.has(region)) meshes.set(region,(region==='br-cities'?json('/br-cidades.geojson').then(data=>({...data,fonte:'IBGE · acervo Geodata BR (CC0), malha simplificada',features:data.features.filter(f=>f.geometry).map(f=>({...f,properties:{id:String(f.properties.id),nome:f.properties.name,uf:stateLabels.find(s=>String(f.properties.id).startsWith(String(stateIds[s.uf])))?.uf}}))})):json('/api/mapa?uf='+region)).catch(e => {meshes.delete(region);throw e;}));
    return meshes.get(region);
  }
  let projectionExpanded=false;
  function syncProjectionVisibility(){
    const button=el('mapProjectionToggle');
    button.setAttribute('aria-expanded',String(projectionExpanded));
    button.querySelector('span').textContent=projectionExpanded?'Ocultar projeção':'Ver projeção';
    el('mapCards').querySelectorAll('.map-candidate-projection').forEach(node=>{node.hidden=!projectionExpanded;});
  }
  function cardProjection(row){
    if(!row||row.indisponivel||row.parcial||!(row.validos>0))return null;
    if(uf==='br'&&!selectedCity&&!selectedState){
      const projection=national&&projectResults(national);
      return projection?{lula:projection.lula,flavio:projection.flavio,total:projection.total,partial:projection.incomplete}:null;
    }
    const fraction=row.secoesTotal>0?row.secoesTotalizadas/row.secoesTotal:0;
    if(!(fraction>0&&fraction<=1))return null;
    return {lula:row.lula.votos/fraction,flavio:row.flavio.votos/fraction,total:row.validos/fraction,partial:false};
  }
  function ranking(row, label) {
    el('mapLocation').textContent = label;
    el('mapCards').replaceChildren();
    el('mapProjectionToggle').hidden=true;
    el('mapOthers').textContent='';
    if (!row || row.indisponivel) {
      el('mapDetail').textContent = 'Resultados indisponíveis para este local.';
      return;
    }
    const projection=cardProjection(row);
    const items = [
      {name:'Lula',key:'lula',votes:row.lula.votos,pct:row.lula.percentual,photo:'/lula-sem-fundo.png',party:'PT'},
      {name:'Flávio Bolsonaro',key:'flavio',votes:row.flavio.votos,pct:row.flavio.percentual,photo:'/flavio-tse.jpg',party:'PL'},
      {name:'Demais candidatos',key:'others',votes:Math.max(0,row.validos-row.lula.votos-row.flavio.votos),pct:row.validos ? Math.max(0,row.validos-row.lula.votos-row.flavio.votos)/row.validos*100 : 0}
    ].sort((a,b) => b.votes-a.votes);
    const others=items.find(item=>item.key==='others');
    el('mapOthers').textContent=turn==='1'?'Demais candidatos · '+percent(others.pct)+' · '+nf.format(others.votes)+' votos':'';
    for (const item of items.filter(item=>item.key!=='others')) {
      const card = document.createElement('div'); card.className = 'map-candidate '+item.key;
      if (item.photo) {const photo = document.createElement('img');photo.src=item.photo;photo.alt=item.name;photo.className='map-candidate-photo';card.append(photo);}
      for (const [tag,cls,text] of [['div','map-candidate-name',item.name],['div','map-candidate-party',item.party],['b','map-candidate-percent',percent(item.pct)],['div','map-candidate-votes',nf.format(item.votes)+' votos']]) {
        const node = document.createElement(tag);node.className=cls;node.textContent=text;card.append(node);
      }
      const estimate=document.createElement('div');estimate.className='map-candidate-projection';estimate.id='mapProjection-'+item.key;estimate.hidden=!projectionExpanded;
      if(projection){
        const label=document.createElement('span');label.textContent=projection.partial?'Projeção parcial':'Projeção';
        const value=document.createElement('strong');value.textContent=percent(projection[item.key]/projection.total*100);
        const votes=document.createElement('small');votes.textContent='≈ '+nf.format(Math.round(projection[item.key]))+' votos';
        estimate.append(label,value,votes);
        estimate.title='Estimativa matemática com a distribuição atual dos votos por seção apurada; não é previsão de vencedor.'+(uf==='br'&&!selectedCity&&!selectedState?' Considera o avanço da apuração de cada estado.':' Neste local, o percentual é mantido e o total de votos é extrapolado.');
      }else{
        estimate.textContent='Projeção indisponível';
        estimate.title='Aguardando votos válidos e seções apuradas para calcular a estimativa.';
      }
      card.append(estimate);
      const progress=document.createElement('div');progress.className='map-candidate-progress';const fill=document.createElement('i');fill.style.width=Math.min(100,item.pct)+'%';progress.append(fill);card.append(progress);
      el('mapCards').append(card);
    }
    el('mapProjectionToggle').hidden=false;
    syncProjectionVisibility();
    el('mapDetail').textContent = (row.desatualizado?'Atualização pendente · ':row.parcial?'Parcial · '+row.locaisRecebidos+'/'+row.locaisTotal+' localidades · ':'')+percent(row.secoesPct)+' das seções totalizadas · '+nf.format(row.validos)+' votos válidos'+(row.atualizadoEm ? ' · Arquivo: '+row.atualizadoEm : '');
  }
  let popupTimer, popupAnchor;
  function hidePopup(){clearTimeout(popupTimer);el('mapTooltip').hidden=true;}
  function scheduleHidePopup(){clearTimeout(popupTimer);popupTimer=setTimeout(hidePopup,140);}
  function popupNode(tag,className,text){const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function positionPopup(x,y){
    const popup=el('mapTooltip');if(popup.hidden)return;popupAnchor={x,y};
    const rect=popup.getBoundingClientRect(),gap=16,pad=12;
    const left=x+gap+rect.width>window.innerWidth-pad?x-rect.width-gap:x+gap;
    const top=y+gap+rect.height>window.innerHeight-pad?y-rect.height-gap:y+gap;
    popup.style.left=Math.max(pad,Math.min(left,window.innerWidth-rect.width-pad))+'px';
    popup.style.top=Math.max(pad,Math.min(top,window.innerHeight-rect.height-pad))+'px';
  }
  function showPopup(row,name,id,event){
    if(drag||el('mapaScreen').hidden)return;
    clearTimeout(popupTimer);
    const popup=el('mapTooltip');popup.replaceChildren();
    const heading=popupNode('div','map-popup-heading');
    heading.append(popupNode('span','map-popup-badge',stateView()?id:(row?.uf||featureState(id)||uf.toUpperCase())));
    const location=popupNode('div','map-popup-location');location.append(popupNode('strong','',name));
    location.append(popupNode('span','',row&&!row.indisponivel?percent(row.secoesPct)+' das seções totalizadas'+(row.desatualizado?' · Atualização pendente':row.parcial?' · Parcial de '+row.locaisRecebidos+'/'+row.locaisTotal+' localidades':''):'Resultados indisponíveis'));
    heading.append(location);
    const close=popupNode('button','map-popup-close','×');close.type='button';close.setAttribute('aria-label','Fechar resultados');close.onclick=hidePopup;heading.append(close);popup.append(heading);
    if(row&&!row.indisponivel){
      const candidates=[{key:'flavio',name:'Flávio Bolsonaro',party:'PL · 22',photo:'/flavio-tse.jpg',...row.flavio},{key:'lula',name:'Lula',party:'PT · 13',photo:'/lula-sem-fundo.png',...row.lula}].sort((a,b)=>b.votos-a.votos);
      for(const item of candidates){
        const line=popupNode('div','map-popup-candidate '+item.key);
        const img=popupNode('img','');img.src=item.photo;img.alt='';line.append(img);
        const info=popupNode('div','map-popup-candidate-info');info.append(popupNode('strong','',item.name),popupNode('span','',item.party),popupNode('small','',nf.format(item.votos)+' votos'));line.append(info,popupNode('b','',percent(item.percentual)));popup.append(line);
      }
      const others=Math.max(0,row.validos-row.lula.votos-row.flavio.votos);
      popup.append(popupNode('div','map-popup-validos','Total de votos válidos: '+nf.format(row.validos)));
      if(turn==='1')popup.append(popupNode('div','map-popup-others','Demais candidatos · '+percent(row.validos?others/row.validos*100:0)+' · '+nf.format(others)+' votos'));
      const margin=Math.abs(row.lula.percentual-row.flavio.percentual);
      const ahead=leader(row);
      popup.append(popupNode('div','map-popup-margin '+ahead,ahead==='tie'?'Empate entre Lula e Flávio':(ahead==='lula'?'Lula':'Flávio')+' à frente por '+margin.toFixed(2).replace('.',',')+' p.p.'));
      if(row.atualizadoEm)popup.append(popupNode('div','map-popup-timestamp','Arquivo TSE · '+row.atualizadoEm));
    }
    if(stateView()){
      const button=popupNode('button','map-popup-action','Ver municípios →');button.type='button';button.onclick=()=>{el('mapState').value=id.toLowerCase();select();};popup.append(button);
    }
    popup.hidden=false;positionPopup(event.clientX,event.clientY);
  }
  el('mapTooltip').addEventListener('pointerenter',()=>clearTimeout(popupTimer));
  el('mapTooltip').addEventListener('pointerleave',event=>{if(event.pointerType!=='touch')scheduleHidePopup();});
  el('mapTooltip').addEventListener('focusin',()=>clearTimeout(popupTimer));
  el('mapTooltip').addEventListener('focusout',event=>{if(!el('mapTooltip').contains(event.relatedTarget))scheduleHidePopup();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hidePopup();});
  document.addEventListener('pointerdown',event=>{if(!el('mapTooltip').contains(event.target)&&!el('electionMap').contains(event.target))hidePopup();});
  document.addEventListener('touchmove',hidePopup,{passive:true});
  window.addEventListener('resize',()=>{const mobile=window.matchMedia('(max-width:600px)').matches;if(mobile!==mobileLayout){hidePopup();mobileLayout=mobile;if(geography){draw();detail();}}else if(popupAnchor)positionPopup(Math.min(popupAnchor.x,innerWidth),Math.min(popupAnchor.y,innerHeight));});
  let lastTouchAt=-Infinity;
  el('mapaScreen').addEventListener('touchstart',()=>{lastTouchAt=Date.now();},{passive:true});
  function touchActivation(event){
    return mobileLayout||event?.pointerType==='touch'||event?.pointerType==='pen'||event?.sourceCapabilities?.firesTouchEvents||Date.now()-lastTouchAt<1000||window.matchMedia('(pointer:coarse)').matches;
  }
  function activateState(id,event){
    if(!touchActivation(event)){el('mapState').value=id.toLowerCase();select();return;}
    selectedState=selectedState===id?null:id;
    hidePopup();detail();
    if(!selectedState)return;
    const feature=stateGeography?.features.find(feature=>feature.properties.uf===id);
    const rect=event?.currentTarget?.getBoundingClientRect();
    showPopup(recordsById.get(id),feature?.properties.nome||id,id,{
      clientX:event?.clientX||rect?.x||innerWidth/2,
      clientY:event?.clientY||rect?.y||innerHeight/2
    });
  }
  function togglePlace(id){
    selectedCity=selectedCity===id?null:id;
    hidePopup();
    detail();
  }
  function detail() {
    const summaryLabel=exteriorView()?'Voltar ao resumo do exterior':uf==='br'?'Voltar ao resumo do Brasil':'Voltar ao resumo do estado';
    el('mapClearCity').hidden=!selectedCity&&!selectedState;
    el('mapClearCity').title=summaryLabel;
    el('mapClearCity').setAttribute('aria-label',summaryLabel);
    el('mapPlaces').querySelectorAll('button').forEach(button=>{const selected=button.dataset.id===(stateView()?selectedState:selectedCity);button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected));});
    const svg=el('electionMap');
    const activeId=stateView()?selectedState:selectedCity;
    svg.classList.toggle('has-selection',Boolean(activeId));
    svg.querySelectorAll('path[data-id]').forEach(path=>{
      const selected=path.dataset.id===activeId;
      path.classList.toggle('is-selected',selected);
      if(path.getAttribute('role')==='button')path.setAttribute('aria-pressed',String(selected));
    });
    svg.querySelectorAll('text[data-state]').forEach(label=>label.classList.toggle('is-selected',Boolean(activeId)&&label.dataset.state===(stateView()?selectedState:featureState(selectedCity))));
    const row = stateView()&&selectedState?national?.estados.find(row=>row.uf===selectedState):selectedCity ? cities?.municipios.find(c => c.ibge === selectedCity) : exteriorView()?cities?.resumo:uf === 'br' ? national?.brasil : national?.estados.find(s => s.uf === uf.toUpperCase());
    ranking(row, stateView()&&selectedState?(stateGeography?.features.find(feature=>feature.properties.uf===selectedState)?.properties.nome||selectedState):exteriorView()?(selectedCity?(row?.nome||'País'):'Exterior'):selectedCity ? (row?.nome || 'Município')+' · '+(row?.uf||uf.toUpperCase()) : uf === 'br' ? 'Brasil' : el('mapState').selectedOptions[0]?.textContent || uf.toUpperCase());
  }
  function draw() {
    if (!geography) return;
    hidePopup();
    const svg = el('electionMap'); svg.replaceChildren(); svg.classList.remove('is-zoomed'); zoom=1;
    const project = ([lon,lat]) => exteriorView()?[lon,-lat]:[lon,-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))*180/Math.PI];
    const polygons = feature => !feature.geometry?[]:feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    geography.features.forEach(f => polygons(f).forEach(poly => poly.forEach(ring => ring.forEach(point => {
      const [x,y]=project(point);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }))));
    const mapHeight=exteriorView()?450:760, mapTop=60;
    const scale=Math.min((uf==='br'?660:790)/(maxX-minX),mapHeight/(maxY-minY));
    const offsetX=(VIEW_WIDTH-(maxX-minX)*scale)*(uf==='br'?.28:.5),offsetY=mapTop+(mapHeight-(maxY-minY)*scale)/2;
    const point = p => {const [x,y]=project(p);return [(x-minX)*scale+offsetX,(y-minY)*scale+offsetY].map(v => v.toFixed(2)).join(',');};
    const shapePath=feature=>polygons(feature).map(poly=>poly.map(ring=>'M'+ring.map(point).join('L')+'Z').join('')).join('');
    if(contextMap&&!exteriorView()){
      const context=document.createElementNS(NS,'g');context.setAttribute('class','map-geographic-context');context.setAttribute('aria-hidden','true');
      for(const feature of contextMap.features){const path=document.createElementNS(NS,'path');path.setAttribute('d',shapePath(feature));context.append(path);}
      svg.append(context);
    }
    recordsById=lookup();
    for (const feature of geography.features) {
      const id=stateView() ? feature.properties.uf : feature.properties.id;
      const row=recordsById.get(id), name=row?.nome || feature.properties.nome;
      const path=document.createElementNS(NS,'path');
      path.dataset.id=id;
      path.setAttribute('d',shapePath(feature));
      if(exteriorView()&&!row){path.setAttribute('fill','#303b4a');path.setAttribute('stroke','#526378');path.setAttribute('stroke-width','.45');path.setAttribute('aria-label',name+': sem localidades eleitorais cadastradas');svg.append(path);continue;}
      path.setAttribute('fill',regionColor(row));path.setAttribute('fill-rule','evenodd');path.setAttribute('stroke','#80a5c6');path.setAttribute('stroke-width',stateView()?'1.2':nationalCityView()?'.25':'.65');path.setAttribute('vector-effect','non-scaling-stroke');
      path.setAttribute('tabindex','0');path.setAttribute('role','button');path.setAttribute('aria-label',name+(row&&!row.indisponivel ? ': Lula '+percent(row.lula.percentual)+', Flávio '+percent(row.flavio.percentual) : ': sem dados'));
      path.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')showPopup(recordsById.get(id),name,id,event);});
      path.addEventListener('pointermove',event=>{if(event.pointerType!=='touch'&&!drag)positionPopup(event.clientX,event.clientY);});
      path.addEventListener('pointerleave',event=>{if(event.pointerType!=='touch')scheduleHidePopup();});
      path.addEventListener('focus',()=>{const rect=path.getBoundingClientRect();showPopup(recordsById.get(id),name,id,{clientX:rect.x+rect.width/2,clientY:rect.y+rect.height/2});});
      path.addEventListener('blur',scheduleHidePopup);
      const choose=event=>{
        if(stateView()){activateState(id,event);return;}
        togglePlace(id);
        if(selectedCity&&touchActivation(event)){
          const rect=path.getBoundingClientRect();
          showPopup(recordsById.get(id),name,id,{clientX:event.clientX||rect.x+rect.width/2,clientY:event.clientY||rect.y+rect.height/2});
        }
      };
      path.addEventListener('click',event=>{if(!moved)choose(event);});
      path.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(event);}});
      svg.append(path);
    }
    if(nationalCityView()&&stateGeography){const outlines=document.createElementNS(NS,'g');outlines.setAttribute('class','map-state-outlines');outlines.setAttribute('aria-hidden','true');for(const feature of stateGeography.features){const path=document.createElementNS(NS,'path');path.setAttribute('d',shapePath(feature));outlines.append(path);}svg.append(outlines);}
    if(uf==='br'){
      const labels=document.createElementNS(NS,'g');labels.setAttribute('class','map-labels map-state-labels');labels.setAttribute('aria-hidden','true');
      const callouts={RN:[742,215],PB:[742,251],PE:[742,287],AL:[742,323],SE:[742,359],ES:[725,552],RJ:[725,610]};
      for(const state of stateLabels){
        const [x,y]=point(state.coordinates).split(',').map(Number), target=callouts[state.uf];
        const text=document.createElementNS(NS,'text');text.dataset.state=state.uf;text.dataset.name=state.nome;if(target)text.setAttribute('class','map-callout-label');text.setAttribute('text-anchor',target?'start':'middle');
        let tx=x,ty=y;
        if(target){
          [tx,ty]=target;const line=document.createElementNS(NS,'path');line.setAttribute('d',`M${x},${y}L${tx-10},${ty-4}`);line.setAttribute('class','map-label-line');labels.append(line);
        }
        if(state.uf==='DF'){tx=x+28;ty=y-28;const line=document.createElementNS(NS,'path');line.setAttribute('d',`M${x},${y}L${tx},${ty+10}`);line.setAttribute('class','map-label-line');labels.append(line);}
        text.setAttribute('x',tx);text.setAttribute('y',ty);
        const names=state.nome.length>12&&!target?state.nome.replace('Rio Grande do ','Rio Grande|do ').replace('Mato Grosso do ','Mato Grosso|do ').replace('Distrito Federal','Distrito|Federal').replace('Santa Catarina','Santa|Catarina').split('|'):[state.nome];
        names.forEach((name,i)=>{const span=document.createElementNS(NS,'tspan');span.setAttribute('x',tx);span.setAttribute('dy',i?'1.1em':'0');span.textContent=name;text.append(span);});
        labels.append(text);
      }
      svg.append(labels);
    }
    svg.setAttribute('viewBox',`0 0 ${VIEW_WIDTH} ${viewHeight()}`);
    el('mapSource').textContent='Limites: '+geography.fonte+'.';
  }
  function list() {
    const records=lookup(), query=el('mapSearch').value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    el('mapPlaces').replaceChildren();
    el('mapListTitle').textContent=exteriorView()?'Países · Exterior':stateView()?'Resumo dos estados':nationalCityView()?'Cidades · Brasil':'Cidades · '+uf.toUpperCase();
    el('mapSearch').placeholder=exteriorView()?'Buscar país…':stateView()?'Buscar estado…':'Buscar cidade…';
    el('mapSearch').previousElementSibling.textContent=exteriorView()?'Buscar país':stateView()?'Buscar estado':'Buscar cidade';
    const places=(stateView() ? geography?.features.map(f=>({id:f.properties.uf,nome:f.properties.nome,row:records.get(f.properties.uf)})) : cities?.municipios.map(row=>({id:row.ibge,nome:row.nome+(nationalCityView()?' · '+row.uf:''),row}))) || [];
    const filtered=places.filter(p=>p.nome.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query)).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
    el('mapListCount').textContent=loading&&!geography?'…':filtered.length+'/'+places.length;
    const lula=places.filter(p=>leader(p.row)==='lula').length,flavio=places.filter(p=>leader(p.row)==='flavio').length;
    const neutral=places.length-lula-flavio;
    el('mapListSummary').textContent=loading&&!geography?'Carregando resultados…':'Flávio lidera em '+flavio+' · Lula em '+lula+(neutral?' · Empate/indisponível: '+neutral:'');
    for (const place of (nationalCityView()?filtered.slice(0,listLimit):filtered)) {
      const button=document.createElement('button');button.type='button';button.className='map-place';button.dataset.id=place.id;
      const selected=place.id===(stateView()?selectedState:selectedCity);button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected));
      const dot=document.createElement('i');dot.style.background=regionColor(place.row);button.append(dot);
      const name=document.createElement('span');name.textContent=place.nome;name.className='map-place-name';button.append(name);
      if(place.row&&!place.row.indisponivel){
        const candidates=[{label:'Flávio',key:'flavio',...place.row.flavio},{label:'Lula',key:'lula',...place.row.lula}].sort((a,b)=>b.votos-a.votos);
        const values=document.createElement('div');values.className='map-place-results';
        for(const candidate of candidates){const value=document.createElement('span');value.className=candidate.key;value.textContent=candidate.label+' '+percent(candidate.percentual);values.append(value);}
        button.append(values);
        const progress=document.createElement('small');progress.textContent=percent(place.row.secoesPct)+' apurado · '+nf.format(place.row.validos)+' votos válidos'+(place.row.desatualizado?' · Atualização pendente':place.row.parcial?' · Parcial: '+place.row.locaisRecebidos+'/'+place.row.locaisTotal+' localidades':'');button.append(progress);
      }else{const unavailable=document.createElement('small');unavailable.textContent='Resultados indisponíveis';button.append(unavailable);}
      button.onclick=event=>{if(stateView())activateState(place.id,event);else togglePlace(place.id);};
      el('mapPlaces').append(button);
    }
    if(nationalCityView()&&filtered.length>listLimit){const more=document.createElement('button');more.type='button';more.className='map-load-more';more.textContent='Mostrar mais cidades ('+Math.min(listLimit,filtered.length)+' de '+filtered.length+')';more.onclick=()=>{listLimit+=120;list();};el('mapPlaces').append(more);}
    if(!el('mapPlaces').children.length)el('mapPlaces').textContent=loading?'Carregando locais…':'Nenhum local encontrado.';
  }
  async function municipalResults(region, token) {
    const requestedTurn=turn;
    const first = await electionResults.get('/api/municipios?uf='+region+'&pagina=0',requestedTurn);
    const all = {...first, municipios:[...first.municipios], errors:[...first.errors]};
    for (let page=1; page<first.paginas; page++) {
      if(token!==version)return all;
      el('mapStatus').textContent='Carregando municípios: '+all.municipios.length+'/'+first.total+'…';
      const batch=await electionResults.get('/api/municipios?uf='+region+'&pagina='+page,requestedTurn);
      all.municipios.push(...batch.municipios);all.errors.push(...batch.errors);
    }
    return all;
  }
  function featureState(id){return Object.keys(stateIds).find(key=>String(id).startsWith(String(stateIds[key])));}
  function syncViewButtons(){
    el('mapState').querySelector('option[value="br"]').textContent=nationalView==='cities'?'Brasil · cidades':'Brasil · estados';
    el('mapExteriorLegend').hidden=!exteriorView();
    el('mapExteriorInfo').hidden=!exteriorView();
    el('mapInstructions').hidden=exteriorView();
    el('mapViewExterior').setAttribute('aria-pressed',String(exteriorView()));
    el('electionMap').classList.toggle('is-world-map',exteriorView());
    el('mapViewStates').setAttribute('aria-pressed',String(stateView()));
    el('mapViewCities').setAttribute('aria-pressed',String(nationalCityView()));
  }
  function paint(){
    recordsById=lookup();
    for(const path of el('electionMap').querySelectorAll('path[data-id]')){
      const row=recordsById.get(path.dataset.id), fill=exteriorView()&&!row?'#303b4a':regionColor(row);
      if(path.getAttribute('fill')!==fill)path.setAttribute('fill',fill);
      if(row)path.setAttribute('aria-label',row.nome+' · '+row.uf+(row.indisponivel?': dados indisponíveis':': Lula '+percent(row.lula.percentual)+', Flávio '+percent(row.flavio.percentual)));
    }
  }
  async function loadNationalCities(token){
    const requestedTurn=turn;
    let saved=nationalSnapshots.get(requestedTurn);
    if(!saved){
      const catalog=await electionResults.get('/api/municipios/catalogo',requestedTurn);
      if(token!==version)return;
      saved={at:0,complete:false,catalog,done:new Set(),errors:[],municipios:catalog.estados.flatMap(state=>state.municipios.map(city=>({...city,uf:state.uf.toUpperCase(),indisponivel:true,pendente:true})))};
      nationalSnapshots.set(requestedTurn,saved);
    }
    const shape=await mesh('br-cities');
    if(token!==version)return;
    const sameGeometry=geography===shape;geography=shape;cities=saved;if(sameGeometry)paint();else draw();list();detail();
    if(saved.complete&&(requestedTurn==='1'||Date.now()-saved.at<60000)){status();return;}
    if(saved.complete){saved.done.clear();saved.complete=false;}
    const rows=new Map(saved.municipios.map(city=>[city.ibge,city]));
    const tasks=saved.catalog.estados.flatMap(state=>Array.from({length:Math.ceil(state.municipios.length/100)},(_,page)=>({uf:state.uf,page,key:state.uf+':'+page})));
    const failed=[];
    for(const task of tasks){
      if(token!==version)return;
      if(saved.done.has(task.key))continue;
      try{
        const batch=await electionResults.get('/api/municipios?uf='+task.uf+'&pagina='+task.page+'&nacional=1',requestedTurn);
        // Guarda o lote para retomada, mesmo se o usuário tiver trocado de visão durante a consulta.
        for(const city of batch.municipios)rows.set(city.ibge,city);
        saved.municipios=[...rows.values()];
        if(!batch.errors.length)saved.done.add(task.key);else failed.push(...batch.errors);
      }catch(e){failed.push(task.uf.toUpperCase()+': '+e.message);}
      saved.errors=failed;
      if(token!==version)return;
      cities=saved;paint();list();detail();
      const processed=saved.municipios.filter(city=>!city.pendente).length;
      el('mapStatus').textContent='Brasil · Cidades: '+processed+'/'+saved.catalog.total+' consultadas. Carregamento progressivo; cores mostram apenas os dados já recebidos.'+(failed.length?' Há consultas indisponíveis.':'');
      // Permite que o navegador pinte o lote antes de buscar o próximo.
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(token!==version)return;
    saved.complete=saved.done.size===tasks.length;saved.at=Date.now();saved.errors=failed;
    status();
  }
  async function loadExterior(token,force=false){
    const requestedTurn=turn;
    let saved=exteriorSnapshots.get(requestedTurn);
    if(!saved){saved={catalog:[],rows:new Map(),municipios:[],resumo:null,errors:[],done:new Set(),pageIds:new Map(),paginas:1,total:0,complete:false,at:0};exteriorSnapshots.set(requestedTurn,saved);}
    const shape=await mesh('zz');
    if(token!==version)return;
    let rendered=geography===shape;
    geography=shape;cities=saved;
    if(saved.catalog.length){if(rendered)paint();else draw();rendered=true;list();detail();}
    if(saved.complete&&(requestedTurn==='1'||(!force&&Date.now()-saved.at<30000))){status();return;}
    if(saved.complete){saved.done.clear();saved.complete=false;}
    const errors=[];
    for(let page=0;page<saved.paginas;page++){
      if(token!==version)return;
      if(saved.done.has(page))continue;
      try{
        const batch=await electionResults.get('/api/exterior?pagina='+page,requestedTurn);
        saved.catalog=batch.paises;saved.resumo=batch.resumo;saved.paginas=batch.paginas;saved.total=batch.total;
        saved.pageIds.set(page,batch.localidades.map(row=>row.codigo));
        for(const row of batch.localidades){
          const previous=saved.rows.get(row.codigo);
          saved.rows.set(row.codigo,row.indisponivel&&previous&&!previous.indisponivel?{...previous,desatualizado:true}:row);
        }
        errors.push(...batch.errors);
        if(!batch.errors.length)saved.done.add(page);
        saved.municipios=aggregateCountryResults(saved.catalog,[...saved.rows.values()]);
      }catch(error){
        errors.push('Lote '+(page+1)+': '+error.message);
        for(const id of saved.pageIds.get(page)||[]){const old=saved.rows.get(id);if(old&&!old.indisponivel)saved.rows.set(id,{...old,desatualizado:true});}
        saved.municipios=aggregateCountryResults(saved.catalog,[...saved.rows.values()]);
      }
      saved.errors=errors;
      if(token!==version)return;
      cities=saved;
      if(saved.catalog.length){if(rendered)paint();else draw();rendered=true;list();detail();}
      el('mapStatus').textContent='Exterior · '+saved.rows.size+'/'+saved.total+' localidades consultadas. Países são atualizados por soma de votos; consultas incompletas aparecem como parciais.';
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(token!==version)return;
    saved.complete=saved.catalog.length>0&&saved.done.size===saved.paginas;saved.at=Date.now();saved.errors=errors;
    if(!saved.catalog.length)throw new Error('Resultados do exterior indisponíveis');
    status();
  }
  async function refreshExterior(force=false){
    if(loading)return;
    const token=version;setLoading(true);
    try{await loadExterior(token,force);}catch(error){if(token===version)el('mapStatus').textContent='Falha ao atualizar o exterior; mantendo os dados recebidos. '+error.message;}
    finally{if(token===version)setLoading(false);}
  }
  async function select() {
    uf=el('mapState').value;const region=uf, token=++version;
    el('mapDetailBack').hidden=region==='br';
    syncViewButtons();listLimit=120;
    hidePopup();selectedCity=null;selectedState=null;el('electionMap').classList.remove('has-selection');el('mapClearCity').hidden=true;cities=null;geography=null;setLoading(true);
    el('mapSearch').value='';el('mapPlaces').replaceChildren();el('electionMap').replaceChildren();el('mapCards').replaceChildren();el('mapProjectionToggle').hidden=true;
    el('mapLocation').textContent=region==='br'?'Brasil':el('mapState').selectedOptions[0].textContent;
    el('mapDetail').textContent='';el('mapOthers').textContent='';el('mapSource').textContent='';list();
    el('mapStatus').textContent=exteriorView()?'Carregando mapa e votação no exterior…':nationalCityView()?'Carregando Brasil · Cidades…':region==='br'?'Carregando mapa dos estados…':'Carregando limites e resultados dos municípios. Estados com muitas cidades podem levar cerca de um minuto…';
    el('mapStatus').setAttribute('aria-busy','true');
    try {
      if(exteriorView()){await loadExterior(token);return;}
      if(nationalCityView()){await loadNationalCities(token);return;}
      const [shape,results]=await Promise.all([mesh(region), region==='br'?null:municipalResults(region,token)]);
      if(token!==version)return;
      geography=shape;cities=results;draw();list();detail();status();
    } catch(e) {if(token===version)el('mapStatus').textContent='Falha ao carregar: '+e.message+'. Use Atualizar mapa para tentar novamente.';}
    finally {if(token===version){setLoading(false);el('mapStatus').setAttribute('aria-busy','false');}}
  }
  function status() {
    if(exteriorView()){const rows=cities?.municipios||[],available=rows.filter(r=>!r.indisponivel).length,partial=rows.filter(r=>r.parcial).length;el('mapStatus').textContent='Exterior · '+available+'/'+rows.length+' países com dados recebidos'+(partial?' · '+partial+' com consulta parcial':'')+(cities?.errors?.length?' · Há consultas indisponíveis.':'')+'. Votos de brasileiros no exterior; passe o mouse ou toque em um país.';return;}
    const rows=stateView()?national?.estados||[]:cities?.municipios||[];
    const available=rows.filter(r=>!r.indisponivel).length;
    const geometryIds=new Set(geography.features.map(f=>f.properties.id));
    const unmapped=stateView()?0:rows.filter(r=>!geometryIds.has(r.ibge)).length;
    el('mapStatus').textContent=stateView()?available+'/27 estados com resultados. Selecione um estado para ver suas cidades.':available+'/'+rows.length+' municípios com resultados'+(cities.errors.length?' · '+cities.errors.length+' indisponíveis':'')+(unmapped?' · '+unmapped+' sem limites no acervo; consulte a lista':'')+'. Passe o mouse ou toque em uma cidade para ver a classificação.';
  }
  let initialized=false;
  async function open() {
    if(initialized){if(!loading&&geography){if(stateView()){draw();list();detail();status();}else if(exteriorView())refreshExterior();else if(nationalCityView())refreshNationalCities();else refreshCities();}return;}initialized=true;
    try {
      const [shape]=await Promise.all([mesh('br'),contextReady,labelsReady]);stateGeography=shape;
      for(const f of [...shape.features].sort((a,b)=>a.properties.nome.localeCompare(b.properties.nome,'pt-BR'))) {
        const option=document.createElement('option');option.value=f.properties.uf.toLowerCase();option.textContent=f.properties.nome+' · '+f.properties.uf;el('mapState').append(option);
      }
      await select();
    }catch(e){initialized=false;el('mapStatus').textContent='Falha ao carregar os estados: '+e.message;}
  }
  const fullscreenScreen=el('mapaScreen'), fullscreenButton=el('mapFullscreen');
  let nativeFullscreen=false, fullscreenFocus=null;
  const fullscreenLegend=el('mapFullscreenLegend');
  const fullscreenFooterNodes=[...fullscreenScreen.querySelectorAll('.map-legend,.map-intensity-legend,#mapStatus')].map(node=>{
    const anchor=document.createComment('Posição original da legenda');
    node.before(anchor);
    return {node,anchor};
  });
  function setFullscreen(active){
    if(active)fullscreenFocus=document.activeElement;
    hidePopup();
    fullscreenScreen.classList.toggle('is-fullscreen',active);
    document.body.classList.toggle('map-fullscreen-open',active);
    fullscreenButton.setAttribute('aria-pressed',String(active));
    fullscreenButton.setAttribute('aria-label',active?'Sair da tela cheia':'Abrir mapa em tela cheia');
    fullscreenButton.title=active?'Sair da tela cheia (Esc)':'Abrir mapa em tela cheia';
    fullscreenButton.querySelector('path').setAttribute('d',active?'M3 8h5V3M21 8h-5V3M8 21v-5H3M16 21v-5h5':'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5');
    fullscreenLegend.hidden=!active;
    for(const {node,anchor} of fullscreenFooterNodes){
      if(active)fullscreenLegend.append(node);
      else anchor.after(node);
    }
    if(active)fullscreenButton.focus({preventScroll:true});
    else fullscreenFocus?.focus({preventScroll:true});
  }
  async function exitFullscreen(){
    setFullscreen(false);
    if(document.fullscreenElement===fullscreenScreen){
      try{await document.exitFullscreen();}catch{} // A visualização local já foi restaurada.
    }
  }
  fullscreenButton.onclick=async()=>{
    if(fullscreenScreen.classList.contains('is-fullscreen'))return exitFullscreen();
    setFullscreen(true);
    // Mantém a visão expandida mesmo em celulares sem a API de tela cheia.
    try{await fullscreenScreen.requestFullscreen?.();}catch{}
  };
  document.addEventListener('fullscreenchange',()=>{
    const active=document.fullscreenElement===fullscreenScreen;
    if(nativeFullscreen&&!active)setFullscreen(false);
    nativeFullscreen=active;
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&fullscreenScreen.classList.contains('is-fullscreen'))exitFullscreen();
  });
  window.addEventListener('hashchange',()=>{
    if(location.hash!=='#mapa'&&fullscreenScreen.classList.contains('is-fullscreen'))exitFullscreen();
  });
  el('mapViewExterior').onclick=()=>{el('mapState').value='zz';select();};
  el('mapViewStates').onclick=()=>{nationalView='states';el('mapState').value='br';select();};
  el('mapViewCities').onclick=()=>{nationalView='cities';el('mapState').value='br';select();};
  el('mapState').onchange=select;el('mapSearch').oninput=()=>{listLimit=120;list();};
  el('mapRefresh').onclick=()=>initialized?(exteriorView()?refreshExterior(true):stateView()?window.load():select()):open();
  el('mapBack').onclick=()=>{el('mapState').value='br';select();};
  el('mapDetailRefresh').onclick=()=>el('mapRefresh').click();
  el('mapDetailBack').onclick=()=>el('mapBack').click();
  el('mapProjectionToggle').onclick=()=>{projectionExpanded=!projectionExpanded;syncProjectionVisibility();};
  el('mapClearCity').onclick=()=>{selectedCity=null;selectedState=null;hidePopup();detail();};
  el('mapZoomIn').onclick=()=>setZoom(zoom*1.4);
  el('mapZoomOut').onclick=()=>setZoom(zoom/1.4);
  el('mapZoomReset').onclick=()=>setZoom(1);
  function setZoom(value){hidePopup();zoom=Math.max(1,Math.min(8,value));el('electionMap').classList.toggle('is-zoomed',zoom>1);const w=VIEW_WIDTH/zoom,h=viewHeight()/zoom;el('electionMap').setAttribute('viewBox',`${(VIEW_WIDTH-w)/2} ${(viewHeight()-h)/2} ${w} ${h}`);}
  // Arrastar o mapa permite explorar os municípios após ampliar.
  let drag;
  el('electionMap').addEventListener('pointerdown',e=>{moved=false;if(zoom>1)drag={x:e.clientX,y:e.clientY,box:el('electionMap').viewBox.baseVal.x,top:el('electionMap').viewBox.baseVal.y};});
  window.addEventListener('pointermove',e=>{if(!drag)return;hidePopup();if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)>5)moved=true;const svg=el('electionMap'),ratio=svg.viewBox.baseVal.width/svg.getBoundingClientRect().width;svg.setAttribute('viewBox',`${drag.box-(e.clientX-drag.x)*ratio} ${drag.top-(e.clientY-drag.y)*ratio} ${VIEW_WIDTH/zoom} ${viewHeight()/zoom}`);});
  window.addEventListener('pointerup',()=>{drag=null;});
  window.addEventListener('pointercancel',()=>{drag=null;});
  window.electoralMap={open,beginUpdate,setTurn(value){
    turn=String(value);version++;national=null;cities=null;selectedCity=null;selectedState=null;setLoading(false);hidePopup();
    if(geography){draw();list();detail();}
    if(initialized&&!el('mapaScreen').hidden)select();
  },update(data){if(String(data.turno)!==turn)return;national=data;if(!el('mapaScreen').hidden&&initialized&&!loading){if(stateView()){draw();list();detail();if(geography)status();}else if(exteriorView())refreshExterior();else if(nationalCityView())refreshNationalCities();else refreshCities();}}};
  async function refreshNationalCities(){
    if(loading)return;
    const token=version;setLoading(true);
    try{await loadNationalCities(token);}catch(e){if(token===version)el('mapStatus').textContent='Falha na atualização nacional: '+e.message;}
    finally{if(token===version)setLoading(false);}
  }
  async function refreshCities(){const token=version,region=uf;setLoading(true);try{const data=await municipalResults(region,token);if(token!==version)return;cities=data;draw();list();detail();status();}catch(e){if(token===version)el('mapStatus').textContent='Falha na atualização municipal; exibindo a última consulta. '+e.message;}finally{if(token===version)setLoading(false);}}
})();
