
/**
 * CLIMA SOCIAL · WAR ROOM ANTI-TAMPER SHIELD
 * Acceso Restringido. Inspección y depuración prohibidas.
 */
(function() {
  'use strict';

  // 1. Silenciar todas las salidas de consola
  try {
    const noop = function() {};
    ['log', 'debug', 'info', 'warn', 'error', 'table', 'trace', 'dir', 'dirxml'].forEach(m => {
      window.console[m] = noop;
    });
    setInterval(() => { window.console.clear(); }, 1500);
  } catch(e) {}

  // 2. Bloquear clic derecho (Menú contextual)
  document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, true);

  // 3. Bloquear atajos de teclado para inspeccionar o ver código fuente
  document.addEventListener('keydown', function(e) {
    // F12
    if (e.keyCode === 123) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // Ctrl+Shift+I (Inspector) / Ctrl+Shift+J (Consola) / Ctrl+Shift+C (Element picker)
    if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // Cmd+Option+I / Cmd+Option+J / Cmd+Option+C (Mac)
    if (e.metaKey && e.altKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // Ctrl+U o Cmd+Option+U (Ver código fuente)
    if ((e.ctrlKey && e.keyCode === 85) || (e.metaKey && e.altKey && e.keyCode === 85)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // Ctrl+S o Cmd+S (Guardar página)
    if ((e.ctrlKey || e.metaKey) && e.keyCode === 83) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  // 4. Trampa de depuración continua (Debugger Trap)
  // Si alguien fuerza la apertura de DevTools, el navegador entra en bucle de congelamiento
  setInterval(function() {
    (function antiDebug(i) {
      if (('' + i / i).length !== 1 || i % 20 === 0) {
        (function() {}).constructor('debugger')();
      } else {
        (function() {}).constructor('debugger')();
      }
      antiDebug(++i);
    })(0);
  }, 1000);

  // 5. Detección de dimensiones de ventana de DevTools
  function detectDevTools() {
    const threshold = 160;
    const widthDiff = window.outerWidth - window.innerWidth > threshold;
    const heightDiff = window.outerHeight - window.innerHeight > threshold;
    if (widthDiff || heightDiff) {
      const shield = document.getElementById('devToolsShield');
      if (shield) shield.classList.remove('hidden');
    }
  }
  window.addEventListener('resize', detectDevTools);
  setInterval(detectDevTools, 1000);
})();


let rawDecryptedData = null;
let currentScenario = 'alcalde';
let currentReportIdx = 0;
let chartInstance = null;

async function quickAccessDemo() {
  document.getElementById('secretKeyInput').value = '2026';
  await handleAuth(new Event('submit'));
}

async function fetchTrackingData(token) {
  const resp = await fetch('/api/tracking/data', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (!resp.ok) throw new Error('Sesión no autorizada');
  const json = await resp.json();
  return json.data;
}

async function handleAuth(event) {
  if (event && event.preventDefault) event.preventDefault();
  const inputKey = document.getElementById('secretKeyInput').value.trim();
  const errEl = document.getElementById('authErrorMsg');
  const submitBtn = document.querySelector('#authForm button[type="submit"]');

  if (!inputKey) {
    errEl.innerText = 'Por favor ingrese el PIN de acceso.';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = 'Verificando credenciales...';
    }
    errEl.classList.add('hidden');

    const authResp = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: inputKey })
    });

    const authJson = await authResp.json();
    if (!authResp.ok || !authJson.ok) {
      throw new Error(authJson.error || 'Credencial no autorizada');
    }

    const token = authJson.token;
    sessionStorage.setItem('cs_warroom_token', token);

    const data = await fetchTrackingData(token);
    rawDecryptedData = data;

    document.getElementById('authGateModal').classList.add('hidden');
    document.getElementById('dashboardApp').classList.remove('blur-gate');
    initDashboard();
  } catch (err) {
    errEl.innerText = err.message || 'Acceso denegado.';
    errEl.classList.remove('hidden');
    document.getElementById('secretKeyInput').focus();
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Desbloquear y Entrar al Tablero';
    }
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const savedToken = sessionStorage.getItem('cs_warroom_token');
  if (savedToken) {
    try {
      const data = await fetchTrackingData(savedToken);
      rawDecryptedData = data;
      document.getElementById('authGateModal').classList.add('hidden');
      document.getElementById('dashboardApp').classList.remove('blur-gate');
      initDashboard();
    } catch {
      sessionStorage.removeItem('cs_warroom_token');
    }
  }
});
function initDashboard() {
      setupSlider();
      initChart();
      renderActiveView();
    }

    function setupSlider() {
      const slider = document.getElementById('reportSlider');
      slider.addEventListener('input', function() {
        setReportIndex(parseInt(this.value));
      });
    }

    function setReportIndex(idx) {
      currentReportIdx = Math.max(0, Math.min(12, idx));
      document.getElementById('reportSlider').value = currentReportIdx;
      const dateName = rawDecryptedData.fechas_reportes[currentReportIdx];
      document.getElementById('currentReportLabel').innerText = `Reporte ${toRoman(currentReportIdx + 1)} · ${dateName}`;
      document.getElementById('reportIndicatorText').innerText = `Reporte ${currentReportIdx + 1} de 13 publicado (${dateName})`;
      renderActiveView();
    }

    function stepReport(delta) {
      setReportIndex(currentReportIdx + delta);
    }

    function toRoman(num) {
      const map = { 1:'I', 2:'II', 3:'III', 4:'IV', 5:'V', 6:'VI', 7:'VII', 8:'VIII', 9:'IX', 10:'X', 11:'XI', 12:'XII', 13:'XIII' };
      return map[num] || num;
    }

    function setScenario(scen) {
      currentScenario = scen;
      const btnA = document.getElementById('btnTabAlcalde');
      const btnP = document.getElementById('btnTabPrefecto');
      const title = document.getElementById('heroTitle');

      if (scen === 'alcalde') {
        btnA.className = 'px-4 py-1.5 rounded-lg bg-slate-900 text-white font-bold text-xs shadow-sm transition-all';
        btnP.className = 'px-4 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 font-bold text-xs transition-all';
        title.innerText = 'Tracking Diario · Alcaldía de Quito';
      } else {
        btnP.className = 'px-4 py-1.5 rounded-lg bg-slate-900 text-white font-bold text-xs shadow-sm transition-all';
        btnA.className = 'px-4 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 font-bold text-xs transition-all';
        title.innerText = 'Tracking Diario · Prefectura de Pichincha';
      }

      updateChartDatasets();
      renderActiveView();
    }

    function renderActiveView() {
      if (!rawDecryptedData) return;

      const idx = currentReportIdx;
      const isAlcalde = currentScenario === 'alcalde';
      const candList = isAlcalde ? rawDecryptedData.candidatos_alcalde.slice(0, 5) : rawDecryptedData.candidatos_prefecto.slice(0, 5);
      const seriesDict = isAlcalde ? rawDecryptedData.series_alcalde : rawDecryptedData.series_prefecto;

      const container = document.getElementById('candidateCardsContainer');
      container.innerHTML = '';

      candList.forEach(c => {
        const id = c.nombre.toLowerCase().split(' ')[c.nombre.toLowerCase().split(' ').length - 1].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const series = seriesDict[id] || seriesDict['pabel'] || [0];
        const currentVal = series[idx];
        const prevVal = idx > 0 ? series[idx - 1] : currentVal;
        const diffDay = (currentVal - prevVal).toFixed(1);
        const diffDayClass = diffDay > 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : diffDay < 0 ? 'text-rose-700 bg-rose-50 border-rose-200' : 'text-slate-600 bg-slate-50 border-slate-200';
        const diffDaySign = diffDay > 0 ? `+${diffDay}` : `${diffDay}`;

        const initialVal = series[0];
        const diffTotal = (currentVal - initialVal).toFixed(1);
        const diffTotalClass = diffTotal > 0 ? 'text-emerald-600' : diffTotal < 0 ? 'text-rose-600' : 'text-slate-400';
        const diffTotalSign = diffTotal > 0 ? `+${diffTotal}` : `${diffTotal}`;

        const card = document.createElement('div');
        card.className = 'card-candidate p-4 rounded-2xl flex flex-col justify-between';
        card.innerHTML = `
          <div>
            <div class="flex items-center gap-3">
              ${c.foto ? `<img src="${c.foto}" alt="${c.nombre}" class="w-14 h-14 rounded-full object-cover border-2 shadow-sm shrink-0" style="border-color: ${c.color}">` : `<div class="w-14 h-14 rounded-full flex items-center justify-center font-bold text-white text-lg shrink-0 shadow-sm" style="background-color: ${c.color}">${c.nombre[0]}</div>`}
              <div class="min-w-0">
                <h4 class="text-sm font-extrabold text-slate-900 leading-tight">${c.nombre}</h4>
                <p class="text-xs font-semibold text-slate-600 leading-snug mt-0.5 break-words">${c.partido}</p>
              </div>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-slate-100">
            <div class="flex items-baseline justify-between">
              <span class="text-3xl font-black text-slate-900 tracking-tight">${currentVal.toFixed(1)}<span class="text-base font-semibold text-slate-400">%</span></span>
              <span class="text-xs font-extrabold px-2 py-0.5 rounded-md border ${diffDayClass}">
                ${diffDaySign}% vs rep. anterior
              </span>
            </div>
            <div class="text-[11px] font-semibold text-slate-500 mt-1 flex justify-between items-center">
              <span>Evolución total:</span>
              <span class="font-bold ${diffTotalClass}">${diffTotalSign}% desde inicio</span>
            </div>
          </div>
        `;
        container.appendChild(card);
      });

      renderAntivoto(idx);
      renderFirmeza(idx);
      renderGestion(idx);
      updateChartLine();
    }

    function renderAntivoto(idx) {
      const container = document.getElementById('antivotoList');
      container.innerHTML = '';
      const av = rawDecryptedData.antivoto_alcalde;
      const list = [
        { name: 'Jorge Yunda', val: av.yunda[idx] },
        { name: 'Pabel Muñoz', val: av.pabel[idx] },
        { name: 'Harold Burbano', val: av.burbano[idx] },
        { name: 'Wilson Merino', val: av.merino[idx] },
        { name: 'Bernardo Jijón', val: av.jijon[idx] }
      ].sort((a, b) => b.val - a.val);

      list.forEach(item => {
        const row = document.createElement('div');
        row.className = 'space-y-1';
        row.innerHTML = `
          <div class="flex justify-between items-center text-xs font-bold">
            <span class="text-slate-800">${item.name}</span>
            <span class="text-rose-600 font-extrabold">${item.val.toFixed(1)}%</span>
          </div>
          <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div class="bg-rose-500 h-full rounded-full transition-all" style="width: ${item.val}%"></div>
          </div>
        `;
        container.appendChild(row);
      });
    }

    function renderFirmeza(idx) {
      const f = rawDecryptedData.firmeza_alcalde;
      const s = f.seguro[idx];
      const b = f.blando[idx];
      const ind = f.indeciso[idx];

      document.getElementById('kpiSeguro').innerText = `${s.toFixed(1)}%`;
      document.getElementById('kpiBlando').innerText = `${b.toFixed(1)}%`;
      document.getElementById('kpiIndeciso').innerText = `${ind.toFixed(1)}%`;

      document.getElementById('barSeguro').style.width = `${s}%`;
      document.getElementById('barBlando').style.width = `${b}%`;
      document.getElementById('barIndeciso').style.width = `${ind}%`;

      document.getElementById('txtDecididos').innerText = `${s.toFixed(1)}%`;
      document.getElementById('txtEnDisputa').innerText = `${(b + ind).toFixed(1)}%`;
    }

    function renderGestion(idx) {
      const p = rawDecryptedData.gestion_pabel;
      const n = rawDecryptedData.gestion_noboa;

      document.getElementById('pabelSaldo').innerText = `Saldo ${p.saldo[idx] > 0 ? '+' : ''}${p.saldo[idx].toFixed(1)}%`;
      document.getElementById('pabelPos').innerText = `${p.positiva[idx].toFixed(1)}%`;
      document.getElementById('pabelNeg').innerText = `${p.negativa[idx].toFixed(1)}%`;

      document.getElementById('noboaSaldo').innerText = `Saldo ${n.saldo[idx] > 0 ? '+' : ''}${n.saldo[idx].toFixed(1)}%`;
      document.getElementById('noboaPos').innerText = `${n.positiva[idx].toFixed(1)}%`;
      document.getElementById('noboaNeg').innerText = `${n.negativa[idx].toFixed(1)}%`;
    }

    function initChart() {
      const ctx = document.getElementById('mainChartCanvas').getContext('2d');
      chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: rawDecryptedData.fechas_reportes,
          datasets: []
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#0f172a',
              titleColor: '#ffffff',
              titleFont: { size: 13, weight: 'bold', family: 'Poppins' },
              bodyColor: '#e2e8f0',
              bodyFont: { size: 12, family: 'Poppins' },
              padding: 12,
              cornerRadius: 10,
              boxPadding: 6,
              callbacks: {
                label: (ctx) => {
                  if (ctx.raw === null || ctx.raw === undefined) return null;
                  return ` ${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { color: '#f1f5f9' },
              ticks: { color: '#64748b', font: { size: 11, weight: '600', family: 'Poppins' } }
            },
            y: {
              min: 0,
              max: 42,
              grid: { color: '#f1f5f9' },
              ticks: {
                color: '#64748b',
                callback: (val) => val + '%',
                font: { size: 11, weight: '600', family: 'Poppins' },
                stepSize: 5
              }
            }
          }
        }
      });

      updateChartDatasets();
    }

    function updateChartDatasets() {
      if (!chartInstance || !rawDecryptedData) return;

      const isAlcalde = currentScenario === 'alcalde';
      const candList = isAlcalde ? rawDecryptedData.candidatos_alcalde.slice(0, 5) : rawDecryptedData.candidatos_prefecto.slice(0, 5);
      const seriesDict = isAlcalde ? rawDecryptedData.series_alcalde : rawDecryptedData.series_prefecto;

      const legendBox = document.getElementById('legendContainer');
      legendBox.innerHTML = '';
      candList.forEach(c => {
        legendBox.innerHTML += `
          <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200">
            <span class="w-3 h-3 rounded-full" style="background-color: ${c.color}"></span>
            <span class="text-slate-800">${c.nombre}</span>
          </div>
        `;
      });

      chartInstance.data.datasets = candList.map(c => {
        const id = c.nombre.toLowerCase().split(' ')[c.nombre.toLowerCase().split(' ').length - 1].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const series = seriesDict[id] || seriesDict['pabel'] || [0];

        return {
          label: c.nombre,
          data: rawDecryptedData.fechas_reportes.map((_, i) => (i <= currentReportIdx ? series[i] : null)),
          borderColor: c.color,
          backgroundColor: c.color,
          borderWidth: 3.5,
          pointRadius: rawDecryptedData.fechas_reportes.map((_, i) => (i > currentReportIdx ? 0 : (i === currentReportIdx ? 8 : 4))),
          pointHoverRadius: 8,
          pointBackgroundColor: '#ffffff',
          pointBorderWidth: 2.5,
          pointBorderColor: c.color,
          tension: 0.25,
          spanGaps: false,
          fill: false
        };
      });

      chartInstance.update();
    }

    function updateChartLine() {
      if (!chartInstance || !rawDecryptedData) return;
      const isAlcalde = currentScenario === 'alcalde';
      const candList = isAlcalde ? rawDecryptedData.candidatos_alcalde.slice(0, 5) : rawDecryptedData.candidatos_prefecto.slice(0, 5);
      const seriesDict = isAlcalde ? rawDecryptedData.series_alcalde : rawDecryptedData.series_prefecto;

      chartInstance.data.datasets.forEach((ds, idxCand) => {
        const c = candList[idxCand];
        const id = c.nombre.toLowerCase().split(' ')[c.nombre.toLowerCase().split(' ').length - 1].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const series = seriesDict[id] || [0];

        ds.data = rawDecryptedData.fechas_reportes.map((_, i) => (i <= currentReportIdx ? series[i] : null));
        ds.pointRadius = rawDecryptedData.fechas_reportes.map((_, i) => (i > currentReportIdx ? 0 : (i === currentReportIdx ? 8 : 4)));
      });

      chartInstance.update();
    }
  