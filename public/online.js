(() => {
  const indicators = [...document.querySelectorAll('[data-online-presence]')];
  if (!indicators.length) return;
  let running = false;
  const nf = new Intl.NumberFormat('pt-BR');
  async function heartbeat() {
    if (running || document.visibilityState === 'hidden') return;
    running = true;
    try {
      const response = await fetch('/api/online', {method:'POST', credentials:'same-origin', cache:'no-store', signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error('Presença indisponível');
      const data = await response.json();
      if (!Number.isSafeInteger(data.online) || data.online < 0) throw new Error('Contagem inválida');
      for (const indicator of indicators) {
        indicator.textContent = nf.format(data.online) + ' online';
        indicator.title = 'Visitantes com o site aberto e visível nos últimos 2 minutos. Abas do mesmo navegador contam uma vez.';
        indicator.setAttribute('aria-label', nf.format(data.online) + ' visitantes online nos últimos 2 minutos');
        indicator.classList.add('is-connected');
      }
    } catch {
      for (const indicator of indicators) {
        indicator.textContent = 'Online indisponível';
        indicator.title = 'Não foi possível consultar os visitantes online. Tentaremos novamente em instantes.';
        indicator.removeAttribute('aria-label');
        indicator.classList.remove('is-connected');
      }
    } finally {running = false;}
  }
  document.addEventListener('visibilitychange', () => {if (document.visibilityState === 'visible') heartbeat();});
  window.addEventListener('pageshow', heartbeat);
  setInterval(heartbeat, 30000);
  heartbeat();
})();
