function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let prev = sma(values.slice(0, period), period);
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function atr(bars, period = 14) {
  if (bars.length <= period) return null;
  const trs = [];
  for (let i = bars.length - period; i < bars.length; i += 1) {
    const cur = bars[i];
    const prevClose = bars[i - 1]?.close ?? cur.close;
    trs.push(Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prevClose),
      Math.abs(cur.low - prevClose),
    ));
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

function adx(bars, period = 14) {
  if (bars.length < period * 2) return null;
  const plusDm = [];
  const minusDm = [];
  const tr = [];
  for (let i = 1; i < bars.length; i += 1) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
    const cur = bars[i];
    const prevClose = bars[i - 1].close;
    tr.push(Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prevClose),
      Math.abs(cur.low - prevClose),
    ));
  }
  const n = period;
  let smTr = tr.slice(0, n).reduce((a, b) => a + b, 0);
  let smPlus = plusDm.slice(0, n).reduce((a, b) => a + b, 0);
  let smMinus = minusDm.slice(0, n).reduce((a, b) => a + b, 0);
  let adxVal = null;
  for (let i = n; i < tr.length; i += 1) {
    smTr = smTr - smTr / n + tr[i];
    smPlus = smPlus - smPlus / n + plusDm[i];
    smMinus = smMinus - smMinus / n + minusDm[i];
    const diPlus = smTr > 0 ? (100 * smPlus) / smTr : 0;
    const diMinus = smTr > 0 ? (100 * smMinus) / smTr : 0;
    const dx = diPlus + diMinus > 0 ? (100 * Math.abs(diPlus - diMinus)) / (diPlus + diMinus) : 0;
    adxVal = adxVal == null ? dx : (adxVal * (n - 1) + dx) / n;
  }
  return adxVal;
}

module.exports = { sma, ema, rsi, atr, adx };
