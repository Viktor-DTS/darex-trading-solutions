# DUAL BOT DEBATE — 22.07.2026

> Live ~07:23 UTC+3 · Worker ON · Learning **PAUSE** («11 losses in row») · Today entries **0**

## Snapshot

| Bot | Closed | W/L | PnL | Dominant exits |
|-----|--------|-----|-----|----------------|
| CHARLIE | 28 | 2/26 | **−$31.42** | `time_scratch` 24, `conv_decay` 3 |
| Testbot | 38 | 11/27 | **−$69.40** | `time_exit` 15, `stop_usd` 12, `partial_usd` 6, `protect_green` 2 |
| Oracle | 200 | hit **54%** | MAE 1.83p | GBPJPY 86% · USDCAD 78% · GBPNZD 12% · NZDUSD 25% |

Попередній патч (early partial / protect green) **працює** (є `partial_usd`/`protect_green`), але не перекриває `time_exit`+`stop_usd`.

---

## Раунд агентів

### LENS (журнал)
> CHARLIE майже не доживає до TP: scratch ріже −$0.5…−$1.7. EURUSD −$11.83 scratch — outlier.  
> Testbot: банк малих плюсів є, але хвост `time_exit` −$1…−$4 і повні `stop_usd` −$5…−$6 з’їдають edge.  
> Сьогодні обидва мовчать: learning pause + MATH BLOCK `micro SL < 3×M1`.

### THETA (math)
> Soft `MICRO_BARS=1.0` уже в render, але блок іде з **`mathMicroMinM1=3`** (окремий check).  
> При SL ~4.5p і типовому M1 range ~1.5–2p умова `SL < 3×M1` майже завжди fail → «Готові: 0» при conv 80+.

### ORACLE-5
> Глобальні 54% ≈ монетка; **по парах дисперсія величезна**.  
> Треба pair-edge раніше (toxicMinTrades↓, minPairHit↑) — не торгувати GBPNZD/NZDUSD при hit <45%.

### MGMT
> CHARLIE: scratch без peak-guard — ріже навіть після мікро-прогресу.  
> Testbot: після 8–10хв у −$1.5…−$3 краще `cut_stale`, ніж чекати −$5 stop або `time_exit` −$4.

### LEARN
> Auto-pause після 4 consecutive losses занадто агресивний при scratch-режимі (штучні серії).  
> Підняти поріг / env, інакше live стоїть тижнями.

### SYNTH — вердикт (імплемент)

1. **CHARLIE `FX_MATH_MICRO_M1=1.0`** — зняти головний MATH BLOCK.  
2. **Scratch softer + peak guard:** loss scratch 8хв / −1.5p; no-progress 12хв; не scratch якщо peak ≥ progress.  
3. **Testbot `cut_stale`:** ≥8хв і net ≤ −$1.5 і peak < earlyPartial → close.  
4. **Oracle pair-edge:** toxicMinTrades=6, minPairHit=0.48, toxicWr=0.38.  
5. **Testbot quality:** pUp≥0.58, κ≥0.50.  
6. **Learning:** maxConsecutiveLosses pause ≥ 8 (env).  
7. **Модулі (нові / підсилені):** `PAIR_EDGE`, `CUT_STALE`, `SCRATCH_PEAK_GUARD`, `MICRO_M1_SCALP`.

**Не чіпати:** Flip OFF, $5/$5, ALLOW_DRAFT=0, QUALITY_LOCK=1.

**Успіх 24–48h:** CHARLIE entries >0 після unpause; scratch-ratio <60%; testbot time_exit частка ↓; oracle-торгові пари з hit ≥48%.
