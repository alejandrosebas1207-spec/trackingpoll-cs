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
let apoyoChartInstance = null;
let antivotoChartInstance = null;

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
  // Pasa por setReportIndex para que la etiqueta "Corte Activo" refleje el corte real al cargar
  setReportIndex(currentReportIdx, 0);
}

// Cortes que sí tienen datos (se saltan los días sin medición, p. ej. Sáb 14 y Dom 15 Nov)
function getValidReportIdxs() {
  const s = (rawDecryptedData.series_alcalde && rawDecryptedData.series_alcalde['pabel']) || [];
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== null && s[i] !== undefined) out.push(i);
  }
  return out;
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

function setReportIndex(idx, dir) {
  let target = Math.max(0, Math.min(maxAvailableIdx, idx));
  const valid = getValidReportIdxs();
  if (valid.length && !valid.includes(target)) {
    const sentido = typeof dir === 'number' ? dir : (target - currentReportIdx);
    const siguiente = valid.find(v => v > target);
    const anterior = [...valid].reverse().find(v => v < target);
    const masCercano = valid.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
    target = sentido >= 0 ? (siguiente !== undefined ? siguiente : masCercano) : (anterior !== undefined ? anterior : masCercano);
  }
  currentReportIdx = target;
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
  const repInd = document.getElementById('reportIndicatorText');
  if (repInd) repInd.innerText = badgeDesc;

  renderActiveView();
}

