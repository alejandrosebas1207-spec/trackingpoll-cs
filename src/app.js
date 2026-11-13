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
let firmezaChartInstance = null;

// Petición autenticada de datos al servidor BFF
async function fetchTrackingData(token) {
  const resp = await fetch('/api/tracking/data', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (!resp.ok) throw new Error('Sesión no autorizada');
  const json = await resp.json();
  return json.data;
}

// Verificación de credenciales (requiere ingreso en cada carga)
async function handleAuth(event) {
  if (event && event.preventDefault) event.preventDefault();
  const inputKey = document.getElementById('secretKeyInput').value.trim();
  const errEl = document.getElementById('authErrorMsg');
  const submitBtn = document.querySelector('#authForm button[type="submit"]');

  if (!inputKey) {
    errEl.innerText = 'Por favor ingrese la clave de acceso.';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = 'Verificando...';
    }
    errEl.classList.add('hidden');

    const authResp = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: inputKey })
    });

    const authJson = await authResp.json();
    if (!authResp.ok || !authJson.ok) {
      throw new Error(authJson.error || 'Clave de acceso incorrecta');
    }

    const token = authJson.token;
    // No se almacena en sessionStorage para exigir clave en cada recarga
    try { sessionStorage.removeItem('cs_warroom_token'); } catch {}

    const data = await fetchTrackingData(token);
    rawDecryptedData = data;

    document.getElementById('authGateModal').classList.add('hidden');
    document.getElementById('dashboardApp').classList.remove('blur-gate');
    initDashboard();
  } catch (err) {
    errEl.innerText = err.message || 'Clave de acceso incorrecta.';
    errEl.classList.remove('hidden');
    document.getElementById('secretKeyInput').focus();
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Entrar al Tablero';
    }
  }
}

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
    btnA.className = 'px-3 py-1 rounded-lg bg-white text-slate-900 font-black text-xs shadow-sm transition-all';
    btnP.className = 'px-3 py-1 rounded-lg text-slate-300 hover:text-white font-bold text-xs transition-all';
    if (chartTitle) chartTitle.innerText = 'Simulación de voto alcalde de Quito';
  } else {
    btnP.className = 'px-3 py-1 rounded-lg bg-white text-slate-900 font-black text-xs shadow-sm transition-all';
    btnA.className = 'px-3 py-1 rounded-lg text-slate-300 hover:text-white font-bold text-xs transition-all';
    if (chartTitle) chartTitle.innerText = 'Simulación de voto prefecto de Pichincha';
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

// Motor de Filtro Único (1 condición a la vez: Circunscripción | Sexo | Edad | Educación | Ingresos)
const SINGLE_FILTER_IDS = ['filterCirc', 'filterSexo', 'filterEdad', 'filterEducacion', 'filterIngresos'];

function onSingleFilterChange(changedId) {
  const activeEl = document.getElementById(changedId);
  if (activeEl && activeEl.value !== 'total') {
    SINGLE_FILTER_IDS.forEach(id => {
      if (id !== changedId) {
        const el = document.getElementById(id);
        if (el) el.value = 'total';
      }
    });
  }
  updateChartDatasets();
  renderActiveView();
}

function getFiltrosConcatenados() {
  const circ = document.getElementById('filterCirc') ? document.getElementById('filterCirc').value : 'total';
  const sexo = document.getElementById('filterSexo') ? document.getElementById('filterSexo').value : 'total';
  const edad = document.getElementById('filterEdad') ? document.getElementById('filterEdad').value : 'total';
  const educacion = document.getElementById('filterEducacion') ? document.getElementById('filterEducacion').value : 'total';
  const ingresos = document.getElementById('filterIngresos') ? document.getElementById('filterIngresos').value : 'total';

  let etiqueta = '';
  let keyCruzada = null;
  let fieldIdx = -1;
  let val = 'total';

  if (circ !== 'total') {
    etiqueta = circ;
    keyCruzada = `Circunscripción_${circ}`;
    fieldIdx = 0;
    val = circ;
  } else if (sexo !== 'total') {
    etiqueta = `Sexo: ${sexo}`;
    keyCruzada = `Sexo_${sexo}`;
    fieldIdx = 2;
    val = sexo;
  } else if (edad !== 'total') {
    etiqueta = edad;
    keyCruzada = `Grupos de edad_${edad}`;
    fieldIdx = 3;
    val = edad;
  } else if (educacion !== 'total') {
    etiqueta = educacion;
    keyCruzada = `Nivel de estudios_${educacion}`;
    fieldIdx = 1;
    val = educacion;
  } else if (ingresos !== 'total') {
    etiqueta = `Ingresos ${ingresos}`;
    keyCruzada = `Nivel de ingresos_${ingresos}`;
    fieldIdx = 4;
    val = ingresos;
  }

  return {
    hayFiltros: keyCruzada !== null,
    etiqueta,
    keyCruzada,
    fieldIdx,
    val
  };
}

function filtrarCasos() {
  const f = getFiltrosConcatenados();
  if (!f.hayFiltros || f.fieldIdx === -1) return null;

  const casos = rawDecryptedData.microdatos_casos || [];
  // c[0]: circ, c[1]: educacion, c[2]: sexo, c[3]: edad, c[4]: ingresos, c[5]: alcalde, c[6]: prefecto, c[7]: antivoto
  return casos.filter(c => c[f.fieldIdx] === f.val);
}

function resetFilters() {
  SINGLE_FILTER_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = 'total';
  });
  updateChartDatasets();
  renderActiveView();
}

