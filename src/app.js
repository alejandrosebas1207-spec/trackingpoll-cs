/**
 * CLIMA SOCIAL INVESTIGACIONES METODOLÓGICAS
 * Tablero de Control y Tracking Poll Diario · Quito 2026
 * War Room Oficial · Versión 5.0 (Cortes Oficiales y Cruces Sociodemográficos)
 */
(function() {
  'use strict';

  // 1. Silenciar salidas de consola y limpieza periódica
  try {
    const noop = function() {};
    ['log', 'debug', 'info', 'warn', 'error', 'table', 'trace', 'dir', 'dirxml'].forEach(m => {
      window.console[m] = noop;
    });
    setInterval(() => { window.console.clear(); }, 2000);
  } catch(e) {}

  // 2. Bloquear clic derecho
  document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, true);

  // 3. Bloquear atajos de desarrollador (F12, Ctrl+Shift+I, Ctrl+U, etc.)
  document.addEventListener('keydown', function(e) {
    if (e.keyCode === 123) { e.preventDefault(); e.stopPropagation(); return false; }
    if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) {
      e.preventDefault(); e.stopPropagation(); return false;
    }
    if (e.metaKey && e.altKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) {
      e.preventDefault(); e.stopPropagation(); return false;
    }
    if ((e.ctrlKey && e.keyCode === 85) || (e.metaKey && e.altKey && e.keyCode === 85)) {
      e.preventDefault(); e.stopPropagation(); return false;
    }
    if ((e.ctrlKey || e.metaKey) && e.keyCode === 83) {
      e.preventDefault(); e.stopPropagation(); return false;
    }
  }, true);

  // 4. Trampa de depuración continua
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

  // 5. Detección de ventana DevTools
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

// Variables de Estado del Tablero
let rawDecryptedData = null;
let currentScenario = 'alcalde';
let currentReportIdx = 2; // Inicia en Nov 2026 (índice 2)
let maxAvailableIdx = 2;  // Mediciones consolidadas actuales (0=Sep, 1=Oct, 2=Nov)
let chartInstance = null;

// Acceso rápido con PIN 2026
async function quickAccessDemo() {
  document.getElementById('secretKeyInput').value = '2026';
  await handleAuth(new Event('submit'));
}

