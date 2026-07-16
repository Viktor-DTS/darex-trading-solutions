const $ = (id) => document.getElementById(id);

const els = {
  statusBadge: $('statusBadge'),
  metaLine: $('metaLine'),
  pairLabel: $('pairLabel'),
  btnStart: $('btnStart'),
  btnStop: $('btnStop'),
  btnLearnDry: $('btnLearnDry'),
  btnLearn: $('btnLearn'),
  btnLearnPause: $('btnLearnPause'),
  btnJournalClear: $('btnJournalClear'),
  btnRefresh: $('btnRefresh'),
  analysisKv: $('analysisKv'),
  pairsTableWrap: $('pairsTableWrap'),
  pulseKv: $('pulseKv'),
  analysisReason: $('analysisReason'),
  formulaKv: $('formulaKv'),
  factorsWrap: $('factorsWrap'),
  riskKv: $('riskKv'),
  brokerKv: $('brokerKv'),
  journalKv: $('journalKv'),
  learningKv: $('learningKv'),
  livePositionBody: $('livePositionBody'),
  livePositionCard: $('livePositionCard'),
  liveSlotsLabel: $('liveSlotsLabel'),
  logBox: $('logBox'),
  journalTable: $('journalTable'),
  tbJournalTable: $('tbJournalTable'),
  tbLiveBody: $('tbLiveBody'),
  tbSlotsLabel: $('tbSlotsLabel'),
  tbAnalysisKv: $('tbAnalysisKv'),
  tbPairsTableWrap: $('tbPairsTableWrap'),
  tbAccountKv: $('tbAccountKv'),
  tbRiskKv: $('tbRiskKv'),
  tbJournalKv: $('tbJournalKv'),
  tbOracleKv: $('tbOracleKv'),
  tbOracleTable: $('tbOracleTable'),
  tabLive: $('tabLive'),
  tabTestbot: $('tabTestbot'),
  panelTabs: $('panelTabs'),
  btnTbJournalClear: $('btnTbJournalClear'),
  btnTbFlipOn: $('btnTbFlipOn'),
  toast: $('toast'),
  externalBanner: $('externalBanner'),
};

let logStickBottom = true;
let lastGoodState = null;

function mergePreferRichClient(prev, next) {
  if (!prev) return next;
  if (!next) return prev;
  const out = { ...next };

  if ((prev.lastAnalyses?.length || 0) > (next.lastAnalyses?.length || 0)) {
    out.lastAnalyses = prev.lastAnalyses;
    out.lastAnalysis = next.lastAnalysis || prev.lastAnalysis;
  }

  // Executor/worker open state wins over journal
  if (next.openTrades != null || next.openPositionsLive != null) {
    out.openTrades = next.openTrades ?? [];
    out.openTrade = out.openTrades[0] ?? null;
    out.openPositionsLive = next.openPositionsLive ?? [];
    out.openPositionLive = out.openPositionsLive[0] ?? null;
  }

  if (next.journal || prev.journal) {
    out.journal = { ...(prev.journal || {}), ...(next.journal || {}) };
  }

  if (next.testbot) {
    out.testbot = next.testbot;
  }

  if (prev.risk && next.risk && prev.risk.dayKey === next.risk.dayKey) {
    out.risk = {
      ...next.risk,
      tradesToday: Math.max(prev.risk.tradesToday ?? 0, next.risk.tradesToday ?? 0),
    };
  }

  return out;
}

function enrichStateWithJournal(state, journalSummary) {
  if (!state || !journalSummary) return state;
  return {
    ...state,
    journal: { ...(state.journal || {}), ...journalSummary },
  };
}

function mergeState(raw) {
  if (!raw || raw.worker === 'offline') {
    return lastGoodState || raw;
  }
  lastGoodState = mergePreferRichClient(lastGoodState, raw);
  return lastGoodState;
}

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  setTimeout(() => els.toast.classList.remove('show'), 2800);
}