function renderActiveView() {
  if (!rawDecryptedData) return;
  renderCandidateCards();
  renderPiramide();
  renderFirmeza();
  renderCoyunturaYCredibilidad();
  renderApoyoPisoTecho();
  updateChartProgress();
}

function renderCandidateCards() {
  const container = document.getElementById('candidateCardsContainer');
  const isAlcalde = currentScenario === 'alcalde';
  const cands = isAlcalde ? rawDecryptedData.candidatos_alcalde.slice(0, 4) : rawDecryptedData.candidatos_prefecto.slice(0, 4);
  const seriesDict = isAlcalde ? rawDecryptedData.series_alcalde : rawDecryptedData.series_prefecto;
  const idx = currentReportIdx;

  const f = getFiltrosConcatenados();
  const casosFiltrados = filtrarCasos();
  const sampleBadge = document.getElementById('sampleBadge');
  const sampleTotalBadge = document.getElementById('sampleTotalBadge');
  const sampleDot = document.getElementById('sampleDot');
  const btnReset = document.getElementById('btnResetFilters');

  if (btnReset) {
    if (f.hayFiltros) {
      btnReset.className = 'px-2.5 py-1 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1 shadow-2xs transition-all cursor-pointer';
    } else {
      btnReset.className = 'px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-400 font-medium text-xs flex items-center gap-1 transition-all cursor-pointer';
    }
  }

  // Muestra diaria de tracking (nuevos datos diarios)
  let nDiario = 0;
  if (rawDecryptedData.muestras_diarias_tracking && rawDecryptedData.muestras_diarias_tracking[idx] !== null && rawDecryptedData.muestras_diarias_tracking[idx] !== undefined) {
    nDiario = rawDecryptedData.muestras_diarias_tracking[idx];
  } else {
    nDiario = 0;
  }

  // Sumatoria histórica de las 3 encuestas (Sep 1.680 + Oct 2.071 + Nov 2.450 = 6.201)
  const sumatoria3 = (rawDecryptedData.sumatoria_3_encuestas || 6201);

  if (sampleBadge) {
    if (f.hayFiltros) {
      const nCasos = casosFiltrados ? casosFiltrados.length : 0;
      sampleBadge.innerText = `Tracking Diario: n = 0`;
      if (sampleTotalBadge) {
        sampleTotalBadge.innerHTML = `<span class="text-indigo-600 font-bold">${f.etiqueta}</span> · <strong>n = ${nCasos}</strong>`;
      }
      if (sampleDot) sampleDot.className = 'w-2 h-2 rounded-full bg-indigo-500 animate-pulse';
    } else {
      sampleBadge.innerText = `Tracking Diario: n = ${nDiario.toLocaleString('es-EC')}`;
      if (sampleTotalBadge) {
        sampleTotalBadge.innerText = `Sumatoria 3 encuestas: n = ${sumatoria3.toLocaleString('es-EC')}`;
      }
      if (sampleDot) sampleDot.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
    }
  }

  // Si hay filtros pero no hay casos coincidentes
  if (casosFiltrados && casosFiltrados.length === 0) {
    container.innerHTML = `
      <div class="col-span-full p-4 rounded-xl bg-amber-50 border border-amber-200 text-center">
        <div class="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">Muestra insuficiente para este cruce específico</div>
        <p class="text-xs text-amber-700">No se registraron entrevistas que cumplan simultáneamente: <strong>${f.etiqueta}</strong>.</p>
        <button onclick="resetFilters()" class="mt-2 px-3 py-1 rounded-lg bg-amber-700 text-white text-xs font-bold">Restablecer filtros</button>
      </div>
    `;
    return;
  }

  let html = '';
  cands.forEach((c, rank) => {
    const id = getCandidateKey(c);
    const series = seriesDict[id] || [];

    // Porcentaje base temporal
    let valActual = series[idx] !== null && series[idx] !== undefined ? series[idx] : 0;
    let valPrev = idx > 0 && series[idx - 1] !== null && series[idx - 1] !== undefined ? series[idx - 1] : valActual;

    // Si hay filtro único activo, usar tabla cruzada ponderada oficial (con fallback a microdatos)
    if (f.hayFiltros && f.keyCruzada) {
      const cruzDict = isAlcalde ? rawDecryptedData.cruzadas_alcalde : rawDecryptedData.cruzadas_prefecto;
      if (cruzDict && cruzDict[f.keyCruzada] && cruzDict[f.keyCruzada][id] !== undefined) {
        valActual = cruzDict[f.keyCruzada][id];
      } else if (casosFiltrados && casosFiltrados.length > 0) {
        const colIdx = isAlcalde ? 5 : 6;
        const matchCount = casosFiltrados.filter(item => item[colIdx] === id).length;
        valActual = (matchCount / casosFiltrados.length) * 100.0;
      }
    }

    const delta = valActual - valPrev;

    let deltaHtml = '<span class="text-slate-400 font-medium text-[10px]">Línea base</span>';
    if (!f.hayFiltros && idx > 0) {
      if (delta > 0.05) {
        deltaHtml = `<span class="inline-flex items-center text-emerald-600 font-bold text-[10px]"><svg class="w-2.5 h-2.5 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"/></svg>+${delta.toFixed(1)}%</span>`;
      } else if (delta < -0.05) {
        deltaHtml = `<span class="inline-flex items-center text-rose-600 font-bold text-[10px]"><svg class="w-2.5 h-2.5 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>${delta.toFixed(1)}%</span>`;
      } else {
        deltaHtml = `<span class="text-slate-400 font-medium text-[10px]">= 0.0%</span>`;
      }
    } else if (f.hayFiltros) {
      deltaHtml = `<span class="text-indigo-600 font-bold text-[10px] bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded">Segmento</span>`;
    }

    html += `
      <div class="card-candidate p-2.5 rounded-xl border border-slate-300 bg-white flex items-center justify-between hover:border-slate-400 transition-all shadow-xs">
        <div class="flex items-center gap-2.5 min-w-0 pr-1">
          <div class="w-1.5 h-8 rounded-full flex-shrink-0" style="background-color: ${c.color}"></div>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] font-black uppercase px-1.5 py-0.2 rounded text-white flex-shrink-0" style="background-color: ${c.color}">
                #${rank + 1}
              </span>
              <span class="text-xs sm:text-sm font-extrabold text-slate-900 truncate leading-tight">${c.nombre}</span>
            </div>
            <div class="text-[11px] text-slate-500 truncate mt-0.5">${c.partido || c.lista}</div>
          </div>
        </div>
        <div class="text-right flex-shrink-0 pl-1">
          <div class="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-none">${valActual.toFixed(1)}%</div>
          <div class="mt-0.5">${deltaHtml}</div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderPiramide() {
  const container = document.getElementById('piramideRows');
  if (!container || !rawDecryptedData || !rawDecryptedData.microdatos_casos) return;

  const f = getFiltrosConcatenados();
  const casos = filtrarCasos();
  const total = casos ? casos.length : 0;
  const tagH = document.getElementById('pyramidTagH');
  const tagM = document.getElementById('pyramidTagM');
  const txtTotal = document.getElementById('pyramidTotal');

  if (txtTotal) txtTotal.innerText = total.toLocaleString('es-EC');

  if (total === 0) {
    container.innerHTML = `
      <div class="text-center py-4 text-[10px] text-slate-400">
        ${f.hayFiltros ? 'Sin casos en la selección' : '0 casos'}
      </div>
    `;
    if (tagH) tagH.innerText = '♂ 0%';
    if (tagM) tagM.innerText = '♀ 0%';
    return;
  }

  const nHombres = casos.filter(c => c[2] === 'Hombre').length;
  const nMujeres = casos.filter(c => c[2] === 'Mujer').length;
  const pctHombres = ((nHombres / total) * 100).toFixed(1);
  const pctMujeres = ((nMujeres / total) * 100).toFixed(1);

  if (tagH) tagH.innerText = `♂ ${pctHombres}%`;
  if (tagM) tagM.innerText = `♀ ${pctMujeres}%`;

  const cohortes = [
    { ids: ['16 a 19 años', '20 a 29 años', '16 a 29 años'], label: '16-29' },
    { ids: ['30 a 44 años'], label: '30-44' },
    { ids: ['45 a 60 años'], label: '45-60' },
    { ids: ['61 o más años'], label: '61+' }
  ];

  let maxPct = 0;
  cohortes.forEach(co => {
    const nH = casos.filter(c => c[2] === 'Hombre' && co.ids.includes(c[3])).length;
    const nM = casos.filter(c => c[2] === 'Mujer' && co.ids.includes(c[3])).length;
    const hPct = (nH / total) * 100;
    const mPct = (nM / total) * 100;
    if (hPct > maxPct) maxPct = hPct;
    if (mPct > maxPct) maxPct = mPct;
  });
  if (maxPct <= 0) maxPct = 25;

  let html = '';
  cohortes.forEach(co => {
    const nH = casos.filter(c => c[2] === 'Hombre' && co.ids.includes(c[3])).length;
    const nM = casos.filter(c => c[2] === 'Mujer' && co.ids.includes(c[3])).length;
    const pctH = ((nH / total) * 100).toFixed(1);
    const pctM = ((nM / total) * 100).toFixed(1);

    const barW_H = Math.min(100, Math.max(nH > 0 ? 6 : 0, (nH / total / (maxPct / 100)) * 100));
    const barW_M = Math.min(100, Math.max(nM > 0 ? 6 : 0, (nM / total / (maxPct / 100)) * 100));

    html += `
      <div class="grid grid-cols-12 items-center text-[10px] font-semibold h-5 gap-1" title="${co.label} años: ${nH} hombres (${pctH}%), ${nM} mujeres (${pctM}%)">
        <div class="col-span-3 text-right truncate">
          ${nH > 0 ? `<span class="text-sky-700 font-bold">${nH}</span> <span class="text-[9px] text-slate-400">(${pctH}%)</span>` : '<span class="text-slate-300">-</span>'}
        </div>
        <div class="col-span-2 flex justify-end h-2.5 bg-slate-100 rounded-l overflow-hidden">
          <div class="bg-sky-500 h-full rounded-l transition-all duration-300" style="width: ${barW_H}%;"></div>
        </div>
        <div class="col-span-2 text-center text-[10px] font-bold text-slate-600 whitespace-nowrap px-0.5">
          ${co.label}
        </div>
        <div class="col-span-2 flex justify-start h-2.5 bg-slate-100 rounded-r overflow-hidden">
          <div class="bg-rose-500 h-full rounded-r transition-all duration-300" style="width: ${barW_M}%;"></div>
        </div>
        <div class="col-span-3 text-left truncate">
          ${nM > 0 ? `<span class="text-rose-700 font-bold">${nM}</span> <span class="text-[9px] text-slate-400">(${pctM}%)</span>` : '<span class="text-slate-300">-</span>'}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

const firmezaLabelsPlugin = {
  id: 'firmezaLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 10px Poppins, sans-serif';

    chart.data.datasets.forEach((ds, dsIdx) => {
      const meta = chart.getDatasetMeta(dsIdx);
      if (meta.hidden) return;
      meta.data.forEach((bar, i) => {
        const val = ds.data[i];
        if (!val || val <= 0) return;
        const height = Math.abs(bar.base - bar.y);
        if (height < 13) return;
        const midY = (bar.y + bar.base) / 2;
        ctx.fillStyle = ds.labelTextColor || '#ffffff';
        ctx.fillText(val.toFixed(1), bar.x, midY);
      });
    });
    ctx.restore();
  }
};

function renderFirmeza() {
  const canvas = document.getElementById('firmezaChartCanvas');
  if (!canvas || !rawDecryptedData || !rawDecryptedData.firmeza_candidatos) return;

  const idx = currentReportIdx;
  const fc = rawDecryptedData.firmeza_candidatos;
  const codes = ['PM', 'HB', 'JY', 'WM'];
  const labels = codes.map(code => (fc[code] && fc[code].nombre) ? fc[code].nombre : code);

  const getSeries = (field) => codes.map(code => {
    const obj = fc[code];
    if (!obj || !obj[field]) return 0;
    const v = obj[field][idx] !== null && obj[field][idx] !== undefined ? obj[field][idx] : obj[field][2];
    return v !== null && v !== undefined ? Number(v.toFixed(1)) : 0;
  });

  const datasets = [
    { label: 'Duro (vota y está seguro)', data: getSeries('duro'), backgroundColor: '#155e75', labelTextColor: '#ffffff', barPercentage: 0.56 },
    { label: 'Blando (vota y podría cambiar)', data: getSeries('blando'), backgroundColor: '#0ea5e9', labelTextColor: '#ffffff', barPercentage: 0.56 },
    { label: 'Posible (% segunda opción)', data: getSeries('posible'), backgroundColor: '#7dd3fc', labelTextColor: '#0f172a', barPercentage: 0.56 },
    { label: 'Incierto (100 -1-2-3-5)', data: getSeries('incierto'), backgroundColor: '#d1d5db', labelTextColor: '#1e293b', barPercentage: 0.56 },
    { label: 'Techo (% nunca votaría)', data: getSeries('techo'), backgroundColor: '#b91c1c', labelTextColor: '#ffffff', barPercentage: 0.56 }
  ];

  if (!firmezaChartInstance) {
    firmezaChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets },
      plugins: [firmezaLabelsPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            titleFont: { family: 'Poppins', size: 11, weight: 'bold' },
            bodyFont: { family: 'Poppins', size: 10 },
            callbacks: {
              title: (items) => items[0]?.label || '',
              label: (ctx) => ` ${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(1)}%`
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { font: { family: 'Poppins', size: 11, weight: '800' }, color: '#0f172a' }
          },
          y: {
            stacked: true,
            min: 0,
            max: 100,
            grid: { color: '#f1f5f9' },
            ticks: { stepSize: 20, font: { family: 'Poppins', size: 9 }, callback: v => v + '%' }
          }
        }
      }
    });
  } else {
    firmezaChartInstance.data.datasets = datasets;
    firmezaChartInstance.update();
  }
}

