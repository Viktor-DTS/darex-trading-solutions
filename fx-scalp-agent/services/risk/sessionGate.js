/**
 * Session + side gates from win/loss debate (04.08.2026).
 * Testbot: London bank window. CHARLIE: skip dead Asian hour.
 */

function parseHmToMins(raw, fallbackMins) {
  if (raw == null || String(raw).trim() === '') return fallbackMins;
  const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallbackMins;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return fallbackMins;
  return h * 60 + min;
}

function utcMins(now = new Date()) {
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

/** Inclusive start, exclusive end. Supports wrap past midnight. */
function inUtcWindow(now, startMins, endMins) {
  const m = utcMins(now);
  if (startMins === endMins) return true;
  if (startMins < endMins) return m >= startMins && m < endMins;
  return m >= startMins || m < endMins;
}

function testbotSessionGate(cfg = {}, now = new Date()) {
  if (cfg.sessionGate === false || process.env.FX_TESTBOT_SESSION_GATE === '0') {
    return { ok: true, reason: 'session gate off' };
  }
  const start = parseHmToMins(
    cfg.sessionStartUtc ?? process.env.FX_TESTBOT_SESSION_START_UTC,
    11 * 60,
  );
  const end = parseHmToMins(
    cfg.sessionEndUtc ?? process.env.FX_TESTBOT_SESSION_END_UTC,
    15 * 60,
  );
  if (!inUtcWindow(now, start, end)) {
    const hh = String(Math.floor(start / 60)).padStart(2, '0');
    const mm = String(start % 60).padStart(2, '0');
    const hh2 = String(Math.floor(end / 60)).padStart(2, '0');
    const mm2 = String(end % 60).padStart(2, '0');
    return {
      ok: false,
      reason: `outside testbot session ${hh}:${mm}–${hh2}:${mm2} UTC`,
      start,
      end,
    };
  }
  return { ok: true, reason: 'in session', start, end };
}

/** CHARLIE: skip toxic Asian dead hour (default 03:00–04:00 UTC). */
function charlieSessionGate(cfg = {}, now = new Date()) {
  if (cfg.asianSkip === false || process.env.FX_CHARLIE_ASIAN_SKIP === '0') {
    return { ok: true, reason: 'asian skip off' };
  }
  const start = parseHmToMins(
    cfg.asianSkipStartUtc ?? process.env.FX_CHARLIE_ASIAN_SKIP_START,
    3 * 60,
  );
  const end = parseHmToMins(
    cfg.asianSkipEndUtc ?? process.env.FX_CHARLIE_ASIAN_SKIP_END,
    4 * 60,
  );
  if (inUtcWindow(now, start, end)) {
    return {
      ok: false,
      reason: `charlie asian skip ${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}–${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')} UTC`,
    };
  }
  return { ok: true, reason: 'ok' };
}

/**
 * Long-bias: shorts only when oracle strongly down (pUp ≤ shortMaxPUp).
 * Without oracle → allow long only if requireOracle !== false and bias on.
 */
function longBiasAllows(side, oracle, cfg = {}) {
  const enabled = cfg.longBias !== false && process.env.FX_LONG_BIAS !== '0';
  if (!enabled) return { ok: true, reason: 'long bias off' };
  if (side !== 'short') return { ok: true, reason: 'long ok' };

  const shortMax = Number.isFinite(cfg.shortMaxPUp)
    ? cfg.shortMaxPUp
    : (Number(process.env.FX_SHORT_MAX_P_UP) || 0.35);
  const minKappa = Number.isFinite(cfg.shortMinKappa)
    ? cfg.shortMinKappa
    : (Number(process.env.FX_SHORT_MIN_KAPPA) || 0.55);

  if (!oracle?.ok && oracle?.pUp == null) {
    return { ok: false, reason: 'long-bias: short blocked (no oracle)' };
  }
  if (oracle.pUp > shortMax) {
    return {
      ok: false,
      reason: `long-bias: short needs pUp≤${(shortMax * 100).toFixed(0)}% (have ${(oracle.pUp * 100).toFixed(1)}%)`,
    };
  }
  if (oracle.kappa != null && oracle.kappa < minKappa) {
    return {
      ok: false,
      reason: `long-bias: short κ=${oracle.kappa.toFixed(2)} < ${minKappa}`,
    };
  }
  return { ok: true, reason: 'short allowed (strong down)' };
}

module.exports = {
  parseHmToMins,
  utcMins,
  inUtcWindow,
  testbotSessionGate,
  charlieSessionGate,
  longBiasAllows,
};