function stepReport(delta) {
  setReportIndex(currentReportIdx + delta, delta);
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

  // En Voto Prefecto ocultar los bloques de Alcaldía/coyuntura dejando solo Intención de Voto Prefecto y Disposición de Alexandro Tonello
  const isAlcalde = scen === 'alcalde';
  const antiCard = document.getElementById('antivotoChartCard');
  const lowerGrid = document.getElementById('lowerCardsGrid');
  if (antiCard) antiCard.classList.toggle('hidden', !isAlcalde);
  if (lowerGrid) lowerGrid.classList.toggle('hidden', !isAlcalde);

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

function getActiveSampleInfo() {
  const idx = currentReportIdx;
  const f = getFiltrosConcatenados();
  let nTotal = 0;
  if (rawDecryptedData.muestras_diarias_tracking && rawDecryptedData.muestras_diarias_tracking[idx] > 0) {
    nTotal = rawDecryptedData.muestras_diarias_tracking[idx];
  } else if (rawDecryptedData.muestras_historicas && rawDecryptedData.muestras_historicas[idx]) {
    nTotal = rawDecryptedData.muestras_historicas[idx];
  }

  let nSeg = null;
  if (f.hayFiltros) {
    const segMap = rawDecryptedData.muestras_segmento_reportes ? rawDecryptedData.muestras_segmento_reportes[String(idx)] : null;
    if (segMap && f.keyCruzada && segMap[f.keyCruzada] !== undefined) {
      nSeg = segMap[f.keyCruzada];
    } else {
      const cf = filtrarCasos();
      if (cf) nSeg = cf.length;
    }
  }
  return { idx, f, nTotal, nSeg, isSmall: nSeg !== null && nSeg < 30 };
}

function renderActiveView() {
  if (!rawDecryptedData) return;
  const fechaActiva = (rawDecryptedData.fechas_reportes && rawDecryptedData.fechas_reportes[currentReportIdx]) || '';
  const { f, nTotal } = getActiveSampleInfo();
  const nTotTxt = nTotal > 0 ? ` (n = ${nTotal.toLocaleString('es-EC')})` : '';
  document.querySelectorAll('.cut-date-badge').forEach(el => {
    // Estas tarjetas no se segmentan por filtro: si hay un filtro activo se rotulan como "Todo Quito" con su n total
    el.innerText = fechaActiva ? (f.hayFiltros ? `● ${fechaActiva} · Todo Quito${nTotTxt}` : `● ${fechaActiva}${nTotTxt}`) : '--';
    el.className = f.hayFiltros
      ? 'cut-date-badge text-[10px] font-bold text-amber-300 bg-slate-700/90 border border-amber-500/50 px-2 py-0.5 rounded whitespace-nowrap'
      : 'cut-date-badge text-[10px] font-bold text-emerald-300 bg-slate-700/90 border border-slate-600 px-2 py-0.5 rounded whitespace-nowrap';
  });
  renderCandidateCards();
  renderPiramide();
  renderFirmeza();
  renderCoyunturaYCredibilidad();
  renderApoyoChart();
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
      const segMap = rawDecryptedData.muestras_segmento_reportes ? rawDecryptedData.muestras_segmento_reportes[String(idx)] : null;
      const nSeg = segMap && f.keyCruzada && segMap[f.keyCruzada] !== undefined ? segMap[f.keyCruzada] : null;
      if (nSeg !== null && nDiario > 0) {
        sampleBadge.innerText = `Tracking Diario: n = ${nSeg} / ${nDiario}`;
        if (sampleTotalBadge) {
          sampleTotalBadge.innerHTML = `<span class="text-indigo-600 font-bold">${f.etiqueta}</span> · <strong>n = ${nSeg} de ${nDiario}</strong>`;
        }
      } else {
        const nCasos = casosFiltrados ? casosFiltrados.length : 0;
        sampleBadge.innerText = `Tracking Diario: n = ${nDiario.toLocaleString('es-EC')}`;
        if (sampleTotalBadge) {
          sampleTotalBadge.innerHTML = `<span class="text-indigo-600 font-bold">${f.etiqueta}</span> · <strong>n = ${nCasos}</strong>`;
        }
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

  const cardItems = cands.map((c) => {
    const id = getCandidateKey(c);
    const series = seriesDict[id] || [];

    // Porcentaje base temporal y búsqueda del antecedente válido más cercano (ej. Nov 2026 si días 1-2 son null, o ayer cuando ya exista)
    let valActual = series[idx] !== null && series[idx] !== undefined ? series[idx] : 0;
    let prevIdx = -1;
    for (let j = idx - 1; j >= 0; j--) {
      if (series[j] !== null && series[j] !== undefined) {
        prevIdx = j;
        break;
      }
    }
    let valPrev = prevIdx >= 0 ? series[prevIdx] : valActual;
    let prevLabel = prevIdx >= 0 && rawDecryptedData.fechas_reportes ? rawDecryptedData.fechas_reportes[prevIdx] : '';

    // Si hay filtro único activo, usar tabla cruzada ponderada oficial del corte activo (con fallback a Nov 2026 / microdatos)
    let hasPrevSeg = false;
    if (f.hayFiltros && f.keyCruzada) {
      const cruzRep = isAlcalde ? rawDecryptedData.cruzadas_alcalde_reportes : rawDecryptedData.cruzadas_prefecto_reportes;
      const cruzBase = isAlcalde ? rawDecryptedData.cruzadas_alcalde : rawDecryptedData.cruzadas_prefecto;
      if (cruzRep && cruzRep[String(idx)] && cruzRep[String(idx)][f.keyCruzada] && cruzRep[String(idx)][f.keyCruzada][id] !== undefined) {
        valActual = cruzRep[String(idx)][f.keyCruzada][id];
        for (let j = idx - 1; j >= 0; j--) {
          if (cruzRep && cruzRep[String(j)] && cruzRep[String(j)][f.keyCruzada] && cruzRep[String(j)][f.keyCruzada][id] !== undefined) {
            valPrev = cruzRep[String(j)][f.keyCruzada][id];
            prevLabel = rawDecryptedData.fechas_reportes ? rawDecryptedData.fechas_reportes[j] : '';
            hasPrevSeg = true;
            break;
          }
          if (j === 2 && cruzBase && cruzBase[f.keyCruzada] && cruzBase[f.keyCruzada][id] !== undefined) {
            valPrev = cruzBase[f.keyCruzada][id];
            prevLabel = rawDecryptedData.fechas_reportes ? rawDecryptedData.fechas_reportes[2] : 'Nov 2026';
            hasPrevSeg = true;
            break;
          }
        }
      } else if (cruzBase && cruzBase[f.keyCruzada] && cruzBase[f.keyCruzada][id] !== undefined) {
        valActual = cruzBase[f.keyCruzada][id];
      } else if (casosFiltrados && casosFiltrados.length > 0) {
        const colIdx = isAlcalde ? 5 : 6;
        const matchCount = casosFiltrados.filter(item => item[colIdx] === id).length;
        valActual = (matchCount / casosFiltrados.length) * 100.0;
      }
    }

    const delta = valActual - valPrev;
    const vsTxt = prevLabel ? ` <span class="font-normal text-slate-400">vs ${prevLabel}</span>` : '';

    let deltaHtml = '<span class="text-slate-400 font-medium text-[10px]">Línea base</span>';
    if ((!f.hayFiltros && prevIdx >= 0) || (f.hayFiltros && hasPrevSeg)) {
      if (delta > 0.05) {
        deltaHtml = `<span class="inline-flex items-center text-emerald-600 font-bold text-[10px]"><svg class="w-2.5 h-2.5 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"/></svg>+${delta.toFixed(1)}%${vsTxt}</span>`;
      } else if (delta < -0.05) {
        deltaHtml = `<span class="inline-flex items-center text-rose-600 font-bold text-[10px]"><svg class="w-2.5 h-2.5 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>${delta.toFixed(1)}%${vsTxt}</span>`;
      } else {
        deltaHtml = `<span class="text-slate-400 font-medium text-[10px]">= 0.0%${vsTxt}</span>`;
      }
    } else if (f.hayFiltros) {
      deltaHtml = `<span class="text-indigo-600 font-bold text-[10px] bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded">Segmento</span>`;
    }

    return { c, valActual, deltaHtml };
  });

  // Ordenar automáticamente de mayor a menor según el porcentaje del corte/filtro activo
  cardItems.sort((a, b) => b.valActual - a.valActual);

  // Tamaño muestral del segmento filtrado (se muestra en cada tarjeta; en ámbar si es muy pequeño)
  let nSegCard = null;
  if (f.hayFiltros) {
    const segMapCard = rawDecryptedData.muestras_segmento_reportes ? rawDecryptedData.muestras_segmento_reportes[String(idx)] : null;
    nSegCard = segMapCard && f.keyCruzada && segMapCard[f.keyCruzada] !== undefined
      ? segMapCard[f.keyCruzada]
      : (casosFiltrados ? casosFiltrados.length : null);
  }
  const nChipHtml = (nSegCard !== null)
    ? `<div class="mt-0.5"><span class="inline-block text-[10px] font-extrabold px-1.5 py-0.5 rounded border ${nSegCard < 30 ? 'text-amber-800 bg-amber-100 border-amber-400' : 'text-slate-600 bg-slate-200 border-slate-300'}">n = ${nSegCard}</span></div>`
    : '';

  const PHOTO_MAP = {
    pabel: 'PABEL_MUNOZ.png',
    burbano: 'HAROLD_BURBANO.png',
    yunda: 'JORGE_YUNDA.png',
    merino: 'WILSON_MERINO.png',
    tonello: 'ALEXANDRO_TONELLO.png',
    ubidia: 'GIOVANNA_UBIDIA.png',
    cevallos: 'CARLA_CEVALLOS.png',
    zapata: 'JUAN_ZAPATA.png'
  };

  let html = '';
  cardItems.forEach(({ c, valActual, deltaHtml }, rank) => {
    const id = getCandidateKey(c);
    const photoFile = PHOTO_MAP[id] || '';
    const avatarHtml = photoFile
      ? `<div class="w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden flex-shrink-0 bg-slate-200 border-2 shadow-xs" style="border-color: ${c.color}"><img src="./assets/${photoFile}" alt="${c.nombre}" class="w-full h-full object-cover object-top"></div>`
      : `<div class="w-1.5 h-8 rounded-full flex-shrink-0" style="background-color: ${c.color}"></div>`;

    html += `
      <div class="card-candidate p-2.5 rounded-xl border border-slate-400 bg-slate-50 flex items-center justify-between hover:border-slate-500 transition-all shadow-xs">
        <div class="flex items-center gap-2.5 min-w-0 pr-1">
          ${avatarHtml}
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] font-black uppercase px-1.5 py-0.2 rounded text-white flex-shrink-0" style="background-color: ${c.color}">
                #${rank + 1}
              </span>
              <span class="text-xs sm:text-sm font-extrabold text-slate-900 truncate leading-tight">${c.nombre}</span>
            </div>
            <div class="text-[11px] text-slate-500 truncate mt-0.5">${c.partido || c.lista}</div>
            ${nChipHtml}
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
  if (!container) return;

  const tagH = document.getElementById('pyramidTagH');
  const tagM = document.getElementById('pyramidTagM');
  const txtTotal = document.getElementById('pyramidTotal');
  const rep = rawDecryptedData && rawDecryptedData.piramide_reportes ? rawDecryptedData.piramide_reportes[String(currentReportIdx)] : null;

  if (!rep || !rep.cohortes) {
    if (txtTotal) txtTotal.innerText = '--';
    if (tagH) tagH.innerText = '♂ --';
    if (tagM) tagM.innerText = '♀ --';
    container.innerHTML = `
      <div class="text-center py-6 text-[10px] font-medium text-slate-400">
        En espera de tablas de corte
      </div>
    `;
    return;
  }

  if (txtTotal) txtTotal.innerText = Number(rep.total).toLocaleString('es-EC');
  const hPct = Number(rep.hombres_pct);
  const mPct = Number(rep.mujeres_pct);
  if (tagH) tagH.innerText = `♂ ${hPct.toFixed(1)}%`;
  if (tagM) tagM.innerText = `♀ ${mPct.toFixed(1)}%`;

  const maxPct = Math.max(...rep.cohortes.map(c => c.pct), 25);
  const sexoHtml = `
    <div class="bg-slate-200/75 p-3 rounded-lg border border-slate-300 text-center">
      <div class="flex justify-around items-center text-xs font-extrabold mb-2">
        <span class="text-sky-800">♂ Hombres ${hPct.toFixed(1)}%</span>
        <span class="text-rose-800">♀ Mujeres ${mPct.toFixed(1)}%</span>
      </div>
      <div class="w-full bg-slate-300 rounded-full h-3 flex overflow-hidden">
        <div class="bg-sky-600 h-full transition-all duration-300" style="width: ${hPct}%;"></div>
        <div class="bg-rose-600 h-full transition-all duration-300" style="width: ${mPct}%;"></div>
      </div>
    </div>
  `;

  const edadesHtml = `
    <div class="bg-slate-200/75 p-3 rounded-lg border border-slate-300 space-y-2.5">
      ${rep.cohortes.map(co => {
        const barW = Math.min(100, Math.max(co.pct > 0 ? 6 : 0, (co.pct / maxPct) * 100));
        return `
          <div class="flex items-center text-xs font-semibold gap-2.5" title="${co.label} años: ${co.pct.toFixed(1)}% (n=${co.n})">
            <span class="w-11 text-center text-xs font-bold text-slate-800 whitespace-nowrap">${co.label}</span>
            <div class="flex-1 h-3 bg-slate-300 rounded-full overflow-hidden">
              <div class="bg-slate-700 h-full rounded-full transition-all duration-300" style="width: ${barW}%;"></div>
            </div>
            <span class="w-12 text-right font-extrabold text-slate-900 whitespace-nowrap">${co.pct.toFixed(1)}%</span>
          </div>
        `;
      }).join('')}
    </div>
  `;

  container.innerHTML = sexoHtml + edadesHtml;
}

const firmezaLabelsPlugin = {
  id: 'firmezaLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.textBaseline = 'middle';

    chart.data.datasets.forEach((ds, dsIdx) => {
      const meta = chart.getDatasetMeta(dsIdx);
      if (meta.hidden) return;
      meta.data.forEach((bar, i) => {
        const val = ds.data[i];
        if (!val || val <= 0) return;
        const height = Math.abs(bar.base - bar.y);
        const midY = (bar.y + bar.base) / 2;

        if (height >= 16) {
          ctx.textAlign = 'center';
          ctx.font = '800 15px Poppins, sans-serif';
          ctx.fillStyle = ds.labelTextColor || '#ffffff';
          ctx.fillText(val.toFixed(1), bar.x, midY);
        } else {
          // Callout con palito y punto para segmentos delgados (sin traslape: Blando a la izq., Posible a la der.)
          const goLeft = dsIdx % 2 === 1;
          const halfW = (bar.width || 44) / 2;
          const startX = goLeft ? bar.x - halfW : bar.x + halfW;
          const endX = goLeft ? startX - 13 : startX + 13;
          const textX = goLeft ? endX - 3 : endX + 3;
          const lineColor = ds.calloutColor || ds.backgroundColor || '#0f172a';

          ctx.strokeStyle = lineColor;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(startX, midY);
          ctx.lineTo(endX, midY);
          ctx.stroke();

          ctx.fillStyle = lineColor;
          ctx.beginPath();
          ctx.arc(startX, midY, 2.2, 0, Math.PI * 2);
          ctx.fill();

          ctx.textAlign = goLeft ? 'right' : 'left';
          ctx.font = '800 12px Poppins, sans-serif';
          ctx.fillStyle = '#0f172a';
          ctx.fillText(val.toFixed(1) + '%', textX, midY);
        }
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
  const codes = ['PM', 'HB', 'JY', 'WM']
    .filter(c => fc[c] && fc[c].duro && fc[c].duro[idx] !== null && fc[c].duro[idx] !== undefined)
    .sort((a, b) => ((fc[b].duro[idx] || 0) + (fc[b].blando[idx] || 0)) - ((fc[a].duro[idx] || 0) + (fc[a].blando[idx] || 0)));
  const labels = codes.map(code => (fc[code] && fc[code].nombre) ? fc[code].nombre : code);

  const getSeries = (field) => codes.map(code => {
    const obj = fc[code];
    if (!obj || !obj[field]) return 0;
    const v = obj[field][idx];
    return v !== null && v !== undefined ? Number(v.toFixed(1)) : 0;
  });

  const datasets = [
    { label: '1. Duro (vota y está seguro)', data: getSeries('duro'), backgroundColor: '#155e75', labelTextColor: '#ffffff', calloutColor: '#155e75', barPercentage: 0.48 },
    { label: '2. Blando (vota y podría cambiar)', data: getSeries('blando'), backgroundColor: '#0ea5e9', labelTextColor: '#ffffff', calloutColor: '#0284c7', barPercentage: 0.48 },
    { label: '3. Posible (% segunda opción)', data: getSeries('posible'), backgroundColor: '#7dd3fc', labelTextColor: '#0f172a', calloutColor: '#0369a1', barPercentage: 0.48 },
    { label: '4. Incierto (100 - 1 - 2 - 3 - 5)', data: getSeries('incierto'), backgroundColor: '#d1d5db', labelTextColor: '#1e293b', calloutColor: '#64748b', barPercentage: 0.48 },
    { label: '5. Techo (% nunca votaría)', data: getSeries('techo'), backgroundColor: '#b91c1c', labelTextColor: '#ffffff', calloutColor: '#b91c1c', barPercentage: 0.48 }
  ];

  if (!firmezaChartInstance) {
    firmezaChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets },
      plugins: [firmezaLabelsPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2),
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
            ticks: { font: { family: 'Poppins', size: 12, weight: '800' }, color: '#0f172a' }
          },
          y: {
            stacked: true,
            min: 0,
            max: 100,
            grid: { color: '#e2e8f0' },
            ticks: { stepSize: 20, font: { family: 'Poppins', size: 10, weight: '600' }, color: '#475569', callback: v => v + '%' }
          }
        }
      }
    });
  } else {
    firmezaChartInstance.data.labels = labels;
    firmezaChartInstance.data.datasets = datasets;
    firmezaChartInstance.options.scales.y.max = 100;
    firmezaChartInstance.update();
  }
}

function renderApoyoChart() {
  const canvas = document.getElementById('apoyoChartCanvas');
  if (!canvas || !rawDecryptedData || !rawDecryptedData.apoyo_candidatos) return;

  const idx = currentReportIdx;
  const f = getFiltrosConcatenados();
  const apoyo = rawDecryptedData.apoyo_candidatos;
  const isAlcalde = currentScenario === 'alcalde';

  const apoyoSeg = (f.hayFiltros && f.keyCruzada && rawDecryptedData.apoyo_segmentos && rawDecryptedData.apoyo_segmentos[String(idx)])
    ? rawDecryptedData.apoyo_segmentos[String(idx)][f.keyCruzada]
    : null;

  const { nTotal, nSeg, isSmall } = getActiveSampleInfo();
  const nSegTxt = nSeg !== null ? ` (n = ${nSeg})` : '';
  const nTotTxt = nTotal > 0 ? ` (n = ${nTotal.toLocaleString('es-EC')})` : '';
  const fechaCorte = (rawDecryptedData.fechas_reportes && rawDecryptedData.fechas_reportes[idx]) || '';
  const dateBadge = document.getElementById('apoyoDateBadge');
  if (dateBadge) {
    if (apoyoSeg) {
      dateBadge.innerText = `● ${fechaCorte} · ${f.etiqueta}${nSegTxt}`;
      dateBadge.className = isSmall
        ? 'text-[10px] font-bold text-amber-300 bg-slate-700 border border-amber-500/60 px-2 py-0.5 rounded whitespace-nowrap'
        : 'text-[10px] font-bold text-sky-200 bg-slate-700 border border-sky-500/50 px-2 py-0.5 rounded whitespace-nowrap';
    } else if (f.hayFiltros) {
      dateBadge.innerText = `● ${fechaCorte} · Todo Quito${nTotTxt}`;
      dateBadge.className = 'text-[10px] font-bold text-amber-300 bg-slate-700/90 border border-amber-500/50 px-2 py-0.5 rounded whitespace-nowrap';
    } else {
      dateBadge.innerText = fechaCorte ? `● ${fechaCorte}${nTotTxt}` : '--';
      dateBadge.className = 'text-[10px] font-bold text-emerald-300 bg-slate-700/90 border border-slate-600 px-2 py-0.5 rounded whitespace-nowrap';
    }
  }

  const badge = document.getElementById('apoyoScenarioBadge');
  if (badge) {
    badge.innerText = isAlcalde ? 'Alcaldía de Quito' : 'Prefectura de Pichincha';
  }

  const getVal = (k, field) => {
    if (apoyoSeg && apoyoSeg[k] && apoyoSeg[k][field] !== undefined) return apoyoSeg[k][field];
    const arr = apoyo[k] && apoyo[k][field];
    return arr ? arr[idx] : null;
  };

  const candidatePool = isAlcalde ? ['pabel', 'yunda', 'burbano'] : ['tonello'];
  const keys = candidatePool
    .filter(k => {
      const v = getVal(k, 'def_si');
      return v !== null && v !== undefined;
    })
    .sort((a, b) => (getVal(b, 'def_si') || 0) - (getVal(a, 'def_si') || 0));

  const labels = keys.map(k => apoyo[k].nombre);
  const getSeries = (field) => keys.map(k => {
    const v = getVal(k, field);
    return v !== null && v !== undefined ? Number(Number(v).toFixed(1)) : 0;
  });

  const barPct = isAlcalde ? 0.45 : 0.22;
  const datasets = [
    { label: 'Definitivamente votará', data: getSeries('def_si'), backgroundColor: '#15803d', labelTextColor: '#ffffff', calloutColor: '#15803d', barPercentage: barPct },
    { label: 'Podría votar', data: getSeries('podria'), backgroundColor: '#0ea5e9', labelTextColor: '#ffffff', calloutColor: '#0284c7', barPercentage: barPct },
    { label: 'Nsr', data: getSeries('nsr'), backgroundColor: '#cbd5e1', labelTextColor: '#1e293b', calloutColor: '#64748b', barPercentage: barPct },
    { label: 'Preferiría no votar', data: getSeries('pref_no'), backgroundColor: '#f59e0b', labelTextColor: '#0f172a', calloutColor: '#d97706', barPercentage: barPct },
    { label: 'Definitivamente no votará', data: getSeries('def_no'), backgroundColor: '#b91c1c', labelTextColor: '#ffffff', calloutColor: '#b91c1c', barPercentage: barPct }
  ];

  if (!apoyoChartInstance) {
    apoyoChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets },
      plugins: [firmezaLabelsPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2),
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
            ticks: { font: { family: 'Poppins', size: 12, weight: '800' }, color: '#0f172a' }
          },
          y: {
            stacked: true,
            min: 0,
            max: 100,
            grid: { color: '#e2e8f0' },
            ticks: { stepSize: 20, font: { family: 'Poppins', size: 10, weight: '600' }, color: '#475569', callback: v => v + '%' }
          }
        }
      }
    });
  } else {
    apoyoChartInstance.data.labels = labels;
    apoyoChartInstance.data.datasets = datasets;
    apoyoChartInstance.update();
  }
}

function renderCoyunturaYCredibilidad() {
  const idx = currentReportIdx;
  const f = getFiltrosConcatenados();
  const coyBase = rawDecryptedData.coyuntura_corrupcion || {};
  const credBase = rawDecryptedData.credibilidad_noboa || {};
  const coySeg = (f.hayFiltros && f.keyCruzada && rawDecryptedData.coyuntura_segmentos && rawDecryptedData.coyuntura_segmentos[String(idx)])
    ? rawDecryptedData.coyuntura_segmentos[String(idx)][f.keyCruzada]
    : null;
  const credSeg = (f.hayFiltros && f.keyCruzada && rawDecryptedData.credibilidad_segmentos && rawDecryptedData.credibilidad_segmentos[String(idx)])
    ? rawDecryptedData.credibilidad_segmentos[String(idx)][f.keyCruzada]
    : null;

  const fechaCorte = (rawDecryptedData.fechas_reportes && rawDecryptedData.fechas_reportes[idx]) || 'Tracking';
  const { nTotal, nSeg, isSmall } = getActiveSampleInfo();
  const nSegTxt = nSeg !== null ? ` (n = ${nSeg})` : '';
  const nTotTxt = nTotal > 0 ? ` (n = ${nTotal.toLocaleString('es-EC')})` : '';
  const segBadge = document.getElementById('coySegmentBadge');
  if (segBadge) {
    segBadge.innerText = f.hayFiltros ? `● ${fechaCorte} · ${f.etiqueta}${nSegTxt}` : `● ${fechaCorte}${nTotTxt}`;
    segBadge.className = f.hayFiltros
      ? (isSmall
          ? 'text-[10px] font-bold text-amber-300 bg-slate-700 border border-amber-500/60 px-2 py-0.5 rounded'
          : 'text-[10px] font-bold text-sky-200 bg-slate-700 border border-sky-500/50 px-2 py-0.5 rounded')
      : 'text-[10px] font-bold text-emerald-300 bg-slate-700/90 border border-slate-600 px-2 py-0.5 rounded';
  }

  const conoceSi = coySeg ? coySeg.conoce_si : (coyBase.conoce_si && coyBase.conoce_si[idx] !== null && coyBase.conoce_si[idx] !== undefined ? coyBase.conoce_si[idx] : null);
  const evidencia = coySeg ? coySeg.evidencia : (coyBase.evidencia && coyBase.evidencia[idx] !== null && coyBase.evidencia[idx] !== undefined ? coyBase.evidencia[idx] : null);
  const campana = coySeg ? coySeg.campana : (coyBase.campana && coyBase.campana[idx] !== null && coyBase.campana[idx] !== undefined ? coyBase.campana[idx] : null);

  const elConoce = document.getElementById('coyConoce');
  const elEv = document.getElementById('txtEvidencia');
  const elCam = document.getElementById('txtCampana');
  const barEv = document.getElementById('barEvidencia');
  const barCam = document.getElementById('barCampana');

  if (elConoce) elConoce.innerText = conoceSi !== null ? `Sí conoce las denuncias: ${conoceSi.toFixed(1)}%` : '--';
  if (elEv) elEv.innerText = evidencia !== null ? `${evidencia.toFixed(1)}%` : '--';
  if (elCam) elCam.innerText = campana !== null ? `${campana.toFixed(1)}%` : '--';
  if (barEv) barEv.style.width = evidencia !== null ? `${evidencia}%` : '0%';
  if (barCam) barCam.style.width = campana !== null ? `${campana}%` : '0%';

  const coyFooter = document.getElementById('coyFooterNote');
  if (coyFooter) {
    if (conoceSi !== null && evidencia !== null && campana !== null) {
      const nsr = Math.max(0, 100 - evidencia - campana);
      coyFooter.innerText = `Opinión sobre ese ${conoceSi.toFixed(1)}% que sí conoce · Nsr: ${nsr.toFixed(1)}%`;
    } else {
      coyFooter.innerText = '';
    }
  }

  const creePos = credSeg ? credSeg.cree_pos : (credBase.cree_pos && credBase.cree_pos[idx] !== null && credBase.cree_pos[idx] !== undefined ? credBase.cree_pos[idx] : null);
  const creeNeg = credSeg ? credSeg.cree_neg : (credBase.cree_neg && credBase.cree_neg[idx] !== null && credBase.cree_neg[idx] !== undefined ? credBase.cree_neg[idx] : null);
  const badge = document.getElementById('noboaCredBadge');
  const elPos = document.getElementById('noboaCreePos');
  const elNeg = document.getElementById('noboaCreeNeg');
  const barPos = document.getElementById('barNoboaPos');
  const barNeg = document.getElementById('barNoboaNeg');

  if (creePos !== null && creeNeg !== null) {
    if (badge) {
      badge.innerText = `Saldo ${(creePos - creeNeg) > 0 ? '+' : ''}${(creePos - creeNeg).toFixed(1)}%`;
      badge.className = 'text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded';
    }
    if (elPos) elPos.innerText = `${creePos.toFixed(1)}%`;
    if (elNeg) elNeg.innerText = `${creeNeg.toFixed(1)}%`;
    if (barPos) barPos.style.width = `${creePos}%`;
    if (barNeg) barNeg.style.width = `${creeNeg}%`;
  } else {
    if (badge) {
      badge.innerText = '--';
      badge.className = 'text-[10px] font-extrabold text-slate-400';
    }
    if (elPos) elPos.innerText = '--';
    if (elNeg) elNeg.innerText = '--';
    if (barPos) barPos.style.width = '0%';
    if (barNeg) barNeg.style.width = '0%';
  }
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
      devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2),
      spanGaps: true,
      animation: { duration: 350 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            pointStyle: 'rectRounded',
            boxWidth: 11,
            boxHeight: 11,
            padding: 16,
            font: { family: 'Poppins', size: 12, weight: 'bold' },
            color: '#0f172a'
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
  initAntivotoChart();
  updateChartDatasets();
}

function initAntivotoChart() {
  const canvas = document.getElementById('antivotoChartCanvas');
  if (!canvas) return;
  antivotoChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: rawDecryptedData.fechas_reportes,
      datasets: []
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2),
      spanGaps: true,
      animation: { duration: 350 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            pointStyle: 'rectRounded',
            boxWidth: 11,
            boxHeight: 11,
            padding: 16,
            font: { family: 'Poppins', size: 12, weight: 'bold' },
            color: '#0f172a'
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
          suggestedMax: 35,
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
}

function getAntivotoSeriesForChart(lineId) {
  const fechas = rawDecryptedData.fechas_reportes || [];
  const f = getFiltrosConcatenados();
  if (f.hayFiltros && f.keyCruzada) {
    const cruzBase = rawDecryptedData.cruzadas_antivoto;
    const cruzRep = rawDecryptedData.cruzadas_antivoto_reportes;
    return fechas.map((_, i) => {
      if (i === 2 && cruzBase && cruzBase[f.keyCruzada] && cruzBase[f.keyCruzada][lineId] !== undefined) {
        return cruzBase[f.keyCruzada][lineId];
      }
      if (cruzRep && cruzRep[String(i)] && cruzRep[String(i)][f.keyCruzada] && cruzRep[String(i)][f.keyCruzada][lineId] !== undefined) {
        return cruzRep[String(i)][f.keyCruzada][lineId];
      }
      return null;
    });
  }
  const antiDict = rawDecryptedData.antivoto_alcalde || {};
  return antiDict[lineId] || [];
}

function updateAntivotoChartDatasets() {
  if (!antivotoChartInstance || !rawDecryptedData) return;
  const fechas = rawDecryptedData.fechas_reportes || [];
  const { f, nTotal, nSeg, isSmall } = getActiveSampleInfo();
  const badgeText = f.hayFiltros
    ? `● Filtro: ${f.etiqueta}${nSeg !== null ? ` (n = ${nSeg}${nTotal > 0 ? ` / ${nTotal.toLocaleString('es-EC')}` : ''})` : ''}`
    : `● Todo Quito${nTotal > 0 ? ` (n = ${nTotal.toLocaleString('es-EC')})` : ''}`;
  const badgeCls = f.hayFiltros
    ? (isSmall
        ? 'text-[10px] font-bold text-amber-300 bg-slate-700 border border-amber-500/60 px-2 py-0.5 rounded whitespace-nowrap'
        : 'text-[10px] font-bold text-sky-200 bg-slate-700 border border-sky-500/50 px-2 py-0.5 rounded whitespace-nowrap')
    : 'text-[10px] font-bold text-emerald-300 bg-slate-700/90 border border-slate-600 px-2 py-0.5 rounded whitespace-nowrap';

  const antiBadge = document.getElementById('antivotoChartBadge');
  if (antiBadge) {
    antiBadge.innerText = badgeText;
    antiBadge.className = badgeCls;
  }
  const mainBadge = document.getElementById('mainChartFilterBadge');
  if (mainBadge) {
    mainBadge.innerText = badgeText;
    mainBadge.className = badgeCls;
  }

  const lines = [
    { id: 'pabel', label: 'Pabel Muñoz', color: '#dc2626' },
    { id: 'burbano', label: 'Harold Burbano', color: '#7c3aed' },
    { id: 'yunda', label: 'Jorge Yunda', color: '#0284c7' },
    { id: 'merino', label: 'Wilson Merino', color: '#ea580c' }
  ];

  antivotoChartInstance.data.datasets = lines.map(line => {
    const fullSeries = getAntivotoSeriesForChart(line.id);
    return {
      label: line.label,
      borderColor: line.color,
      backgroundColor: line.color,
      borderWidth: 3,
      tension: 0.25,
      fill: false,
      spanGaps: true,
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

  antivotoChartInstance.update();
}

function getChartLinesConfig() {
  if (currentScenario === 'alcalde') {
    return [
      { id: 'pabel', label: 'Pabel Muñoz', color: '#dc2626', dashed: false },
      { id: 'burbano', label: 'Harold Burbano', color: '#7c3aed', dashed: false },
      { id: 'yunda', label: 'Jorge Yunda', color: '#0284c7', dashed: false },
      { id: 'merino', label: 'Wilson Merino', color: '#ea580c', dashed: false },
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
    const cruzBase = isAlcalde ? rawDecryptedData.cruzadas_alcalde : rawDecryptedData.cruzadas_prefecto;
    const cruzRep = isAlcalde ? rawDecryptedData.cruzadas_alcalde_reportes : rawDecryptedData.cruzadas_prefecto_reportes;
    const segBase = cruzBase ? cruzBase[f.keyCruzada] : null;
    const getSegVal = (segObj) => {
      if (!segObj) return null;
      if (!isAlcalde && lineId === 'otros' && segObj['otros'] !== undefined) {
        return Number((segObj['otros'] + (segObj['churuchumbi'] || 0)).toFixed(1));
      }
      return segObj[lineId] !== undefined ? segObj[lineId] : null;
    };
    return fechas.map((_, i) => {
      if (i === 2) return getSegVal(segBase);
      if (cruzRep && cruzRep[String(i)] && cruzRep[String(i)][f.keyCruzada]) {
        return getSegVal(cruzRep[String(i)][f.keyCruzada]);
      }
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
      backgroundColor: line.color,
      borderWidth: line.dashed ? 2 : 3,
      borderDash: line.dashed ? [5, 4] : [],
      tension: 0.25,
      fill: false,
      spanGaps: true,
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
  updateAntivotoChartDatasets();
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
  updateAntivotoChartDatasets();
}

// Exportar controladores al scope global
window.onSingleFilterChange = onSingleFilterChange;
window.resetFilters = resetFilters;
window.renderActiveView = renderActiveView;
window.setScenario = setScenario;
window.stepReport = stepReport;
window.handleAuth = handleAuth;

