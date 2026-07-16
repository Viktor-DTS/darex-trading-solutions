# PROJECT CHARLIE — MVP → v2

Structural liquidity sweep bot for London session (**07:00–10:00 UTC**).

## Enable

```env
FX_SIGNAL_ENGINE=charlie
FX_PAIRS=EURUSD,GBPUSD,USDJPY,AUDUSD,USDCAD,USDCHF
FX_POSITION_MGMT=0
FX_SCALP_MODE=0
FX_CHARLIE_STOP_PIPS=4.5
FX_CHARLIE_TARGET_MIN=10
FX_CHARLIE_TARGET_MAX=15
FX_CHARLIE_SESSION_END=10:00
FX_CHARLIE_SKIP_STATIC_BLACKOUT=1
FX_CHARLIE_REQUIRE_MSS=1
FX_CHARLIE_FVG_ENTRY=1
FX_CHARLIE_DYNAMIC_TP=1
FX_CHARLIE_SHADOW_LOG=1
FX_CHARLIE_DXY_BIAS=1
```

## Signal logic (v2)

1. **Levels:** PDH/PDL, Asian H/L (configurable window), EQL/EQH, round numbers
2. **Daily bias:** DXY + PD/Asian premium-discount — sweep must align with bias
3. **Sweep:** M5 wick beyond level (0.5–2.5p), reclaim
4. **MSS:** Market Structure Shift within 5 bars (or strong displacement)
5. **FVG entry:** prefer 50% CE; market fallback
6. **R:R:** SL beyond sweep extreme; TP = opposite Asian extreme (or 10–15p)
7. **Pairs:** dynamic top-3 by spread + ADX; correlation cluster caps
8. **Dedup:** same level/day setup id — no re-entry for 4h

## Exits / risk

- SL / BE / TP only (`FX_POSITION_MGMT=0`)
- Breakeven at +4p
- Session stop after 3 SL same UTC day
- Max 1 EUR / 1 GBP cluster open

## Shadow log

All analyses → `data/charlie_setups.jsonl` (BUY/SELL/SKIP/WATCH + features).

## Backtest

```bash
npm run backtest:charlie
npm run backtest:charlie -- EURUSD GBPUSD
```

## Files

| Module | Role |
|--------|------|
| `charlie/levels.js` | PDH/PDL, Asian, EQL, rounds |
| `charlie/bias.js` | Daily bias + DXY |
| `charlie/mss.js` | MSS + displacement |
| `charlie/fvg.js` | FVG mid entry + Asian TP |
| `charlie/sweep.js` | Sweep detector |
| `charlie/pairRank.js` | Top-3 ranking |
| `charlie/correlation.js` | Cluster caps |
| `charlie/setupJournal.js` | Shadow log |
| `charlie/index.js` | `analyzePairCharlie()` |

## Rollback

```env
FX_SIGNAL_ENGINE=ideal
```

## Validation gates

| Metric | Target |
|--------|--------|
| Profit Factor | ≥ 1.2 |
| Avg win / avg loss | ≥ 1.5 |
| Sample | ≥ 80 trades |
| profit_decay exits | 0% |

See also: `docs/CHARLIE_DEBATE_11AI.md`
