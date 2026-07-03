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
  analysisReason: $('analysisReason'),
  riskKv: $('riskKv'),
  journalKv: $('journalKv'),
  learningKv: $('learningKv'),
  logBox: $('logBox'),
  journalTable: $('journalTable'),
  toast: $('toast'),
};

let logStickBottom = true;

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
  els.pairLabel.textContent = health?.pair || 'EURUSD';

  if (mode === 'managed') {
    els.statusBadge.className = 'badge running';
    els.statusBadge.textContent = 'Працює (панель)';
    els.btnStart.disabled = true;
    els.btnStop.disabled = false;
  } else if (mode === 'external') {
    els.statusBadge.className = 'badge external';
    els.statusBadge.textContent = 'Працює (зовні)';
    els.btnStart.disabled = true;
    els.btnStop.disabled = true;
  } else {
    els.statusBadge.className = 'badge stopped';
    els.statusBadge.textContent = 'Зупинено';
    els.btnStart.disabled = false;
    els.btnStop.disabled = true;
  }

  const parts = [];
  if (control.pid) parts.push(`PID ${control.pid}`);
  if (control.tickCount != null) parts.push(`ticks ${control.tickCount}`);
  if (control.lastStateUpdate) parts.push(`state ${fmtTime(control.lastStateUpdate)}`);
  els.metaLine.textContent = parts.join(' · ');
}

function renderAnalysis(state) {
  const a = state?.lastAnalysis;
  if (!a || state.worker === 'offline') {
    els.analysisKv.innerHTML = kvRow('Статус', 'Worker offline', 'skip');
    els.analysisReason.textContent = state?.hint || 'Натисніть «Запустити worker»';
    return;
  }

  const actionCls = a.action === 'BUY' ? 'buy' : a.action === 'WATCH' ? 'watch' : 'skip';
  els.analysisKv.innerHTML = [
    kvRow('Дія', a.action, actionCls),
    kvRow('Score', a.score),
    kvRow('Regime', a.regime),
    kvRow('Ціна', a.quote?.mid ?? a.quote?.bid),
    kvRow('Spread', `${a.spreadPips ?? '—'} pips`),
    kvRow('Stop / TP', `${a.stopPips}/${a.targetPips} pips`),
    kvRow('minBuyScore', a.minBuyScore),
  ].join('');
  els.analysisReason.textContent = a.reason || '';
}

function renderRisk(state) {
  const r = state?.risk;
  const open = state?.openTrade;
  let html = [
    kvRow('P/L сьогодні', fmtUsd(r?.dailyPnlUsd)),
    kvRow('Угод сьогодні', r?.tradesToday ?? 0),
    kvRow('Пауза ризику', r?.tradingPaused ? 'ТАК' : 'ні', r?.tradingPaused ? 'paused' : ''),
  ].join('');

  if (open) {
    html += kvRow('Відкрита поз.', `${open.pair} @ ${open.entry}`, 'buy');
    html += kvRow('SL / TP', `${open.stopLoss} / ${open.takeProfit}`);
  }
  els.riskKv.innerHTML = html;
}

function renderJournal(summary) {
  const s = summary || {};
  els.journalKv.innerHTML = [
    kvRow('Закрито', s.totalClosed ?? 0),
    kvRow('Wins / Losses', `${s.wins ?? 0} / ${s.losses ?? 0}`),
    kvRow('Total P/L', fmtUsd(s.totalPnlUsd)),
  ].join('');
}

function renderLearning(l) {
  if (!l || !l.minBuyScore) {
    els.learningKv.innerHTML = kvRow('Статус', 'Дефолтні параметри', 'skip');
    return;
  }
  els.learningKv.innerHTML = [
    kvRow('minBuyScore', l.minBuyScore),
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
  const rows = (events || []).slice().reverse().slice(0, 25);
  els.journalTable.innerHTML = rows.map((e) => {
    const pnl = e.type === 'exit' ? fmtUsd(e.pnlUsd) : '—';
    const pips = e.pips != null ? e.pips : '—';
    const reason = e.exitReason || (e.type === 'entry' ? `score ${e.score}` : '—');
    return `<tr>
      <td>${fmtTime(e.ts)}</td>
      <td>${e.type}</td>
      <td>${pnl}</td>
      <td>${pips}</td>
      <td>${reason}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" style="color:var(--muted)">Подій ще немає</td></tr>';
}

function renderLogs(lines) {
  const atBottom = els.logBox.scrollHeight - els.logBox.scrollTop - els.logBox.clientHeight < 40;
  els.logBox.innerHTML = (lines || []).map(({ ts, line }) => {
    let cls = 'line';
    if (line.includes('[err]') || line.toLowerCase().includes('error')) cls += ' err';
    if (line.includes('[supervisor]')) cls += ' sup';
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
    const [health, control, state, journal, learning, logs] = await Promise.all([
      api('/health'),
      api('/control/status'),
      api('/state'),
      api('/journal?limit=30'),
      api('/learning'),
      api('/control/logs?limit=200'),
    ]);

    setStatus(control, health);
    renderAnalysis(state);
    renderRisk(state);
    renderJournal(journal.summary || state?.journal);
    renderLearning(learning);
    renderJournalTable(journal.events);
    renderLogs(logs.lines);
  } catch (e) {
    toast(`Помилка: ${e.message}`);
  }
}

els.btnStart.addEventListener('click', async () => {
  try {
    const r = await api('/control/worker/start', { method: 'POST' });
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
setInterval(refresh, 3000);