async function api(path, opts = {}) {
  const base = String(window.FX_API_BASE || '').replace(/\/+$/, '');
  const url = base ? `${base}${path.startsWith('/') ? path : `/${path}`}` : path;
  const headers = {
    Accept: 'application/json',
    ...(window.FxAuth?.authHeaders() || {}),
    ...(opts.headers || {}),
  };
  const res = await fetch(url, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && window.FxAuth) {
    window.FxAuth.setToken('');
    window.FxAuth.redirectLogin();
    throw new Error('Сесію завершено');
  }
  if (!res.ok) {
    const err = new Error(data.error || data.hint || res.statusText);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

function kvRow(label, value, cls = '') {
  return `<div class="kv-row"><span class="label">${label}</span><span class="value ${cls}">${value ?? '—'}</span></div>`;
}

function statChip(label, value, cls = '') {
  return `<div class="stat-chip"><span class="label">${label}</span><span class="value ${cls}">${value ?? '—'}</span></div>`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' });
  } catch (_) {
    return iso;
  }
}

function fmtUsd(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const v = Number(n);
  const cls = v > 0 ? 'positive' : v < 0 ? 'negative' : '';
  return `<span class="${cls}">${v >= 0 ? '+' : ''}$${v.toFixed(2)}</span>`;
}

function setStatus(control, health) {
  const mode = control.mode;
  const pairs = health?.pairs || [health?.pair || 'EURUSD'];
  els.pairLabel.textContent = pairs.length > 4
    ? `${pairs.length} пар · ${pairs.slice(0, 3).join(' · ')}…`
    : pairs.join(' · ');

  if (mode === 'managed') {
    els.statusBadge.className = 'badge running';
    els.statusBadge.textContent = 'Працює (панель)';
    els.btnStart.disabled = true;
    els.btnStart.textContent = '▶ Worker працює';
    els.btnStop.disabled = false;
    els.externalBanner.classList.add('hidden');
  } else if (mode === 'external') {
    els.statusBadge.className = 'badge running';
    els.statusBadge.textContent = control.lockAlive && !control.stateFresh
      ? 'Працює (Render auto)'
      : 'Працює';
    els.btnStart.disabled = true;
    els.btnStart.textContent = '▶ Worker працює';
    els.btnStop.disabled = false;
    els.externalBanner.classList.add('hidden');
  } else {
    els.statusBadge.className = 'badge stopped';
    els.statusBadge.textContent = 'Зупинено';
    els.btnStart.disabled = false;
    els.btnStart.textContent = '▶ Запустити worker';
    els.btnStop.disabled = true;
    els.externalBanner.classList.add('hidden');
  }

  const parts = [];
  if (control.pid) parts.push(`PID ${control.pid}`);
  if (control.tickCount != null) parts.push(`ticks ${control.tickCount}`);
  if (control.lastStateUpdate) parts.push(`state ${fmtTime(control.lastStateUpdate)}`);
  els.metaLine.textContent = parts.join(' · ');
}

function isWorkerOnline(state, control) {
  if (control?.mode === 'managed' || control?.externalWorkerLikely) return true;
  if (!state || state.worker === 'offline') return false;
  if (state.worker === 'online') return true;
  if (!state.updatedAt) {
    return Boolean(state.tickCount || state.openPositionLive || state.openPositionsLive?.length);
  }
  return Date.now() - new Date(state.updatedAt).getTime() < 60000;
}

function getOpenCount(state) {
  if (state?.openPositionsLive?.length) return state.openPositionsLive.length;
  if (state?.openTrades?.length) return state.openTrades.length;
  if (state?.openPositionLive || state?.openTrade) return 1;
  return 0;
}

function getOpenPairs(state) {
  const pairs = new Set();
  for (const t of state?.openPositionsLive || []) pairs.add(t.pair);
  for (const t of state?.openTrades || []) pairs.add(t.pair);
  if (state?.openTrade?.pair) pairs.add(state.openTrade.pair);
  if (state?.openPositionLive?.pair) pairs.add(state.openPositionLive.pair);
  return pairs;
}

function renderAnalysis(state, calendarApi, control) {
  const list = state?.lastAnalyses?.length
    ? state.lastAnalyses
    : state?.lastAnalysis
      ? [state.lastAnalysis]
      : [];

  if (!isWorkerOnline(state, control)) {
    els.analysisKv.innerHTML = statChip('Статус', 'Worker offline', 'skip');
    els.pairsTableWrap.innerHTML = '';
    els.analysisReason.textContent = state?.hint || 'Натисніть «Запустити worker»';
    renderFormula(null, []);
    return;
  }

  if (!list.length) {
    els.analysisKv.innerHTML = statChip('Статус', control?.stateFresh === false ? 'Синхронізація…' : 'Оновлення…', 'watch');
    els.pairsTableWrap.innerHTML = '';
    els.analysisReason.textContent = state?.hint || 'Чекаємо перший цикл аналізу (~10 с)';
    renderFormula(null, []);
    return;
  }

  const best = state.lastAnalysis || list.slice().sort((a, b) => {
    const ca = a.smart?.conviction ?? a.score ?? 0;
    const cb = b.smart?.conviction ?? b.score ?? 0;
    return cb - ca;
  })[0];
  const entries = list.filter((a) => a.action === 'BUY' || a.action === 'SELL').sort((a, b) => {
    const ca = a.smart?.conviction ?? a.score ?? 0;
    const cb = b.smart?.conviction ?? b.score ?? 0;
    return cb - ca;
  });
  const buys = entries.filter((a) => a.action === 'BUY');
  const sells = entries.filter((a) => a.action === 'SELL');
  const openCount = getOpenCount(state);
  const maxOpen = state.maxOpenPositions ?? 5;
  const slotsLeft = Math.max(0, maxOpen - openCount);
  const openPairs = getOpenPairs(state);

  function actionClass(action) {
    if (action === 'BUY') return 'buy';
    if (action === 'SELL') return 'sell';
    if (action === 'WATCH') return 'watch';
    if (action === 'OPEN') return 'buy';
    return 'skip';
  }

  function renderLamps(smart, layerEval) {
    const lamps = smart?.lamps || {
      macro: !!layerEval?.layers?.macro?.aligned,
      h1: !!layerEval?.layers?.h1?.aligned,
      m5: !!layerEval?.layers?.m5?.aligned,
      m1: !!layerEval?.layers?.m1?.aligned,
    };
    const keys = ['macro', 'h1', 'm5', 'm1'];
    return `<span class="lamps" title="macro · 1h · 5m · 1m">${keys.map((k) => {
      const on = lamps[k];
      return `<span class="lamp ${on ? 'on' : 'off'}" title="${k}"></span>`;
    }).join('')}</span>`;
  }

  function scoreLabel(a) {
    if (a.smart?.conviction != null) {
      return `${a.smart.conviction}<span class="score-sub">/${a.smart.threshold}</span>`;
    }
    return String(a.score ?? '—');
  }

  if (best) {
    const bestIsOpen = openPairs.has(best.pair);
    const bestAction = bestIsOpen ? 'OPEN' : best.action;
    const actionCls = actionClass(bestAction);
    els.analysisKv.innerHTML = [
      statChip('Сигнал', best.pair, actionCls),
      statChip('Дія', bestAction, actionCls),
      statChip('Conv', best.smart ? `${best.smart.conviction}/${best.smart.threshold}` : best.score),
      statChip('Regime', best.marketRegime || best.regime),
      statChip('Layers', renderLamps(best.smart, best.layerEval)),
      statChip('Слоти', `${openCount}/${maxOpen}`, openCount >= maxOpen ? 'paused' : 'buy'),
    ].join('');
    const parts = [];
    if (buys.length) parts.push(`BUY: ${buys.length}`);
    if (sells.length) parts.push(`SELL: ${sells.length}`);
    let reason = parts.length
      ? `${parts.join(' · ')} (найкращий ${best.pair} ${best.action} conv=${best.smart?.conviction ?? best.score})`
      : (best.reason || '');
    if (slotsLeft <= 0) {
      reason = `Максимум ${maxOpen} позицій — нові входи заблоковані. ${reason}`.trim();
    } else if (openCount > 0) {
      reason = `Відкрито ${openCount}/${maxOpen} · вільно ${slotsLeft}. ${reason}`.trim();
    }
    els.analysisReason.textContent = reason;
  }

  const sortedList = list.slice().sort((a, b) => {
    const ca = a.smart?.conviction ?? a.score ?? 0;
    const cb = b.smart?.conviction ?? b.score ?? 0;
    return cb - ca;
  });

  function renderAct(a) {
    if (a.actScore == null) return '—';
    const rank = a.actRank != null ? `#${a.actRank}` : '';
    const dead = a.actAlive === false ? ' ·!' : '';
    const atr = a.atrPips != null ? `ATR ${a.atrPips}p` : '';
    const rng = a.rangePips != null ? `rng ${a.rangePips}p` : '';
    const title = [atr, rng, a.actAlive === false ? 'quiet' : ''].filter(Boolean).join(' · ');
    return `<span class="act-cell" title="${escapeHtml(title)}">${a.actScore}${rank ? `<span class="act-sub">${rank}</span>` : ''}${dead}</span>`;
  }

  function renderNear(a) {
    const n = a.nearLevel || a.charlie?.nearLevel;
    if (!n?.label) return '<span class="muted">—</span>';
    const pips = n.pips != null ? `${n.pips}p` : '—';
    return `<span class="near-cell" title="nearest liquidity level">${escapeHtml(n.label)} ${pips}</span>`;
  }

  const charliePanel = Boolean(state?.charlieAlwaysOn || state?.charlieFocus?.length
    || list.some((a) => a.actScore != null || a.nearLevel));

  els.pairsTableWrap.innerHTML = `<table>
    <thead><tr><th>Пара</th><th>Дія</th><th>Conv</th>${charliePanel ? '<th>Act</th><th>Near</th>' : '<th>Layers</th>'}<th>Market</th><th>Ціна</th></tr></thead>
    <tbody>${sortedList.map((a) => {
    const cls = actionClass(a.action);
    const isOpen = openPairs.has(a.pair);
    const rowCls = isOpen ? 'row-open' : '';
    const displayAction = isOpen ? 'OPEN' : a.action;
    const actionTitle = escapeHtml(a.reason || '');
    const layers = renderLamps(a.smart, a.layerEval);
    const alt = a.altSignal
      ? `<div class="alt-signal" title="${escapeHtml(a.altSignal.reason || '')}">↔ ${a.altSignal.action} conv ${a.altSignal.score ?? '—'}${a.altSignal.entryMode === 'htf' ? ' HTF' : ''}</div>`
      : '';
    const skipHint = (a.action === 'SKIP' && (a.score ?? 0) >= (a.smart?.threshold ?? 70))
      ? `<div class="skip-reason" title="${actionTitle}">${escapeHtml((a.reason || '').split(';').slice(-1)[0].trim().slice(0, 48))}</div>`
      : '';
    const nearHint = (a.action === 'SKIP' && (a.score ?? 0) < (a.smart?.threshold ?? 70) && (a.nearLevel || a.charlie?.nearLevel))
      ? `<div class="near-hint" title="${escapeHtml(a.reason || '')}">немає свіпа</div>`
      : '';
    return `<tr class="${rowCls}">
      <td>${a.pair}${isOpen ? ' <span class="open-tag">OPEN</span>' : ''}</td>
      <td class="value ${cls}" title="${actionTitle}">${displayAction}${alt}${skipHint}${nearHint}</td>
      <td>${scoreLabel(a)}</td>
      ${charliePanel
    ? `<td>${renderAct(a)}</td><td>${renderNear(a)}</td>`
    : `<td>${layers}</td>`}
      <td>${a.marketRegime || a.regime}</td>
      <td>${a.quote?.mid ?? a.quote?.bid ?? '—'}</td>
    </tr>`;
  }).join('')}</tbody></table>`;

  renderFormula(best, list, calendarApi || best?.macro?.calendar);
}

function renderFormula(best, list, calendarData) {
  if (!els.formulaKv || !els.factorsWrap) return;

  if (!best) {
    els.formulaKv.innerHTML = kvRow('Формула', '—');
    els.factorsWrap.innerHTML = '';
    return;
  }

  const cal = calendarData?.calendar || calendarData;
  const comp = best.smart?.components || {};
  const fund = best.fundamental || best.layerEval?.layers?.macro?.fundamental;
  const formula = best.idealFormula || best.smart?.formula || 'Ideal v3';

  els.formulaKv.innerHTML = [
    kvRow('Fund', comp.fundamental ? `${comp.fundamental.points}p · ${comp.fundamental.score}` : (fund?.edgeScore ?? '—')),
    kvRow('H1/M5/M1', comp.h1 ? `${comp.h1.points}/${comp.m5?.points ?? '—'}/${comp.m1?.points ?? '—'}` : '—'),
    kvRow('ADX/spread', `+${best.smart?.adxBonus ?? 0} / −${best.smart?.spreadPenalty ?? 0}`),
    kvRow('Edge', fund?.edge != null ? `${fund.edge} · ${fund.baseStrength?.ccy}${fund.baseStrength?.score} vs ${fund.quoteStrength?.ccy}${fund.quoteStrength?.score}` : '—'),
    kvRow('USD news', cal?.usdSurprise ? `${cal.usdSurprise.signed > 0 ? '+' : ''}${cal.usdSurprise.signed}` : '—'),
    kvRow('Calendar', cal?.provider ? `${cal.provider}${cal.stale ? ' · stale' : ''}` : '—'),
  ].join('');

  const macro = best.macro;
  const macroRows = macro ? [
    ['DXY', macro.dxy?.bias, macro.dxy?.price],
    ['US10Y', macro.yields?.bias, macro.yields?.price],
    ['VIX', macro.vix?.bias, macro.vix?.price],
    ['Risk', macro.risk, ''],
    ['Oil', macro.oil?.bias, macro.oil?.price],
    ['Gold', macro.gold?.bias, macro.gold?.price],
    ['China FXI', macro.china?.bias, macro.china?.price],
    ['SPY', macro.spy?.bias, macro.spy?.price],
    ['USDJPY', macro.jpy?.bias, macro.jpy?.price],
    ['AUDNZD', macro.audnzd?.bias, macro.audnzd?.price],
  ] : [];

  const factorRows = (fund?.factors || []).map((f) => [
    `${f.ccy || ''} ${f.label}`.trim(),
    f.signed > 0 ? '↑' : f.signed < 0 ? '↓' : '—',
    f.detail,
    f.contribution,
  ]);

  let html = '';

  const recent = cal?.recent || [];
  const upcoming = cal?.upcoming || [];
  if (recent.length || upcoming.length) {
    html += '<h3 class="factors-sub">Календар · surprise</h3><table class="factors-table"><thead><tr><th>Подія</th><th>CCY</th><th>Actual</th><th>Forecast</th><th>Surprise</th></tr></thead><tbody>';
    for (const ev of recent) {
      html += `<tr><td>${ev.title}</td><td>${ev.currency}</td><td>${ev.actual ?? '—'}</td><td>${ev.forecast ?? '—'}</td><td class="${(ev.surprise?.bias ?? 0) > 0 ? 'value buy' : (ev.surprise?.bias ?? 0) < 0 ? 'value sell' : ''}">${ev.surprise?.surprisePct != null ? `${ev.surprise.surprisePct}%` : '—'}</td></tr>`;
    }
    for (const ev of upcoming) {
      html += `<tr><td>${ev.title} ⏳</td><td>${ev.currency}</td><td>—</td><td>${ev.forecast ?? '—'}</td><td>—</td></tr>`;
    }
    html += '</tbody></table>';
  }

  if (macroRows.length) {
    html += `<h3 class="factors-sub">Глобальні індикатори</h3><table class="factors-table"><thead><tr><th>Фактор</th><th>Bias</th><th>Ціна</th></tr></thead><tbody>${macroRows.map((r) => `<tr><td>${r[0]}</td><td>${r[1] ?? '—'}</td><td>${r[2] ?? '—'}</td></tr>`).join('')}</tbody></table>`;
  }
  if (factorRows.length) {
    html += `<h3 class="factors-sub">${best.pair} — сила валют</h3><table class="factors-table"><thead><tr><th>Фактор</th><th></th><th>Деталь</th><th>±</th></tr></thead><tbody>${factorRows.map((r) => `<tr><td>${r[0]}</td><td class="${r[1] === '↑' ? 'value buy' : r[1] === '↓' ? 'value sell' : ''}">${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</tbody></table>`;
  }
  if (!html) html = '<p class="muted">Запустіть npm run calendar:refresh або seed:calendar</p>';
  els.factorsWrap.innerHTML = html;
}

function renderPulse(state) {
  if (!els.pulseKv) return;
  const churn = state?.charlieUniverseChurn;
  const pulse = state?.charliePulse;
  const focus = state?.charlieFocus || [];
  const universe = state?.charlieUniverse || [];
  if (!churn && !pulse && !focus.length && !universe.length) {
    els.pulseKv.innerHTML = kvRow('Статус', 'немає charlie pulse');
    return;
  }
  const up = (churn?.replaced || []).map((r) => r.in || r).filter(Boolean);
  const down = churn?.demoted || [];
  const fUp = pulse?.promoted || [];
  const fDown = pulse?.demoted || [];
  els.pulseKv.innerHTML = [
    kvRow('Universe', `${universe.length || '—'} · rot ${churn?.rotating?.length ?? '—'}`),
    kvRow('Focus', focus.length ? focus.join(', ') : '—'),
    kvRow('↑ uni', up.length ? up.slice(0, 6).join(', ') : '—', up.length ? 'positive' : ''),
    kvRow('↓ uni', down.length ? down.slice(0, 6).join(', ') : '—', down.length ? 'negative' : ''),
    kvRow('↑ focus', fUp.length ? fUp.join(', ') : '—', fUp.length ? 'positive' : ''),
    kvRow('↓ focus', fDown.length ? fDown.join(', ') : '—', fDown.length ? 'negative' : ''),
    kvRow('Unique 1h', pulse?.unique1h != null ? String(pulse.unique1h) : '—'),
    kvRow('Source', churn?.source || '—'),
  ].join('');
}

function renderRisk(state) {
  const r = state?.risk;
  const opens = state?.openPositionsLive?.length
    ? state.openPositionsLive
    : state?.openTrades?.length
      ? state.openTrades
      : state?.openPositionLive
        ? [state.openPositionLive]
        : state?.openTrade
          ? [state.openTrade]
          : [];
  const maxOpen = state?.maxOpenPositions ?? 5;

  let html = [
    kvRow('P/L сьогодні', fmtUsd(r?.dailyPnlUsd)),
    kvRow('Угод сьогодні', r?.tradesToday ?? 0),
    kvRow('Позиції', `${opens.length}/${maxOpen}`, opens.length >= maxOpen ? 'paused' : ''),
    kvRow('Пауза ризику', r?.tradingPaused ? 'ТАК' : 'ні', r?.tradingPaused ? 'paused' : ''),
  ].join('');

  for (const open of opens.slice(0, 5)) {
    const sideCls = open.side === 'short' ? 'sell' : 'buy';
    const sideLabel = open.side === 'short' ? 'short' : 'long';
    html += kvRow(`${open.pair} ${sideLabel}`, `@ ${open.entry}`, sideCls);
    html += kvRow('SL / TP', `${open.stopLoss} / ${open.takeProfit}`);
  }
  els.riskKv.innerHTML = html;
}

function marketDataStreamRow(state, health, capital) {
  const provider = (state?.provider || health?.provider || '').toLowerCase();
  const capitalMode = provider === 'capital' || capital?.executorMode === 'capital';
  if (!capitalMode) return null;

  if (state?.capitalWs) {
    return kvRow('Потік даних', 'Capital WebSocket ✓', 'buy');
  }
  if (state?.yahooFallback) {
    return kvRow('Потік даних', 'Yahoo → WS (тимчасово)', 'watch');
  }
  if (state?.worker === 'offline') {
    return kvRow('Потік даних', 'worker офлайн', 'paused');
  }
  if (state?.hint && !state?.tickCount) {
    return kvRow('Потік даних', state.hint, 'watch');
  }
  if (capital?.rateLimited) {
    return kvRow('Потік даних', 'пауза API · retry ~60с', 'paused');
  }
  if (state?.capitalReady && !state?.yahooFallback) {
    return kvRow('Потік даних', 'Capital REST', 'watch');
  }
  return kvRow('Потік даних', 'завантаження…', 'watch');
}

function renderBroker(capital, state, health) {
  if (!els.brokerKv) return;
  if (!capital) {
    els.brokerKv.innerHTML = kvRow('Статус', '—');
    return;
  }

  const connected = Boolean(capital.connected);
  const envLabel = capital.env === 'live' ? 'Live' : 'Demo';
  const mode = capital.executorMode || 'sim';
  const brokerLabel = mode === 'capital' ? `Capital · ${envLabel}` : mode;

  let html = [
    kvRow('Режим', brokerLabel),
    kvRow('API', connected ? 'підключено' : (capital.rateLimited ? 'пауза API' : 'немає'), connected ? 'buy' : 'paused'),
  ];

  if (capital.executorHint) {
    html.push(kvRow('Увага', capital.executorHint, 'paused'));
  }

  const streamRow = marketDataStreamRow(state, health, capital);
  if (streamRow) html.push(streamRow);

  if (connected) {
    html.push(kvRow('Капітал', capital.balance != null ? fmtUsd(capital.balance) : '—'));
    html.push(kvRow('Доступно', capital.available != null ? fmtUsd(capital.available) : '—'));
    if (capital.profitLoss != null) {
      const plCls = capital.profitLoss > 0 ? 'positive' : capital.profitLoss < 0 ? 'negative' : '';
      html.push(kvRow('P/L брокер', fmtUsd(capital.profitLoss), plCls));
    }
    if (capital.currency) html.push(kvRow('Валюта', capital.currency));
    if (capital.stale) html.push(kvRow('Оновлення', 'кеш (API тимчасово)', 'watch'));
  } else {
    html.push(kvRow('Дані', capital.hint || capital.error || 'налаштуйте FX_CAPITAL_*', 'paused'));
  }

  els.brokerKv.innerHTML = html.join('');
}

function normalizeJournalSummary(summary, events) {
  const s = { ...(summary || {}) };
  const evs = events || s.lastEvents || [];

  if (s.openCount == null || s.openTrades == null) {
    const openByKey = new Map();
    for (const ev of evs) {
      if (ev.type === 'entry') openByKey.set(`${ev.pair}-${ev.openedAt}`, ev);
      if (ev.type === 'exit') openByKey.delete(`${ev.pair}-${ev.openedAt}`);
    }
    s.openTrades = [...openByKey.values()];
    s.openCount = s.openTrades.length;
  }

  return s;
}

function renderJournal(summary) {
  const s = summary || {};
  let html = [
    kvRow('Відкрито', s.openCount ?? 0, (s.openCount ?? 0) > 0 ? 'buy' : ''),
    kvRow('Закрито', s.totalClosed ?? 0),
    kvRow('Wins / Losses', `${s.wins ?? 0} / ${s.losses ?? 0}`),
    kvRow('Total P/L', fmtUsd(s.totalPnlUsd)),
  ].join('');
  for (const open of (s.openTrades || []).slice(0, 5)) {
    html += kvRow(open.pair, `@ ${open.entry}`, 'buy');
    html += kvRow('SL / TP', `${open.stopLoss} / ${open.takeProfit}`);
  }
  els.journalKv.innerHTML = html;
}

function renderLiveCard(live, state) {
  const mark = live.mark;
  const pips = live.unrealizedPips ?? 0;
  const markCls = pips > 0 ? 'up' : pips < 0 ? 'down' : 'flat';
  const pnl = live.unrealizedPnlUsd;

  const tpPct = live.pipsToTp != null && live.pipsToSl != null
    ? Math.min(100, Math.max(0, (live.pipsToSl / (live.pipsToSl + live.pipsToTp)) * 100))
    : 0;

  return `
    <div class="live-position">
      <div class="live-pair">${live.pair} · ${live.side === 'short' ? 'short' : 'long'}${live.lots != null ? ` · ${live.lots} lot` : ''}</div>
      <div class="live-mark ${markCls}">${mark != null ? mark : '—'}</div>
      <div class="kv">
        ${kvRow('Вхід', live.entry)}
        ${live.spreadPips != null ? kvRow('Спред', `${live.spreadPips} pips`) : ''}
        ${kvRow('Unrealized', `${pips >= 0 ? '+' : ''}${pips} pips · ${fmtUsd(pnl)}`, pips > 0 ? 'positive' : pips < 0 ? 'negative' : '')}
        ${kvRow('До TP', live.pipsToTp != null ? `${live.pipsToTp} pips → ${live.takeProfit}` : '—')}
        ${kvRow('До SL', live.pipsToSl != null ? `${live.pipsToSl} pips → ${live.stopLoss}` : '—')}
      </div>
      <div class="live-bars">
        <div>
          <div class="live-bar-label">SL ← mark → TP</div>
          <div class="live-bar-track"><div class="live-bar-fill tp" style="width:${tpPct.toFixed(0)}%"></div></div>
        </div>
      </div>
      <div class="live-meta">Оновлено: ${fmtTime(live.quoteUpdatedAt || state.updatedAt)}</div>
    </div>
  `;
}

function renderLivePosition(state) {
  const liveList = state?.openPositionsLive?.length
    ? state.openPositionsLive
    : state?.openPositionLive?.pair
      ? [state.openPositionLive]
      : [];
  const card = els.livePositionCard;
  const maxOpen = state?.maxOpenPositions ?? 5;

  if (els.liveSlotsLabel) {
    els.liveSlotsLabel.textContent = liveList.length ? `(${liveList.length}/${maxOpen})` : '';
  }

  if (!liveList.length) {
    card.classList.remove('has-open');
    card.classList.add('is-empty');
    els.livePositionBody.innerHTML = '<p class="live-empty">Немає відкритих угод</p>';
    return;
  }

  card.classList.remove('is-empty');
  card.classList.add('has-open');
  els.livePositionBody.innerHTML = liveList.map((live) => renderLiveCard(live, state)).join('');
}

function learningMetricsRows(metrics) {
  const m = metrics || {};
  if (!m.count) {
    return [kvRow('Вінрейт', '— (немає закритих)', 'skip')];
  }
  const wr = m.winRate ?? 0;
  const wrCls = wr >= 45 ? 'positive' : wr < 40 ? 'negative' : '';
  const rows = [
    kvRow('Вінрейт', `${wr}%`, wrCls),
    kvRow('W / L', `${m.wins ?? 0} / ${m.losses ?? 0} · ${m.count} угод`),
  ];
  if (m.profitFactor != null) rows.push(kvRow('PF', m.profitFactor));
  if (m.expectancyUsd != null) rows.push(kvRow('Очікування', `${fmtUsd(m.expectancyUsd)}/угода`));
  if (m.totalPnlUsd != null) {
    const pnlCls = m.totalPnlUsd > 0 ? 'positive' : m.totalPnlUsd < 0 ? 'negative' : '';
    rows.push(kvRow('P/L (50)', fmtUsd(m.totalPnlUsd), pnlCls));
  }
  return rows;
}

function renderLearning(l) {
  const metrics = l?.metrics || l?.lastMetrics;
  if (!l || !l.minBuyScore) {
    els.learningKv.innerHTML = [
      kvRow('Статус', 'Дефолтні параметри', 'skip'),
      ...learningMetricsRows(metrics),
    ].join('');
    renderPauseButton({ tradingPaused: false });
    return;
  }
  els.learningKv.innerHTML = [
    ...learningMetricsRows(metrics),
    kvRow('minBuyScore', l.minBuyScore),
    kvRow('minLayers', l.minLayersAligned ?? 3),
    kvRow('stopPips', l.stopPips),
    kvRow('targetPips', l.targetPips),
    kvRow('Пауза', l.tradingPaused ? 'ТАК' : 'ні', l.tradingPaused ? 'paused' : ''),
    kvRow('Версія', l.version ?? 0),
    kvRow('Оновлено', fmtTime(l.updatedAt)),
  ].join('');
  if (l.pauseReason) {
    els.learningKv.innerHTML += kvRow('Причина', l.pauseReason, 'paused');
  }
  renderPauseButton(l);
}

let learningPaused = false;

function renderPauseButton(learning) {
  const btn = els.btnLearnPause;
  if (!btn) return;
  learningPaused = Boolean(learning?.tradingPaused);
  if (learningPaused) {
    btn.textContent = '▶ Зняти паузу';
    btn.classList.remove('danger');
    btn.classList.add('primary');
    btn.title = 'Дозволити нові входи';
  } else {
    btn.textContent = '⏸ Поставити паузу';
    btn.classList.remove('primary');
    btn.classList.add('danger');
    btn.title = 'Заблокувати нові входи (learning pause)';
  }
}

function renderJournalTable(events) {
  const typeLabel = { entry: 'відкриття', exit: 'закриття' };
  const rows = (events || []).slice().reverse().slice(0, 25);
  els.journalTable.innerHTML = rows.map((e) => {
    const pnl = e.type === 'exit' ? fmtUsd(e.pnlUsd) : '—';
    const pips = e.pips != null ? e.pips : '—';
    const typ = typeLabel[e.type] || e.type;
    let reason = '—';
    if (e.type === 'exit') {
      reason = e.exitReason === 'take_profit' ? 'take profit' : e.exitReason === 'stop' ? 'stop loss' : (e.exitReason || '—');
    } else if (e.type === 'entry') {
      reason = `@ ${e.entry ?? '—'} · SL ${e.stopLoss ?? '—'} · TP ${e.takeProfit ?? '—'} · score ${e.score ?? '—'}`;
    }
    return `<tr>
      <td>${fmtTime(e.ts)}</td>
      <td><strong>${e.pair || '—'}</strong></td>
      <td>${typ}</td>
      <td>${pnl}</td>
      <td>${pips}</td>
      <td>${reason}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="color:var(--muted)">Подій ще немає</td></tr>';
}

function renderLogs(lines) {
  const atBottom = els.logBox.scrollHeight - els.logBox.scrollTop - els.logBox.clientHeight < 40;
  els.logBox.innerHTML = (lines || []).map(({ ts, line }) => {
    let cls = 'line';
    if (line.includes('[err]') || line.toLowerCase().includes('error') || line.includes('EPERM')) cls += ' err';
    else if (line.includes('[fx-entry]')) cls += ' entry';
    else if (line.includes('[fx-exit]')) cls += ' exit';
    else if (line.includes('[fx-scan]')) cls += ' scan';
    else if (line.includes('[fx-skip]') || line.includes('[fx-state]')) cls += ' skip';
    else if (line.includes('[supervisor]')) cls += ' sup';
    return `<div class="${cls}">[${fmtTime(ts)}] ${escapeHtml(line)}</div>`;
  }).join('') || '<div class="line" style="color:var(--muted)">Логи з’являться після запуску worker</div>';

  if (logStickBottom || atBottom) {
    els.logBox.scrollTop = els.logBox.scrollHeight;
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function testbotConv(a) {
  return a?.smart?.conviction ?? a?.score ?? 0;
}

function testbotEligible(a, minScore = 60) {
  if (testbotConv(a) < minScore) return false;
  if (a.action === 'BUY' || a.action === 'SELL') return true;
  return Boolean(a.setupDraft?.action);
}

function testbotExecAction(signalAction, invert = false) {
  if (!signalAction || signalAction === '—') return '—';
  if (!invert) return signalAction;
  return signalAction === 'BUY' ? 'SELL' : signalAction === 'SELL' ? 'BUY' : signalAction;
}

function renderTestbot(state, control) {
  const tb = state?.testbot;
  const minScore = tb?.minScore ?? 60;
  const pairCdMin = Math.round((tb?.pairCooldownMs ?? 300000) / 60000);
  const invert = tb?.invertDirection === true;
  const online = isWorkerOnline(state, control);

  if (!tb?.enabled) {
    els.tbAnalysisKv.innerHTML = statChip('Статус', 'Testbot вимкнено (FX_TESTBOT_ENABLED=1)', 'skip');
    els.tbPairsTableWrap.innerHTML = '';
    els.tbLiveBody.innerHTML = '<p class="live-empty">Увімкни FX_TESTBOT_ENABLED=1 на worker</p>';
    return;
  }

  const opens = tb.openPositionsLive || [];
  const maxOpen = tb.maxOpenPositions ?? 20;
  els.tbSlotsLabel.textContent = `${opens.length}/${maxOpen} sim`;

  if (!opens.length) {
    els.tbLiveBody.innerHTML = '<p class="live-empty">Немає відкритих sim-угод</p>';
  } else {
    els.tbLiveBody.innerHTML = opens.map((p) => {
      const sideCls = p.side === 'short' ? 'sell' : 'buy';
      const u = p.unrealizedPnlUsd;
      const uCls = u > 0 ? 'positive' : u < 0 ? 'negative' : '';
      const tgt = p.targetUsd ?? 1;
      const part = p.partialUsd ?? 0.5;
      return `<article class="live-pos-card">
        <div class="live-pos-head"><strong>${p.pair}</strong> <span class="value ${sideCls}">${p.side}</span></div>
        <div class="live-pos-grid">
          <span>Entry</span><span>${p.entry ?? '—'}</span>
          <span>Mark</span><span>${p.mark ?? '—'}</span>
          <span>U/P</span><span class="${uCls}">${u != null ? `$${u.toFixed(2)}` : '—'}</span>
          <span>Ціль</span><span>$${tgt} · $${part}@${p.ageSec ?? 0}s</span>
          <span>Conv</span><span>${p.entryConviction ?? '—'}</span>
        </div>
      </article>`;
    }).join('');
  }

  const risk = tb.risk || {};
  els.tbAccountKv.innerHTML = [
    kvRow('Режим', 'Sim (окремо від Capital)'),
    kvRow('Equity', `$${Number(risk.equityUsd ?? 1000).toFixed(0)}`),
    kvRow('P/L всього', fmtUsd(tb.journal?.totalPnlUsd)),
  ].join('');

  els.tbRiskKv.innerHTML = [
    kvRow('P/L сьогодні', fmtUsd(risk.dailyPnlUsd ?? tb.journal?.todayPnlUsd)),
    kvRow('Входів сьогодні', risk.tradesToday ?? tb.journal?.todayEntries ?? 0),
    kvRow('Відкрито', `${opens.length}/${maxOpen}`),
    kvRow('Ліміт/день', '∞'),
  ].join('');

  const j = tb.journal || {};
  els.tbJournalKv.innerHTML = [
    kvRow('Закрито', j.totalClosed ?? 0),
    kvRow('W / L', `${j.wins ?? 0} / ${j.losses ?? 0}`),
    kvRow('Total P/L', fmtUsd(j.totalPnlUsd)),
  ].join('');

  const list = state?.lastAnalyses?.length ? state.lastAnalyses : [];
  const eligible = list.filter((a) => testbotEligible(a, minScore));
  const openPairs = new Set(opens.map((p) => p.pair));

  const partialMin = Math.round((tb.partialAfterMs ?? 600000) / 60000);
  const oracle = tb.oracle;
  const oracleHit = oracle?.directionHitPct;
  const oracleCls = oracle?.calibrationOk === false ? 'skip' : oracle?.samples >= 30 ? 'buy' : 'watch';
  els.tbAnalysisKv.innerHTML = online
    ? [
      statChip('Готові', eligible.length, eligible.length ? 'buy' : 'skip'),
      statChip('Min conv', minScore),
      statChip('Pair CD', `${pairCdMin}хв`, 'watch'),
      statChip('Target', `$${tb.targetUsd ?? 1}`, 'buy'),
      statChip('Max SL', `$${tb.maxStopLossUsd ?? 10}+comm`, 'skip'),
      statChip('Partial', `$${tb.partialUsd ?? 0.5} / ${partialMin}хв`, 'watch'),
      statChip('Sim open', `${opens.length}/${maxOpen}`),
      oracle ? statChip('ORACLE hit', oracleHit != null ? `${oracleHit}%` : '—', oracleCls) : '',
    ].join('')
    : statChip('Статус', 'Worker offline', 'skip');

  if (els.tbOracleKv) {
    if (!oracle) {
      els.tbOracleKv.innerHTML = statChip('ORACLE-5', 'вимкнено (FX_ORACLE_5M=1)', 'skip');
      if (els.tbOracleTable) els.tbOracleTable.innerHTML = '<tr><td colspan="6" style="color:var(--muted)">ORACLE вимкнено</td></tr>';
    } else {
      els.tbOracleKv.innerHTML = [
        statChip('Зразків', oracle.samples ?? 0, oracleCls),
        statChip('Hit rate', oracleHit != null ? `${oracleHit}%` : '—', oracleCls),
        statChip('Brier', oracle.brier != null ? oracle.brier.toFixed(3) : '—', 'watch'),
        statChip('MAE pips', oracle.avgErrorPips != null ? oracle.avgErrorPips : '—', 'watch'),
        statChip('Gate', oracle.tradeAllowed ? 'PASS' : 'BLOCK', oracle.tradeAllowed ? 'buy' : 'skip'),
      ].join('');
      const actuals = oracle.lastActuals || [];
      if (els.tbOracleTable) {
        els.tbOracleTable.innerHTML = actuals.length
          ? actuals.map((a) => `<tr>
            <td>${fmtTime(a.reconciledAt || a.t0)}</td>
            <td>${a.pair || '—'}</td>
            <td>${a.forecastMid_5m ?? '—'}</td>
            <td>${a.actualMid_5m ?? '—'}</td>
            <td>${a.pUp != null ? `${(a.pUp * 100).toFixed(0)}%` : '—'}</td>
            <td class="value ${a.directionHit ? 'buy' : 'sell'}">${a.directionHit ? '✓' : '✗'}</td>
          </tr>`).join('')
          : '<tr><td colspan="6" style="color:var(--muted)">Ще немає reconcile (+5 хв після прогнозу)</td></tr>';
      }
    }
  }

  const sorted = list.slice().sort((a, b) => testbotConv(b) - testbotConv(a));
  els.tbPairsTableWrap.innerHTML = sorted.length ? `<table>
    <thead><tr><th>Пара</th><th>Conv</th><th>Testbot</th><th>Дія orig</th><th>Ціна</th></tr></thead>
    <tbody>${sorted.slice(0, 24).map((a) => {
    const conv = testbotConv(a);
    const ok = testbotEligible(a, minScore);
    const draft = a.setupDraft?.action;
    const signalAction = ok ? (a.action === 'BUY' || a.action === 'SELL' ? a.action : draft) : '—';
    const execAction = testbotExecAction(signalAction, invert);
    const isOpen = openPairs.has(a.pair);
    const rowCls = ok && !isOpen ? 'tb-row-ready' : isOpen ? 'row-open' : '';
    const execCls = execAction === 'BUY' ? 'buy' : execAction === 'SELL' ? 'sell' : 'skip';
    return `<tr class="${rowCls}">
      <td>${a.pair}${isOpen ? ' <span class="open-tag">SIM</span>' : ''}</td>
      <td>${conv}<span class="score-sub">/${minScore}</span></td>
      <td class="value ${ok ? execCls : 'skip'}" title="${invert && signalAction !== '—' ? `аналіз ${signalAction} → ордер ${execAction}` : ''}">${isOpen ? 'OPEN' : execAction}${invert && signalAction !== '—' && !isOpen ? `<span class="act-sub">←${signalAction}</span>` : ''}</td>
      <td>${a.action}${draft && a.action === 'SKIP' ? ` (${draft})` : ''}</td>
      <td>${a.quote?.mid ?? '—'}</td>
    </tr>`;
  }).join('')}</tbody></table>` : '';

  const events = (j.lastEvents || []).slice().reverse();
  els.tbJournalTable.innerHTML = events.map((ev) => {
    const pnl = ev.type === 'exit' ? fmtUsd(ev.pnlUsd) : '—';
    const typ = ev.type === 'exit' ? ev.exitReason || 'exit' : 'entry';
    const orc = ev.oracle5m
      ? `${ev.oracle5m.direction} ${(ev.oracle5m.pUp * 100).toFixed(0)}%→${ev.oracle5m.forecastMid_5m}`
      : '';
    const reason = ev.exitReason || (ev.type === 'entry' ? (orc || 'open') : '—');
    return `<tr>
      <td>${fmtTime(ev.ts || ev.closedAt || ev.openedAt)}</td>
      <td>${ev.pair || '—'}</td>
      <td>${typ}</td>
      <td>${ev.score ?? ev.entryConviction ?? '—'}</td>
      <td>${pnl}</td>
      <td>${escapeHtml(reason)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="color:var(--muted)">Ще немає угод</td></tr>';
}

function initPanelTabs() {
  if (!els.panelTabs) return;
  els.panelTabs.querySelectorAll('.panel-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      els.panelTabs.querySelectorAll('.panel-tab').forEach((b) => b.classList.toggle('active', b === btn));
      els.tabLive?.classList.toggle('hidden', tab !== 'live');
      els.tabTestbot?.classList.toggle('hidden', tab !== 'testbot');
    });
  });
}

async function refresh() {
  try {
    const [health, control, journal, learning, logs, calendar, capital] = await Promise.all([
      api('/health'),
      api('/control/status'),
      api('/journal?limit=30'),
      api('/learning'),
      api('/control/logs?limit=200'),
      api('/calendar').catch(() => null),
      api('/capital/status').catch((e) => e.body || { connected: false, error: e.message }),
    ]);
    const journalSummary = normalizeJournalSummary(journal.summary, journal.events);
    const state = enrichStateWithJournal(
      mergeState(await api('/state')),
      journalSummary,
    );

    setStatus(control, health);
    renderAnalysis(state, calendar, control);
    renderPulse(state);
    renderLivePosition(state);
    renderRisk(state);
    renderBroker(capital, state, health);
    renderJournal(journalSummary);
    renderLearning(learning);
    renderJournalTable(journal.events);
    renderLogs(logs.lines);
    renderTestbot(state, control);
  } catch (e) {
    toast(`Помилка: ${e.message}`);
  }
}

els.btnStart.addEventListener('click', async () => {
  try {
    const control = await api('/control/status');
    if (control.mode === 'managed' || control.externalWorkerLikely) {
      toast('Worker вже працює');
      await refresh();
      return;
    }
    const url = '/control/worker/start?force=1';
    const r = await api(url, { method: 'POST' });
    toast(r.ok ? `Worker запущено (PID ${r.pid})` : (r.error || 'Помилка'));
    await refresh();
  } catch (e) {
    if (e.status === 409 || e.body?.externalPid) {
      toast('Worker вже працює — статус оновлено');
      await refresh();
      return;
    }
    toast(e.message);
  }
});

els.btnStop.addEventListener('click', async () => {
  try {
    const r = await api('/control/worker/stop', { method: 'POST' });
    toast(r.ok ? 'Worker зупинено' : r.error);
    await refresh();
  } catch (e) {
    toast(e.message);
  }
});

els.btnLearnDry.addEventListener('click', async () => {
  try {
    const r = await api('/learning/run?dryRun=1', { method: 'POST' });
    const wr = r.metrics?.count ? `WR ${r.metrics.winRate}%` : 'WR —';
    toast(`${wr} · ${r.notes?.join('; ') || 'Learning dry-run готово'}`);
    await refresh();
  } catch (e) {
    toast(e.message);
  }
});

els.btnLearn.addEventListener('click', async () => {
  if (!confirm('Застосувати learning і зберегти learned-params.json?')) return;
  try {
    const r = await api('/learning/run', { method: 'POST' });
    toast(r.applied ? 'Параметри оновлено' : (r.notes?.[0] || 'Без змін'));
    await refresh();
  } catch (e) {
    toast(e.message);
  }
});

els.btnLearnPause.addEventListener('click', async () => {
  if (learningPaused) {
    if (!confirm('Зняти learning-паузу і дозволити нові входи?')) return;
    try {
      const r = await api('/learning/resume', { method: 'POST' });
      toast(r.ok ? 'Паузу знято — торгівля дозволена' : 'Не вдалося');
      await refresh();
    } catch (e) {
      toast(e.message || 'Помилка — перезайдіть у панель');
    }
    return;
  }
  if (!confirm('Поставити learning-паузу? Нові входи буде заблоковано.')) return;
  try {
    const r = await api('/learning/pause', { method: 'POST', body: JSON.stringify({ reason: 'вручну з панелі' }) });
    toast(r.ok ? 'Паузу встановлено' : 'Не вдалося');
    await refresh();
  } catch (e) {
    toast(e.message || 'Помилка — перезайдіть у панель');
  }
});

els.btnJournalClear.addEventListener('click', async () => {
  if (!confirm('Очистити журнал і статистику?\n\nСтара історія збережеться у backup. Worker перезапуститься.')) return;
  try {
    const r = await api('/journal/clear', { method: 'POST' });
    toast(r.message || 'Журнал очищено');
    await refresh();
  } catch (e) {
    toast(e.message || 'Не вдалося очистити журнал');
  }
});

if (els.btnTbFlipOn) {
  els.btnTbFlipOn.addEventListener('click', async () => {
    if (!confirm('Увімкнути FLIP на testbot?\n\ninvert ON · TP $3 · SL $3 · partial $1.5\n(risk% / units без змін)\n\nРекомендовано потім очистити журнал.')) return;
    try {
      const r = await api('/testbot/settings', {
        method: 'POST',
        body: JSON.stringify({ preset: 'flip' }),
      });
      toast(r.message || 'Flip увімкнено');
      await refresh();
    } catch (e) {
      toast(e.message || 'Не вдалося увімкнути flip (потрібен redeploy API)');
    }
  });
}

if (els.btnTbJournalClear) {
  els.btnTbJournalClear.addEventListener('click', async () => {
    if (!confirm('Очистити testbot журнал, sim-баланс і статистику?\n\nBackup збережеться. Відкриті sim-позиції будуть скинуті.')) return;
    try {
      let r = await api('/testbot/clear', { method: 'POST' });
      toast(r.message || 'Testbot очищено');
      await refresh();
    } catch (e) {
      if (e.status === 409) {
        const msg = e.body?.error || e.message || 'Є відкриті sim-позиції';
        if (!confirm(`${msg}. Примусово скинути все?`)) return;
        try {
          const r = await api('/testbot/clear?force=1', { method: 'POST' });
          toast(r.message || 'Testbot очищено');
          await refresh();
        } catch (err) {
          toast(err.message || 'Не вдалося очистити testbot');
        }
        return;
      }
      toast(e.message || 'Не вдалося очистити testbot');
    }
  });
}

els.btnRefresh.addEventListener('click', refresh);

const btnLogout = document.getElementById('btnLogout');
if (btnLogout) btnLogout.addEventListener('click', () => window.FxAuth?.logout());

els.logBox.addEventListener('scroll', () => {
  logStickBottom = els.logBox.scrollHeight - els.logBox.scrollTop - els.logBox.clientHeight < 40;
});

refresh();
initPanelTabs();
setInterval(refresh, 5000);
