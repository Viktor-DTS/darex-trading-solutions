const { fetchYahooChart } = require('./tradingMarketData');

function regimeFromVix(vix) {
  if (vix == null || Number.isNaN(vix)) return 'unknown';
  if (vix >= 28) return 'risk_off';
  if (vix >= 22) return 'elevated';
  return 'risk_on';
}

function externalScoreFromRegime(regime) {
  if (regime === 'risk_on') return 75;
  if (regime === 'elevated') return 55;
  if (regime === 'risk_off') return 30;
  return 50;
}

async function fetchMacroSnapshot() {
  const notes = [];
  let vix = null;
  let us10y = null;

  try {
    const vixChart = await fetchYahooChart('^VIX', '5d', '1d');
    vix = vixChart.lastPrice;
  } catch (e) {
    notes.push(`VIX недоступний: ${e.message}`);
  }

  try {
    const tnx = await fetchYahooChart('^TNX', '1mo', '1d');
    us10y = tnx.lastPrice;
  } catch (e) {
    notes.push(`US10Y недоступний: ${e.message}`);
  }

  const regime = regimeFromVix(vix);
  const externalScore = externalScoreFromRegime(regime);

  const blockNewEntries = regime === 'risk_off';
  const blockReason = blockNewEntries ? 'VIX високий — режим RISK_OFF' : null;

  if (regime === 'elevated') {
    notes.push('VIX підвищений — зменшений ризик на угоду');
  }

  return {
    vix: vix != null ? Math.round(vix * 100) / 100 : null,
    us10y: us10y != null ? Math.round(us10y * 100) / 100 : null,
    regime,
    externalScore,
    sentimentScore: regime === 'risk_off' ? 40 : 55,
    blockNewEntries,
    blockReason,
    macroNotes: notes,
    fetchedAt: new Date(),
  };
}

module.exports = {
  fetchMacroSnapshot,
  regimeFromVix,
  externalScoreFromRegime,
};