// Petición autenticada de datos al servidor BFF
async function fetchTrackingData(token) {
  const resp = await fetch('/api/tracking/data', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (!resp.ok) throw new Error('Sesión no autorizada');
  const json = await resp.json();
  return json.data;
}

// Verificación de credenciales
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
      submitBtn.innerText = 'Verificando con Servidor...';
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

// Auto-login con token de sesión en memoria
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

// Inicialización del Dashboard
function initDashboard() {
  if (!rawDecryptedData) return;

  // Determinar hasta qué punto existen datos válidos (distintos de null)
  const pabelSeries = rawDecryptedData.series_alcalde['pabel'] || [];
  let lastValid = 0;
  for (let i = 0; i < pabelSeries.length; i++) {
    if (pabelSeries[i] !== null && pabelSeries[i] !== undefined) {
      lastValid = i;
    }
  }
  maxAvailableIdx = lastValid;
  currentReportIdx = rawDecryptedData.corte_activo_inicial !== undefined ? rawDecryptedData.corte_activo_inicial : lastValid;

  setupSlider();
  initChart();
  renderActiveView();
}

function setupSlider() {
  const slider = document.getElementById('reportSlider');
  slider.min = 0;
  slider.max = maxAvailableIdx;
  slider.value = currentReportIdx;
  slider.addEventListener('input', function() {
    setReportIndex(parseInt(this.value));
  });
}

function setReportIndex(idx) {
  currentReportIdx = Math.max(0, Math.min(maxAvailableIdx, idx));
  document.getElementById('reportSlider').value = currentReportIdx;

  const dateName = rawDecryptedData.fechas_reportes[currentReportIdx];
  let badgeTitle = '';
  let badgeDesc = '';

  if (currentReportIdx === 0) {
    badgeTitle = 'Línea Base I · Sep 2026';
    badgeDesc = 'Medición previa presencial cantonal (n = 1.680)';
  } else if (currentReportIdx === 1) {
    badgeTitle = 'Línea Base II · Oct 2026';
    badgeDesc = 'Medición previa presencial cantonal (n = 2.071)';
  } else if (currentReportIdx === 2) {
    badgeTitle = 'Línea Base III · Nov 2026';
    badgeDesc = 'Corte oficial previo a campaña (n = 2.450)';
  } else if (currentReportIdx === 3) {
    badgeTitle = `Día 1 de Tracking · Sáb 14 Nov`;
    badgeDesc = `Primer corte diario presencial (n = 170 / Acumulado móvil)`;
  } else {
    badgeTitle = `Día ${currentReportIdx - 2} de Tracking · ${dateName}`;
    badgeDesc = `Acumulado móvil 3 días (n = 510)`;
  }

  document.getElementById('currentReportLabel').innerText = badgeTitle;
  document.getElementById('reportIndicatorText').innerText = badgeDesc;

  renderActiveView();
}

function stepReport(delta) {
  setReportIndex(currentReportIdx + delta);
}

function setScenario(scen) {
  currentScenario = scen;
  const btnA = document.getElementById('btnTabAlcalde');
  const btnP = document.getElementById('btnTabPrefecto');
  const title = document.getElementById('heroTitle');
  const chartTitle = document.getElementById('chartSectionTitle');

  if (scen === 'alcalde') {
    btnA.className = 'px-4 py-1.5 rounded-lg bg-slate-900 text-white font-bold text-xs shadow-sm transition-all';
    btnP.className = 'px-4 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 font-bold text-xs transition-all';
    title.innerText = 'Tracking Diario · Alcaldía de Quito';
    chartTitle.innerText = 'Evolución Histórica y Tracking Diario · Alcaldía de Quito';
  } else {
    btnP.className = 'px-4 py-1.5 rounded-lg bg-slate-900 text-white font-bold text-xs shadow-sm transition-all';
    btnA.className = 'px-4 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 font-bold text-xs transition-all';
    title.innerText = 'Tracking Diario · Prefectura de Pichincha';
    chartTitle.innerText = 'Evolución Histórica y Tracking Diario · Prefectura de Pichincha';
  }

  updateChartDatasets();
  renderActiveView();
}

function getCandidateKey(c) {
  if (c.id) return c.id;
  const nameLower = (c.nombre || '').toLowerCase();
  if (nameLower.includes('pabel') || nameLower.includes('muñoz') || nameLower.includes('munoz')) return 'pabel';
  if (nameLower.includes('burbano')) return 'burbano';
  if (nameLower.includes('yunda')) return 'yunda';
  if (nameLower.includes('merino')) return 'merino';
  if (nameLower.includes('tonello')) return 'tonello';
  if (nameLower.includes('ubidia')) return 'ubidia';
  if (nameLower.includes('zapata')) return 'zapata';
  if (nameLower.includes('cevallos')) return 'cevallos';
  const parts = nameLower.split(' ');
  return parts[parts.length - 1].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Lógica de cruces sociodemográficos
function getFiltroActivo() {
  const circ = document.getElementById('filterCirc') ? document.getElementById('filterCirc').value : 'total';
  const genero = document.getElementById('filterGenero') ? document.getElementById('filterGenero').value : 'total';
  const edad = document.getElementById('filterEdad') ? document.getElementById('filterEdad').value : 'total';
  const ingresos = document.getElementById('filterIngresos') ? document.getElementById('filterIngresos').value : 'total';

  if (circ !== 'total') return { tipo: 'Circunscripción', valor: circ, key: `Circunscripción_${circ}` };
  if (genero !== 'total') return { tipo: 'Sexo', valor: genero, key: `Sexo_${genero}` };
  if (edad !== 'total') return { tipo: 'Grupos de edad', valor: edad, key: `Grupos de edad_${edad}` };
  if (ingresos !== 'total') return { tipo: 'Nivel de ingresos', valor: ingresos, key: `Nivel de ingresos_${ingresos}` };

  return null;
}

function renderActiveView() {
  if (!rawDecryptedData) return;
  renderCandidateCards();
  renderAntivoto();
  renderFirmeza();
  renderGestion();
  updateChartProgress();
}

function renderCandidateCards() {
  const container = document.getElementById('candidateCardsContainer');
  const isAlcalde = currentScenario === 'alcalde';
  const cands = isAlcalde ? rawDecryptedData.candidatos_alcalde.slice(0, 4) : rawDecryptedData.candidatos_prefecto.slice(0, 4);
  const seriesDict = isAlcalde ? rawDecryptedData.series_alcalde : rawDecryptedData.series_prefecto;
  const cruzadasDict = isAlcalde ? rawDecryptedData.cruzadas_alcalde : rawDecryptedData.cruzadas_prefecto;
  const idx = currentReportIdx;

  const filtro = getFiltroActivo();
  const sampleBadge = document.getElementById('sampleBadge');
  if (sampleBadge) {
    if (filtro) {
      sampleBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-indigo-500"></span>Filtro activo: <strong>${filtro.tipo} · ${filtro.valor}</strong>`;
    } else {
      sampleBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span>Corte Oficial Noviembre 2026 · Total Cantón (n = 2.450)`;
    }
  }

  let html = '';
  cands.forEach((c, rank) => {
    const id = getCandidateKey(c);
    const series = seriesDict[id] || [];

    // Porcentaje base temporal
    let valActual = series[idx] !== null && series[idx] !== undefined ? series[idx] : 0;
    let valPrev = idx > 0 && series[idx - 1] !== null && series[idx - 1] !== undefined ? series[idx - 1] : valActual;

    // Si hay filtro sociodemográfico activo y estamos en el corte de Noviembre (o actual)
    if (filtro && cruzadasDict && cruzadasDict[filtro.key] && cruzadasDict[filtro.key][id] !== undefined) {
      valActual = cruzadasDict[filtro.key][id];
    }

    const delta = valActual - valPrev;

    let deltaHtml = '<span class="text-slate-400 font-medium text-xs">Línea base</span>';
    if (!filtro && idx > 0) {
      if (delta > 0.05) {
        deltaHtml = `<span class="inline-flex items-center text-emerald-600 font-bold text-xs"><svg class="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"/></svg>+${delta.toFixed(1)}%</span>`;
      } else if (delta < -0.05) {
        deltaHtml = `<span class="inline-flex items-center text-rose-600 font-bold text-xs"><svg class="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>${delta.toFixed(1)}%</span>`;
      } else {
        deltaHtml = `<span class="text-slate-400 font-medium text-xs">= 0.0%</span>`;
      }
    } else if (filtro) {
      deltaHtml = `<span class="text-indigo-600 font-bold text-[11px] bg-indigo-50 px-2 py-0.5 rounded">Segmento</span>`;
    }

    html += `
      <div class="card-candidate p-4 rounded-2xl flex flex-col justify-between">
        <div>
          <div class="flex justify-between items-start mb-2">
            <span class="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded text-white" style="background-color: ${c.color}">
              #${rank + 1} · ${c.lista}
            </span>
            ${deltaHtml}
          </div>
          <div class="text-sm font-extrabold text-slate-900 leading-snug">${c.nombre}</div>
          <div class="text-[11px] text-slate-500 truncate mb-3">${c.partido}</div>
        </div>
        <div class="pt-2 border-t border-slate-100 flex items-baseline justify-between">
          <span class="text-[11px] text-slate-400 font-medium">Intención</span>
          <span class="text-2xl font-black text-slate-900 tracking-tight">${valActual.toFixed(1)}%</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderAntivoto() {
  const el = document.getElementById('antivotoList');
  const idx = currentReportIdx;
  const anti = rawDecryptedData.antivoto_alcalde;
  const cands = rawDecryptedData.candidatos_alcalde.slice(0, 4);

  // Ordenar de mayor a menor rechazo
  const items = cands.map(c => {
    const id = getCandidateKey(c);
    const val = anti[id] && anti[id][idx] !== null && anti[id][idx] !== undefined ? anti[id][idx] : 0;
    return { c, val };
  }).sort((a, b) => b.val - a.val);

  let html = '';
  items.forEach(item => {
    html += `
      <div>
        <div class="flex justify-between items-center text-xs mb-1">
          <span class="font-bold text-slate-800">${item.c.nombre}</span>
          <span class="font-extrabold text-rose-600">${item.val.toFixed(1)}%</span>
        </div>
        <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
          <div class="bg-rose-500 h-2 rounded-full transition-all duration-300" style="width: ${Math.min(100, item.val * 2.5)}%"></div>
        </div>
      </div>
    `;
  });
  el.innerHTML = html;
}

function renderFirmeza() {
  const idx = currentReportIdx;
  const f = rawDecryptedData.firmeza_alcalde;
  const seg = f.seguro[idx] !== null && f.seguro[idx] !== undefined ? f.seguro[idx] : 56.4;
  const bla = f.blando[idx] !== null && f.blando[idx] !== undefined ? f.blando[idx] : 31.3;
  const ind = f.indeciso[idx] !== null && f.indeciso[idx] !== undefined ? f.indeciso[idx] : 12.3;

  document.getElementById('kpiSeguro').innerText = `${seg.toFixed(1)}%`;
  document.getElementById('kpiBlando').innerText = `${bla.toFixed(1)}%`;
  document.getElementById('kpiIndeciso').innerText = `${ind.toFixed(1)}%`;

  document.getElementById('barSeguro').style.width = `${seg}%`;
  document.getElementById('barBlando').style.width = `${bla}%`;
  document.getElementById('barIndeciso').style.width = `${ind}%`;

  document.getElementById('txtDecididos').innerText = `${seg.toFixed(1)}%`;
  document.getElementById('txtEnDisputa').innerText = `${(bla + ind).toFixed(1)}%`;
}

function renderGestion() {
  const idx = currentReportIdx;
  const p = rawDecryptedData.gestion_pabel;
  const n = rawDecryptedData.gestion_noboa;

  const pSaldo = p.saldo[idx] !== null && p.saldo[idx] !== undefined ? p.saldo[idx] : 14.8;
  const pPos = p.positiva[idx] !== null && p.positiva[idx] !== undefined ? p.positiva[idx] : 55.7;
  const pNeg = p.negativa[idx] !== null && p.negativa[idx] !== undefined ? p.negativa[idx] : 40.9;

  const nSaldo = n.saldo[idx] !== null && n.saldo[idx] !== undefined ? n.saldo[idx] : -35.7;
  const nPos = n.positiva[idx] !== null && n.positiva[idx] !== undefined ? n.positiva[idx] : 31.2;
  const nNeg = n.negativa[idx] !== null && n.negativa[idx] !== undefined ? n.negativa[idx] : 66.9;

  document.getElementById('pabelSaldo').innerText = `Saldo ${pSaldo > 0 ? '+' : ''}${pSaldo.toFixed(1)}%`;
  document.getElementById('pabelPos').innerText = `${pPos.toFixed(1)}%`;
  document.getElementById('pabelNeg').innerText = `${pNeg.toFixed(1)}%`;

  document.getElementById('noboaSaldo').innerText = `Saldo ${nSaldo > 0 ? '+' : ''}${nSaldo.toFixed(1)}%`;
  document.getElementById('noboaPos').innerText = `${nPos.toFixed(1)}%`;
  document.getElementById('noboaNeg').innerText = `${nNeg.toFixed(1)}%`;
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
      spanGaps: false,
      animation: { duration: 350 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            boxWidth: 12,
            font: { family: 'Poppins', size: 11, weight: 'bold' },
            color: '#1e293b'
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { family: 'Poppins', size: 12, weight: 'bold' },
          bodyFont: { family: 'Poppins', size: 11 },
          padding: 10,
          cornerRadius: 10,
          callbacks: {
            label: function(context) {
              const val = context.parsed.y;
              return ` ${context.dataset.label}: ${val !== null ? val.toFixed(1) + '%' : 'Pendiente'}`;
            }
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 45,
          grid: { color: '#f1f5f9' },
          ticks: {
            font: { family: 'Poppins', size: 11 },
            callback: v => v + '%'
          }
        },
        x: {
          grid: { color: '#f8fafc' },
          ticks: {
            font: { family: 'Poppins', size: 10, weight: '600' },
            maxRotation: 45,
            minRotation: 0
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
  const candList = isAlcalde ? rawDecryptedData.candidatos_alcalde.slice(0, 4) : rawDecryptedData.candidatos_prefecto.slice(0, 4);
  const seriesDict = isAlcalde ? rawDecryptedData.series_alcalde : rawDecryptedData.series_prefecto;

  chartInstance.data.datasets = candList.map(c => {
    const id = getCandidateKey(c);
    const fullSeries = seriesDict[id] || [];

    return {
      label: c.nombre,
      borderColor: c.color,
      backgroundColor: c.color + '15',
      borderWidth: 3,
      tension: 0.25,
      fill: false,
      spanGaps: false,
      pointBackgroundColor: c.color,
      pointBorderColor: '#ffffff',
      pointBorderWidth: 2,
      pointRadius: rawDecryptedData.fechas_reportes.map((_, i) => {
        if (i > currentReportIdx || fullSeries[i] === null) return 0;
        return i === currentReportIdx ? 7 : 4;
      }),
      data: rawDecryptedData.fechas_reportes.map((_, i) => (i <= currentReportIdx ? fullSeries[i] : null))
    };
  });

  chartInstance.update();
}

function updateChartProgress() {
  if (!chartInstance || !rawDecryptedData) return;
  const isAlcalde = currentScenario === 'alcalde';
  const candList = isAlcalde ? rawDecryptedData.candidatos_alcalde.slice(0, 4) : rawDecryptedData.candidatos_prefecto.slice(0, 4);
  const seriesDict = isAlcalde ? rawDecryptedData.series_alcalde : rawDecryptedData.series_prefecto;

  chartInstance.data.datasets.forEach((ds, idxCand) => {
    const c = candList[idxCand];
    const id = getCandidateKey(c);
    const fullSeries = seriesDict[id] || [];

    ds.data = rawDecryptedData.fechas_reportes.map((_, i) => (i <= currentReportIdx ? fullSeries[i] : null));
    ds.pointRadius = rawDecryptedData.fechas_reportes.map((_, i) => {
      if (i > currentReportIdx || fullSeries[i] === null) return 0;
      return i === currentReportIdx ? 7 : 4;
    });
  });

  chartInstance.update();
}
