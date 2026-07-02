/**
 * Вибір найкращих BUY-кандидатів за finalScore (і R:R) у межах вільних слотів.
 */

function normSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function compareBuyCandidates(a, b) {
  const scoreDiff = (b.finalScore ?? 0) - (a.finalScore ?? 0);
  if (scoreDiff !== 0) return scoreDiff;
  const rrDiff = (b.riskReward ?? 0) - (a.riskReward ?? 0);
  if (rrDiff !== 0) return rrDiff;
  return (b.technicalScore ?? 0) - (a.technicalScore ?? 0);
}

/**
 * @param {object[]} signals — після risk/sim sizing
 * @param {object} settings
 * @param {number} openCount — відкриті + pending
 * @param {Set<string>} occupiedSymbols — символи з активною позицією
 */
function rankAndSelectBuyCandidates(signals, settings, openCount, occupiedSymbols = new Set()) {
  const maxOpen = settings.maxOpenPositions ?? 2;
  const slots = Math.max(0, maxOpen - openCount);

  const buyCandidates = signals
    .filter((s) => s.action === 'BUY')
    .filter((s) => !occupiedSymbols.has(normSymbol(s.symbol)))
    .sort(compareBuyCandidates);

  const selected = new Set(buyCandidates.slice(0, slots).map((s) => normSymbol(s.symbol)));
  const selectedList = buyCandidates.slice(0, slots).map((s) => s.symbol);
  const rankBySymbol = new Map();
  buyCandidates.forEach((s, idx) => {
    rankBySymbol.set(normSymbol(s.symbol), idx + 1);
  });

  let selectedCount = 0;
  let demotedCount = 0;

  const ranked = signals.map((sig) => {
    if (sig.action !== 'BUY') return sig;

    const sym = normSymbol(sig.symbol);
    const rank = rankBySymbol.get(sym) ?? null;

    if (occupiedSymbols.has(sym)) {
      demotedCount += 1;
      return {
        ...sig,
        action: 'HOLD',
        buyRank: rank,
        selectedForEntry: false,
        reason: `${sig.reason}; вже є відкрита позиція по ${sig.symbol}`,
      };
    }

    if (slots <= 0) {
      demotedCount += 1;
      return {
        ...sig,
        action: 'HOLD',
        buyRank: rank,
        selectedForEntry: false,
        reason: `${sig.reason}; ліміт позицій ${maxOpen} — немає вільних слотів`,
      };
    }

    if (selected.has(sym)) {
      selectedCount += 1;
      return {
        ...sig,
        buyRank: rank,
        selectedForEntry: true,
        reason: `${sig.reason}; ✅ топ-${rank} для входу`,
      };
    }

    demotedCount += 1;
    const picked = selectedList.length ? selectedList.join(', ') : '—';
    return {
      ...sig,
      action: 'HOLD',
      buyRank: rank,
      selectedForEntry: false,
      reason: `${sig.reason}; сильніші: ${picked} (ранг #${rank ?? '?'})`,
    };
  });

  return {
    signals: ranked,
    stats: {
      buyCandidates: buyCandidates.length,
      slotsAvailable: slots,
      selectedCount,
      demotedCount,
      selectedSymbols: selectedList,
    },
  };
}

module.exports = {
  rankAndSelectBuyCandidates,
  compareBuyCandidates,
};