function renderCoyunturaYCredibilidad() {
  const idx = currentReportIdx;
  const coy = rawDecryptedData.coyuntura_corrupcion || {};
  const cred = rawDecryptedData.credibilidad_noboa || {};

  const conoceSi = coy.conoce_si && coy.conoce_si[idx] !== null && coy.conoce_si[idx] !== undefined ? coy.conoce_si[idx] : 70.1;
  const evidencia = coy.evidencia && coy.evidencia[idx] !== null && coy.evidencia[idx] !== undefined ? coy.evidencia[idx] : 52.2;
  const campana = coy.campana && coy.campana[idx] !== null && coy.campana[idx] !== undefined ? coy.campana[idx] : 34.3;

  const elConoce = document.getElementById('coyConoce');
  const elEv = document.getElementById('txtEvidencia');
  const elCam = document.getElementById('txtCampana');
  const barEv = document.getElementById('barEvidencia');
  const barCam = document.getElementById('barCampana');

  if (elConoce) elConoce.innerText = `Conoce ${conoceSi.toFixed(1)}%`;
  if (elEv) elEv.innerText = `${evidencia.toFixed(1)}%`;
  if (elCam) elCam.innerText = `${campana.toFixed(1)}%`;
  if (barEv) barEv.style.width = `${evidencia}%`;
  if (barCam) barCam.style.width = `${campana}%`;

  const creePos = cred.cree_pos && cred.cree_pos[idx] !== null && cred.cree_pos[idx] !== undefined ? cred.cree_pos[idx] : null;
  const creeNeg = cred.cree_neg && cred.cree_neg[idx] !== null && cred.cree_neg[idx] !== undefined ? cred.cree_neg[idx] : null;
  const badge = document.getElementById('noboaCredBadge');
  const elPos = document.getElementById('noboaCreePos');
  const elNeg = document.getElementById('noboaCreeNeg');

  if (creePos !== null && creeNeg !== null) {
    if (badge) {
      badge.innerText = `Saldo ${(creePos - creeNeg) > 0 ? '+' : ''}${(creePos - creeNeg).toFixed(1)}%`;
      badge.className = 'text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded';
    }
    if (elPos) elPos.innerText = `${creePos.toFixed(1)}%`;
    if (elNeg) elNeg.innerText = `${creeNeg.toFixed(1)}%`;
  } else {
    if (badge) {
      badge.innerText = '--';
      badge.className = 'text-[10px] font-extrabold text-slate-400';
    }
    if (elPos) elPos.innerText = '--';
    if (elNeg) elNeg.innerText = '--';
  }
}

