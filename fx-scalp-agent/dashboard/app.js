const $ = (id) => document.getElementById(id);

const els = {
  statusBadge: $('statusBadge'),
  metaLine: $('metaLine'),
  pairLabel: $('pairLabel'),
  btnStart: $('btnStart'),
  btnStop: $('btnStop'),
  btnLearnDry: $('btnLearnDry'),
  btnLearn: $('btnLearn'),
  btnRefresh: $('btnRefresh'),
  analysisKv: $('analysisKv'),
  pairsTableWrap: $('pairsTableWrap'),
  analysisReason: $('analysisReason'),
  formulaKv: $('formulaKv'),
  factorsWrap: $('factorsWrap'),
  riskKv: $('riskKv'),
  journalKv: $('journalKv'),
  learningKv: $('learningKv'),
  livePositionBody: $('livePositionBody'),
  livePositionCard: $('livePositionCard'),
  liveSlotsLabel: $('liveSlotsLabel'),
  logBox: $('logBox'),
  journalTable: $('journalTable'),
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

  const nextJournalOpen = next.journal?.openCount;
  const prevTrades = prev.openTrades?.length ?? 0;
  const nextTrades = next.openTrades?.length ?? 0;

  if (next.journal?.openTrades != null && nextJournalOpen != null) {
    out.openTrades = nextJournalOpen > 0
      ? next.journal.openTrades.map((e) => ({
        pair: e.pair,
        side: e.side || 'long',
        entry: e.entry,
        stopLoss: e.stopLoss,
        takeProfit: e.takeProfit,
        openedAt: e.openedAt,
        score: e.score,
        regime: e.regime,
      }))
      : [];
    out.openTrade = out.openTrades[0] ?? null;

    const liveByPair = new Map((next.openPositionsLive || prev.openPositionsLive || []).map((l) => [l.pair, l]));
    const openPairs = new Set(out.openTrades.map((t) => t.pair));
    out.openPositionsLive = out.openTrades.map((t) => liveByPair.get(t.pair) || {
      pair: t.pair,
      side: t.side || 'long',
      entry: t.entry,
      mark: null,
      stopLoss: t.stopLoss,
      takeProfit: t.takeProfit,
      score: t.score,
    });
    out.openPositionLive = out.openPositionsLive[0] ?? null;
  } else if (nextTrades === 0 && prevTrades > 0) {
    out.openTrades = prev.openTrades;
    out.openTrade = prev.openTrades[0] ?? null;
    out.openPositionsLive = prev.openPositionsLive ?? [];
    out.openPositionLive = prev.openPositionsLive?.[0] ?? null;
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
  const out = { ...state };
  const openTrades = (journalSummary.openTrades || []).map((e) => ({
    pair: e.pair,
    side: e.side || 'long',
    entry: e.entry,
    stopLoss: e.stopLoss,
    takeProfit: e.takeProfit,
    openedAt: e.openedAt,
    score: e.score,
    regime: e.regime,
  }));

  out.openTrades = openTrades;
  out.openTrade = openTrades[0] ?? null;

  const liveByPair = new Map((state.openPositionsLive || []).map((l) => [l.pair, l]));
  out.openPositionsLive = openTrades.map((t) => liveByPair.get(t.pair) || {
    pair: t.pair,
    side: t.side || 'long',
    entry: t.entry,
    mark: null,
    stopLoss: t.stopLoss,
    takeProfit: t.takeProfit,
    score: t.score,
  });
  out.openPositionLive = out.openPositionsLive[0] ?? null;
  out.journal = { ...(state.journal || {}), ...journalSummary };
  return out;
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

async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
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
    els.statusBadge.className = 'badge external';
    els.statusBadge.textContent = 'Зовнішній worker';
    els.btnStart.disabled = false;
    els.btnStart.textContent = '▶ Запустити worker (панель)';
    els.btnStop.disabled = true;
    els.externalBanner.classList.remove('hidden');
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

function isWorkerOnline(state) {
  if (!state || state.worker === 'offline') return false;
  if (!state.updatedAt) {
    return Boolean(state.tickCount || state.openPositionLive || state.openPositionsLive?.length);
  }
  return Date.now() - new Date(state.updatedAt).getTime() < 60000;
}

function getOpenCount(state) {
  if (state?.openTrades?.length) return state.openTrades.length;
  if (state?.openPositionsLive?.length) return state.openPositionsLive.length;
  if (state?.openTrade || state?.openPositionLive) return 1;
  return state?.journal?.openCount ?? 0;
}

function getOpenPairs(state) {
  const pairs = new Set();
  for (const t of state?.openTrades || []) pairs.add(t.pair);
  for (const t of state?.openPositionsLive || []) pairs.add(t.pair);
  if (state?.openTrade?.pair) pairs.add(state.openTrade.pair);
  if (state?.openPositionLive?.pair) pairs.add(state.openPositionLive.pair);
  for (const t of state?.journal?.openTrades || []) pairs.add(t.pair);
  return pairs;
}

function renderAnalysis(state, calendarApi) {
  const list = state?.lastAnalyses?.length
    ? state.lastAnalyses
    : state?.lastAnalysis
      ? [state.lastAnalysis]
      : [];

  if (!isWorkerOnline(state)) {
    els.analysisKv.innerHTML = statChip('Статус', 'Worker offline', 'skip');
    els.pairsTableWrap.innerHTML = '';
    els.analysisReason.textContent = state?.hint || 'Натисніть «Запустити worker»';
    renderFormula(null, []);
    return;
  }

  if (!list.length) {
    els.analysisKv.innerHTML = statChip('Статус', 'Оновлення…', 'watch');
    els.pairsTableWrap.innerHTML = '';
    els.analysisReason.textContent = 'Чекаємо перший цикл аналізу (~5 с)';
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
    const actionCls = actionClass(best.action);
    els.analysisKv.innerHTML = [
      statChip('Сигнал', best.pair, actionCls),
      statChip('Дія', best.action, actionCls),
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

  els.pairsTableWrap.innerHTML = `<table>
    <thead><tr><th>Пара</th><th>Дія</th><th>Conv</th><th>Market</th><th>Layers</th><th>Ціна</th></tr></thead>
    <tbody>${list.map((a) => {
    const cls = actionClass(a.action);
    const isOpen = openPairs.has(a.pair);
    const rowCls = isOpen ? 'row-open' : '';
    const layers = renderLamps(a.smart, a.layerEval);
    const alt = a.altSignal
      ? `<div class="alt-signal" title="${escapeHtml(a.altSignal.reason || '')}">↔ ${a.altSignal.action} conv ${a.altSignal.score ?? '—'}${a.altSignal.entryMode === 'htf' ? ' HTF' : ''}</div>`
      : '';
    return `<tr class="${rowCls}">
      <td>${a.pair}${isOpen ? ' <span class="open-tag">OPEN</span>' : ''}</td>
      <td class="value ${cls}">${a.action}${alt}</td>
      <td>${scoreLabel(a)}</td>
      <td>${a.marketRegime || a.regime}</td>
      <td>${layers}</td>
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

function renderRisk(state) {
  const r = state?.risk;
  const opens = state?.openTrades?.length
    ? state.openTrades
    : state?.openPositionsLive?.length
      ? state.openPositionsLive
      : state?.openTrade
        ? [state.openTrade]
        : state?.journal?.openTrades || [];
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

function renderLearning(l) {
  if (!l || !l.minBuyScore) {
    els.learningKv.innerHTML = kvRow('Статус', 'Дефолтні параметри', 'skip');
    return;
  }
  els.learningKv.innerHTML = [
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

async function refresh() {
  try {
    const [health, control, journal, learning, logs, calendar] = await Promise.all([
      api('/health'),
      api('/control/status'),
      api('/journal?limit=30'),
      api('/learning'),
      api('/control/logs?limit=200'),
      api('/calendar').catch(() => null),
    ]);
    const journalSummary = normalizeJournalSummary(journal.summary, journal.events);
    const state = enrichStateWithJournal(
      mergeState(await api('/state')),
      journalSummary,
    );

    setStatus(control, health);
    renderAnalysis(state, calendar);
    renderLivePosition(state);
    renderRisk(state);
    renderJournal(journalSummary);
    renderLearning(learning);
    renderJournalTable(journal.events);
    renderLogs(logs.lines);
  } catch (e) {
    toast(`Помилка: ${e.message}`);
  }
}

els.btnStart.addEventListener('click', async () => {
  try {
    const control = await api('/control/status');
    if (control.mode === 'managed') {
      toast('Worker вже працює через панель');
      return;
    }
    let force = false;
    if (control.mode === 'external') {
      const ok = confirm(
        'Зовнішній worker (Cursor/термінал) ще активний.\n\n'
        + 'Панель зупинить його і запустить СВІЙ worker.\n\n'
        + 'Продовжити?',
      );
      if (!ok) return;
      force = true;
    }
    const url = force ? '/control/worker/start?force=1' : '/control/worker/start';
    const r = await api(url, { method: 'POST' });
    toast(r.ok ? `Worker запущено (PID ${r.pid})` : r.error);
    await refresh();
  } catch (e) {
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
    toast(r.notes?.join('; ') || 'Learning dry-run готово');
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

els.btnRefresh.addEventListener('click', refresh);

els.logBox.addEventListener('scroll', () => {
  logStickBottom = els.logBox.scrollHeight - els.logBox.scrollTop - els.logBox.clientHeight < 40;
});

refresh();
setInterval(refresh, 2000);
