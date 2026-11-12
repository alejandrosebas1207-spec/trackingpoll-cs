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
  populateParroquiaSelect('total', 'total');
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
    title.innerText = 'Tracking Diario · Alcaldía de Quito';
    chartTitle.innerText = 'Evolución Histórica y Tracking Diario · Alcaldía de Quito';
  } else {
    btnP.className = 'px-3 py-1 rounded-lg bg-white text-slate-900 font-black text-xs shadow-sm transition-all';
    btnA.className = 'px-3 py-1 rounded-lg text-slate-300 hover:text-white font-bold text-xs transition-all';
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

// Motor de Filtros Sociodemográficos Concatenados en Cascada (Circunscripción <-> Parroquia <-> Género <-> Edad <-> Ingresos)
function populateParroquiaSelect(circFilter, selectedParroquia = 'total') {
  const select = document.getElementById('filterParroquia');
  if (!select || !rawDecryptedData) return;

  const parroquiasPorCirc = rawDecryptedData.parroquias_por_circunscripcion || {};
  let html = '<option value="total">Parroquia</option>';

  if (circFilter && circFilter !== 'total' && parroquiasPorCirc[circFilter]) {
    parroquiasPorCirc[circFilter].forEach(p => {
      const sel = p === selectedParroquia ? ' selected' : '';
      html += `<option value="${p}"${sel}>${p}</option>`;
    });
  } else {
    const ordenCirc = ['Urbana Norte', 'Urbana Centro', 'Urbana Sur', 'Rural'];
    ordenCirc.forEach(circ => {
      const parrs = parroquiasPorCirc[circ] || [];
      if (parrs.length > 0) {
        html += `<optgroup label="${circ}">`;
        parrs.forEach(p => {
          const sel = p === selectedParroquia ? ' selected' : '';
          html += `<option value="${p}"${sel}>${p}</option>`;
        });
        html += `</optgroup>`;
      }
    });
  }

  select.innerHTML = html;
  select.value = selectedParroquia;
}

function onCircunscripcionChange() {
  const circSelect = document.getElementById('filterCirc');
  const parrSelect = document.getElementById('filterParroquia');
  const circ = circSelect ? circSelect.value : 'total';
  let curParr = parrSelect ? parrSelect.value : 'total';

  if (circ !== 'total' && curParr !== 'total') {
    const map = rawDecryptedData ? (rawDecryptedData.parroquia_a_circunscripcion || {}) : {};
    if (map[curParr] !== circ) {
      curParr = 'total';
    }
  }

  populateParroquiaSelect(circ, curParr);
  renderActiveView();
}

function onParroquiaChange() {
  const circSelect = document.getElementById('filterCirc');
  const parrSelect = document.getElementById('filterParroquia');
  const parr = parrSelect ? parrSelect.value : 'total';

  if (parr !== 'total' && rawDecryptedData) {
    const map = rawDecryptedData.parroquia_a_circunscripcion || {};
    const circParr = map[parr];
    if (circParr && circSelect && circSelect.value !== circParr) {
      circSelect.value = circParr;
      populateParroquiaSelect(circParr, parr);
    }
  }

  renderActiveView();
}

function getFiltrosConcatenados() {
  const circ = document.getElementById('filterCirc') ? document.getElementById('filterCirc').value : 'total';
  const parroquia = document.getElementById('filterParroquia') ? document.getElementById('filterParroquia').value : 'total';
  const genero = document.getElementById('filterGenero') ? document.getElementById('filterGenero').value : 'total';
  const edad = document.getElementById('filterEdad') ? document.getElementById('filterEdad').value : 'total';
  const ingresos = document.getElementById('filterIngresos') ? document.getElementById('filterIngresos').value : 'total';

  const activos = [];
  if (parroquia !== 'total') {
    activos.push(parroquia);
  } else if (circ !== 'total') {
    activos.push(circ);
  }
  if (genero !== 'total') activos.push(genero === 'Hombre' ? 'Hombres' : 'Mujeres');
  if (edad !== 'total') activos.push(edad);
  if (ingresos !== 'total') activos.push(`Ingresos ${ingresos}`);

  return {
    hayFiltros: activos.length > 0,
    etiqueta: activos.join(' · '),
    circ,
    parroquia,
    genero,
    edad,
    ingresos
  };
}

function filtrarCasos() {
  const f = getFiltrosConcatenados();
  if (!f.hayFiltros) return null;

  const casos = rawDecryptedData.microdatos_casos || [];
  return casos.filter(c => {
    // c[0]: circunscripcion, c[1]: parroquia, c[2]: genero, c[3]: edad, c[4]: ingresos, c[5]: alcalde, c[6]: prefecto, c[7]: antivoto
    if (f.parroquia !== 'total' && c[1] !== f.parroquia) return false;
    if (f.circ !== 'total' && c[0] !== f.circ) return false;
    if (f.genero !== 'total' && c[2] !== f.genero) return false;
    if (f.edad !== 'total' && c[3] !== f.edad) return false;
    if (f.ingresos !== 'total' && c[4] !== f.ingresos) return false;
    return true;
  });
}

function resetFilters() {
  if (document.getElementById('filterCirc')) document.getElementById('filterCirc').value = 'total';
  populateParroquiaSelect('total', 'total');
  if (document.getElementById('filterGenero')) document.getElementById('filterGenero').value = 'total';
  if (document.getElementById('filterEdad')) document.getElementById('filterEdad').value = 'total';
  if (document.getElementById('filterIngresos')) document.getElementById('filterIngresos').value = 'total';
  renderActiveView();
}

function renderActiveView() {
  if (!rawDecryptedData) return;
  renderCandidateCards();
  renderPiramide();
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

    // Si hay filtros concatenados activos, calcular distribución real de la muestra concatenada
    if (casosFiltrados && casosFiltrados.length > 0) {
      const colIdx = isAlcalde ? 5 : 6;
      const matchCount = casosFiltrados.filter(item => item[colIdx] === id).length;
      valActual = (matchCount / casosFiltrados.length) * 100.0;
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

  const casos = filtrarCasos() || rawDecryptedData.microdatos_casos;
  const total = casos ? casos.length : 0;
  const tagH = document.getElementById('pyramidTagH');
  const tagM = document.getElementById('pyramidTagM');
  const txtTotal = document.getElementById('pyramidTotal');

  if (txtTotal) txtTotal.innerText = total.toLocaleString('es-EC');

  if (total === 0) {
    container.innerHTML = `
      <div class="text-center py-4 text-[10px] text-slate-400">
        Sin casos en la selección
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
    { id: '16 a 29 años', label: '16-29' },
    { id: '30 a 44 años', label: '30-44' },
    { id: '45 a 60 años', label: '45-60' },
    { id: '61 o más años', label: '61+' }
  ];

  let maxPct = 0;
  cohortes.forEach(co => {
    const nH = casos.filter(c => c[2] === 'Hombre' && c[3] === co.id).length;
    const nM = casos.filter(c => c[2] === 'Mujer' && c[3] === co.id).length;
    const hPct = (nH / total) * 100;
    const mPct = (nM / total) * 100;
    if (hPct > maxPct) maxPct = hPct;
    if (mPct > maxPct) maxPct = mPct;
  });
  if (maxPct <= 0) maxPct = 25;

  let html = '';
  cohortes.forEach(co => {
    const nH = casos.filter(c => c[2] === 'Hombre' && c[3] === co.id).length;
    const nM = casos.filter(c => c[2] === 'Mujer' && c[3] === co.id).length;
    const pctH = ((nH / total) * 100).toFixed(1);
    const pctM = ((nM / total) * 100).toFixed(1);

    const barW_H = Math.min(100, Math.max(nH > 0 ? 6 : 0, (nH / total / (maxPct / 100)) * 100));
    const barW_M = Math.min(100, Math.max(nM > 0 ? 6 : 0, (nM / total / (maxPct / 100)) * 100));

    html += `
      <div class="grid grid-cols-12 items-center text-[10px] font-semibold h-5 gap-1" title="${co.id}: ${nH} hombres (${pctH}%), ${nM} mujeres (${pctM}%)">
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

function renderAntivoto() {
  const el = document.getElementById('antivotoList');
  const idx = currentReportIdx;
  const anti = rawDecryptedData.antivoto_alcalde;
  const cands = rawDecryptedData.candidatos_alcalde.slice(0, 4);

  const casosFiltrados = filtrarCasos();

  // Ordenar de mayor a menor rechazo
  const items = cands.map(c => {
    const id = getCandidateKey(c);
    let val = anti[id] && anti[id][idx] !== null && anti[id][idx] !== undefined ? anti[id][idx] : 0;
    if (casosFiltrados && casosFiltrados.length > 0) {
      const matchCount = casosFiltrados.filter(item => item[7] === id).length;
      val = (matchCount / casosFiltrados.length) * 100.0;
    }
    return { c, val };
  }).sort((a, b) => b.val - a.val);

  let html = '';
  items.forEach(item => {
    html += `
      <div>
        <div class="flex justify-between items-center text-xs mb-1">
          <span class="font-bold text-slate-800">${item.c.nombre}</span>
          <span class="font-extrabold text-rose-600">${valActualFormat(item.val)}%</span>
        </div>
        <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
          <div class="bg-rose-500 h-2 rounded-full transition-all duration-300" style="width: ${Math.min(100, item.val * 2.5)}%"></div>
        </div>
      </div>
    `;
  });
  el.innerHTML = html;
}

function valActualFormat(v) {
  return typeof v === 'number' ? v.toFixed(1) : '0.0';
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

// Exportar controladores al scope global
window.onCircunscripcionChange = onCircunscripcionChange;
window.onParroquiaChange = onParroquiaChange;
window.resetFilters = resetFilters;
window.renderActiveView = renderActiveView;
window.setScenario = setScenario;
window.stepReport = stepReport;
window.handleAuth = handleAuth;

