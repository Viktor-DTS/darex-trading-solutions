/**
 * Regime gate + layer lamps for dashboard.
 */
function checkRegimeGreenLight(marketRegime, layers, side) {
  if (!marketRegime?.tradeAllowed || marketRegime.marketRegime !== 'trend') {
    return { ok: false, reason: marketRegime?.reason || 'не trend' };
  }

  if (marketRegime.h1Trend) {
    const h1Ok = (side === 'long' && marketRegime.h1Trend === 'up')
      || (side === 'short' && marketRegime.h1Trend === 'down');
    if (!h1Ok) {
      return { ok: false, reason: '1h проти 5m напрямку' };
    }
  }

  const macroOk = layers.macro?.aligned;
  const strongLocal = layers.h1?.aligned && layers.m5?.aligned && layers.m1?.aligned;
  const fundEdge = layers.macro?.fundamental?.edge ?? layers.macro?.edge ?? 0;

  if (!macroOk && !strongLocal) {
    return { ok: false, reason: 'macro off і локальні шари слабкі' };
  }
  if (fundEdge < -0.2 && !strongLocal) {
    return { ok: false, reason: `fund edge ${fundEdge} проти side` };
  }

  return { ok: true, reason: macroOk ? 'macro+trend' : 'strong local 3/3' };
}

function buildLamps(layers) {
  return {
    macro: !!layers.macro?.aligned,
    h1: !!layers.h1?.aligned,
    m5: !!layers.m5?.aligned,
    m1: !!layers.m1?.aligned,
  };
}

module.exports = { checkRegimeGreenLight, buildLamps };