function renderApoyoPisoTecho() {
  const container = document.getElementById('apoyoGrid');
  if (!container || !rawDecryptedData || !rawDecryptedData.apoyo_candidatos) return;

  const idx = currentReportIdx;
  const apoyo = rawDecryptedData.apoyo_candidatos;
  const orden = ['pabel', 'burbano', 'yunda', 'tonello'];

  let html = '';
  orden.forEach(key => {
    const item = apoyo[key];
    if (!item) return;

    const defSi = item.def_si && item.def_si[idx] !== null && item.def_si[idx] !== undefined ? item.def_si[idx] : null;
    const podria = item.podria && item.podria[idx] !== null && item.podria[idx] !== undefined ? item.podria[idx] : null;
    const prefNo = item.pref_no && item.pref_no[idx] !== null && item.pref_no[idx] !== undefined ? item.pref_no[idx] : null;
    const defNo = item.def_no && item.def_no[idx] !== null && item.def_no[idx] !== undefined ? item.def_no[idx] : null;

    if (defSi === null) {
      html += `
        <div class="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-col justify-between">
          <div class="flex justify-between items-start mb-1.5">
            <div>
              <div class="text-xs font-extrabold text-slate-900">${item.nombre}</div>
              <div class="text-[10px] text-slate-500">${item.cargo}</div>
            </div>
            <div class="text-right">
              <div class="text-[11px] font-black text-slate-400 leading-none">Techo --</div>
              <div class="text-[9px] font-semibold text-slate-400 mt-0.5">Piso --</div>
            </div>
          </div>
          <div class="w-full bg-slate-200 rounded-full h-2.5 my-2"></div>
          <div class="flex justify-between text-[10px] text-slate-400 font-semibold">
            <span>Sí/Podría: <strong>--</strong></span>
            <span>No votaría: <strong>--</strong></span>
          </div>
        </div>
      `;
      return;
    }

    const techo = defSi + podria;
    const rechazo = prefNo + defNo;

    html += `
      <div class="bg-slate-50 p-3 rounded-lg border border-slate-200 relative group hover:border-slate-300 transition-all">
        <div class="flex justify-between items-start mb-1.5">
          <div>
            <div class="text-xs font-extrabold text-slate-900">${item.nombre}</div>
            <div class="text-[10px] text-slate-500">${item.cargo}</div>
          </div>
          <div class="text-right">
            <div class="text-[11px] font-black text-emerald-700 leading-none">Techo ${techo.toFixed(1)}%</div>
            <div class="text-[9px] font-semibold text-slate-400 mt-0.5">Piso ${defSi.toFixed(1)}%</div>
          </div>
        </div>

        <!-- Barra apilada con tooltip instantáneo al pasar el mouse -->
        <div class="relative my-2">
          <div class="w-full bg-slate-200 rounded-full h-2.5 flex overflow-hidden cursor-pointer">
            <div class="bg-emerald-600 h-full" style="width: ${defSi}%"></div>
            <div class="bg-sky-500 h-full" style="width: ${podria}%"></div>
            <div class="bg-amber-400 h-full" style="width: ${prefNo}%"></div>
            <div class="bg-rose-600 h-full" style="width: ${defNo}%"></div>
          </div>
          <div class="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-30 w-48 bg-slate-900 text-white rounded-lg p-2.5 shadow-xl text-[10px] space-y-1">
            <div class="font-extrabold text-slate-200 border-b border-slate-700 pb-1 mb-1">${item.nombre}</div>
            <div class="flex justify-between"><span class="text-emerald-400 font-semibold">Def. votará:</span><strong>${defSi.toFixed(1)}%</strong></div>
            <div class="flex justify-between"><span class="text-sky-400 font-semibold">Podría votar:</span><strong>${podria.toFixed(1)}%</strong></div>
            <div class="flex justify-between"><span class="text-amber-300 font-semibold">Pref. no votar:</span><strong>${prefNo.toFixed(1)}%</strong></div>
            <div class="flex justify-between"><span class="text-rose-400 font-semibold">Def. no votará:</span><strong>${defNo.toFixed(1)}%</strong></div>
          </div>
        </div>

        <div class="flex justify-between text-[10px] text-slate-600 font-semibold">
          <span>Sí/Podría: <strong class="text-emerald-700">${techo.toFixed(1)}%</strong></span>
          <span>No votaría: <strong class="text-rose-700">${rechazo.toFixed(1)}%</strong></span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
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
            boxWidth: 14,
            padding: 16,
            font: { family: 'Poppins', size: 12, weight: 'bold' },
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
          suggestedMax: 45,
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

function getChartLinesConfig() {
  if (currentScenario === 'alcalde') {
    return [
      { id: 'pabel', label: 'Pabel Muñoz', color: '#0284c7', dashed: false },
      { id: 'burbano', label: 'Harold Burbano', color: '#7c3aed', dashed: false },
      { id: 'yunda', label: 'Jorge Yunda', color: '#ea580c', dashed: false },
      { id: 'merino', label: 'Wilson Merino', color: '#10b981', dashed: false },
      { id: 'otros', label: 'Resto', color: '#64748b', dashed: true },
      { id: 'nulo_blanco', label: 'Nulo-Blanco', color: '#94a3b8', dashed: true },
      { id: 'indecisos', label: 'Indeciso', color: '#f59e0b', dashed: true }
    ];
  }
  return [
    { id: 'tonello', label: 'Alexandro Tonello', color: '#0284c7', dashed: false },
    { id: 'ubidia', label: 'Giovanna Ubidia', color: '#7c3aed', dashed: false },
    { id: 'zapata', label: 'Juan Zapata', color: '#ea580c', dashed: false },
    { id: 'cevallos', label: 'Carla Cevallos', color: '#10b981', dashed: false },
    { id: 'otros', label: 'Resto', color: '#64748b', dashed: true },
    { id: 'nulo_blanco', label: 'Nulo-Blanco', color: '#94a3b8', dashed: true },
    { id: 'indecisos', label: 'Indeciso', color: '#f59e0b', dashed: true }
  ];
}

function getLineSeriesForChart(lineId) {
  const isAlcalde = currentScenario === 'alcalde';
  const fechas = rawDecryptedData.fechas_reportes || [];
  const f = getFiltrosConcatenados();

  if (f.hayFiltros && f.keyCruzada) {
    const cruzDict = isAlcalde ? rawDecryptedData.cruzadas_alcalde : rawDecryptedData.cruzadas_prefecto;
    const segObj = cruzDict ? cruzDict[f.keyCruzada] : null;
    return fechas.map((_, i) => {
      if (i === 2 && segObj && segObj[lineId] !== undefined) return segObj[lineId];
      return null;
    });
  }

  const seriesDict = isAlcalde ? rawDecryptedData.series_alcalde : rawDecryptedData.series_prefecto;
  if (!isAlcalde && lineId === 'otros') {
    const baseOtros = seriesDict['otros'] || [];
    const churu = seriesDict['churuchumbi'] || [];
    return fechas.map((_, i) => {
      if (baseOtros[i] === null || baseOtros[i] === undefined) return null;
      const extra = churu[i] !== null && churu[i] !== undefined ? churu[i] : 0;
      return Number((baseOtros[i] + extra).toFixed(1));
    });
  }
  return seriesDict[lineId] || [];
}

function updateChartDatasets() {
  if (!chartInstance || !rawDecryptedData) return;
  const lines = getChartLinesConfig();
  const fechas = rawDecryptedData.fechas_reportes || [];

  chartInstance.data.datasets = lines.map(line => {
    const fullSeries = getLineSeriesForChart(line.id);

    return {
      label: line.label,
      borderColor: line.color,
      backgroundColor: line.color + '15',
      borderWidth: line.dashed ? 2 : 3,
      borderDash: line.dashed ? [5, 4] : [],
      tension: 0.25,
      fill: false,
      spanGaps: false,
      pointBackgroundColor: line.color,
      pointBorderColor: '#ffffff',
      pointBorderWidth: 2,
      pointRadius: fechas.map((_, i) => {
        if (i > currentReportIdx || fullSeries[i] === null || fullSeries[i] === undefined) return 0;
        return i === currentReportIdx ? 7 : 4;
      }),
      data: fechas.map((_, i) => (i <= currentReportIdx ? fullSeries[i] : null))
    };
  });

  chartInstance.update();
}

function updateChartProgress() {
  if (!chartInstance || !rawDecryptedData) return;
  const lines = getChartLinesConfig();
  const fechas = rawDecryptedData.fechas_reportes || [];

  chartInstance.data.datasets.forEach((ds, idxLine) => {
    const line = lines[idxLine];
    if (!line) return;
    const fullSeries = getLineSeriesForChart(line.id);

    ds.data = fechas.map((_, i) => (i <= currentReportIdx ? fullSeries[i] : null));
    ds.pointRadius = fechas.map((_, i) => {
      if (i > currentReportIdx || fullSeries[i] === null || fullSeries[i] === undefined) return 0;
      return i === currentReportIdx ? 7 : 4;
    });
  });

  chartInstance.update();
}

// Exportar controladores al scope global
window.onSingleFilterChange = onSingleFilterChange;
window.resetFilters = resetFilters;
window.renderActiveView = renderActiveView;
window.setScenario = setScenario;
window.stepReport = stepReport;
window.handleAuth = handleAuth;

