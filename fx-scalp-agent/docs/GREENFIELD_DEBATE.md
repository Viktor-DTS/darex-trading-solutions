# Greenfield FX Bot Debate — 3 AI Projects

> Дата: 14.07.2026  
> Контекст: Capital.com demo ~$1000, fx-scalp-agent live journal  
> Мета: обрати **повний rewrite**, не env-тюнінг

---

## 1. Autopsy — вся історія угод

### Закриті угоди (журнал)

| Дата | Пара | P/L | Pips | Причина | Score |
|------|------|-----|------|---------|-------|
| 10.07 | EURTRY | -$4.72 | -4.7 | stop | 68 |
| 10.07 | GBPUSD | -$3.35 | -3.3 | stop | 72 |
| 13.07 | USDJPY | -$3.35 | -3.3 | stop | 74 |
| 13.07 | EURUSD | +$0.65 | +0.7 | profit_decay | 72 |
| 13.07 | EURUSD | +$1.15 | +1.2 | profit_decay | 77 |
| 13.07 | AUDUSD | +$0.45 | +0.5 | profit_decay | 77 |
| 13.07 | USDCHF | +$0.45 | +0.5 | profit_decay | 70 |
| 13.07 | GBPUSD | -$3.95 | -3.9 | conv_decay | 75 |
| 13.07 | USDCHF | -$0.35 | -0.3 | time_scratch | 71 |
| 13.07 | NZDUSD | -$1.95 | -1.9 | conv_decay | 78 |
| 13.07 | AUDUSD | -$2.35 | -2.3 | time_scratch | 78 |
| 13.07 | EURUSD | -$1.55 | -1.5 | stop (short) | 75 |
| 13.07 | EURNOK | -$0.03 | 0 | take_profit | — |
| 13.07 | USDNOK | -$0.05 | 0 | take_profit | — |
| 14.07 | GBPUSD | -$4.35 | -4.3 | stop (short) | 75 |

### Підсумок

| Метрика | Значення |
|---------|----------|
| Закритих | **15** |
| Перемоги (P/L > 0) | **4** (усі `profit_decay`) |
| Збитки | **11** |
| **WR** | **27%** |
| Сума перемог | **+$2.70** |
| Сума збитків | **≈ −$26.00** |
| **Net P/L** | **≈ −$23.30** (~−2.3% equity) |
| Avg win | **+$0.68** (~0.8p) |
| Avg loss | **−$2.36** (~2.5p) |
| **Loss/Win ratio** | **3.5 : 1** |

### Root cause (усі 3 агенти згодні)

```
Ефективний R:R ≈ 0.57 : 1  (avg win / avg loss у pip)
Break-even WR потрібен ≈ 64%
Реальний WR = 27%
```

**Головний механізм збитку:** `profit_decay` закриває на **+0.5p**, SL добігає **−3…−4p**.  
**Score 70–78 не передбачає результат** — GBPUSD 3× loser, score 75 → SL за 90с.

---

## 2. Три greenfield-проєкти

### PROJECT ALPHA — LIQUIDITY SNAPBACK (GPT)

| | |
|--|--|
| **Теза** | Mean-reversion після overreaction-імпульсу, не trend-chase |
| **Сигнал** | VWAP deviation + ATR impulse + M1 rejection candle + RSI(2) |
| **R:R** | TP1 1R (50%) + TP2 2.2R (50%), SL за екстремум імпульсу |
| **Mgmt** | **Без** profit_decay / conv_decay |
| **Пари** | 6 мажорів, overlap 07–16 UTC |
| **Угод/день** | 1.5–3 |
| **Очікуваний PF** | 1.2–1.45 |
| **Dev** | 8 тижнів MVP |
| **Confidence** | **8.5/10** |
| **Слабкість** | Mean-reversion губиться в trend days |

### PROJECT BRAVO — VELES (Claude)

| | |
|--|--|
| **Теза** | Не прогнозувати напрямок — торгувати **vol expansion** + order-flow proxy |
| **Сигнал** | Realized vol percentile + range breakout + tick-rule OFI + meta-sizer (логрег) |
| **R:R** | Динамічний ATR, min **1:1.8**, cost gate ≥3× spread |
| **Mgmt** | ATR trailing only, **видалити** idealFormula + positionMonitor |
| **Пари** | 3–4 з correlation matrix |
| **Угод/день** | 2–4 |
| **Очікуваний PF** | ≥1.3 місяць 2, ≥1.5 місяць 3 |
| **Dev** | **90 днів** rollout |
| **Confidence** | **5.5/10** (чесно — retail CFD edge слабкий) |
| **Слабкість** | Складність, OFI на retail feed обмежений |

### PROJECT CHARLIE — Структурна Ліквідність (Pragmatist)

| | |
|--|--|
| **Теза** | London **liquidity sweep** — sweep рівня + confirm bar |
| **Сигнал** | Структура ринку (prev day H/L, round numbers), не Ideal Formula |
| **R:R** | SL **4.5p**, TP **10–15p**, net R:R ≥ **2:1**, BE WR **33%** |
| **Mgmt** | SL / BE / TP only — 3 правила |
| **Пари** | Dynamic top-3 за spread+ADX |
| **Угод/день** | 4–6 у вікні London open |
| **Dev** | **9–10 тижнів** MVP |
| **CTO vote** | **CHARLIE** як найшвидший path to fix math |
| **Wildcard DELTA** | Copy verified managers якщо всі 3 fail після 200 trades |

---

## 3. Порівняльна таблиця (15 критеріїв)

| Критерій | Поточний бот | ALPHA | BRAVO | CHARLIE |
|----------|-------------|-------|-------|---------|
| Edge clarity | 3/10 | **9/10** | 7/10 | 8/10 |
| Dev cost (тижні) | — | 8 | **12** | 9 |
| Capital.com fit | 5/10 | 8/10 | 6/10 | **8/10** |
| Fixes R:R math | ❌ | ✅ | ✅ | ✅ |
| Removes profit_decay | ❌ | ✅ | ✅ | ✅ |
| New signal code | ❌ | ✅ | ✅✅ | ✅ |
| Backtest honest | ❌ | walk-forward | event-replay | structure rules |
| Trades/day | 10–15 | 2–3 | 2–4 | 4–6 |
| Min WR needed | **64%** | ~48% | ~45% | **~33%** |
| Profit potential | 2/10 | 8/10 | 6/10 | 7/10 |
| Overfit risk | HIGH | medium | medium | **low** |
| Reuse capitalClient | — | partial | **high** | partial |
| Delete idealFormula | — | yes | **yes** | yes |
| Sample to validate | 15 ❌ | 250 OOS | 80–150 | **200** |
| Honest PF expectation | <0.8 | 1.2–1.4 | 1.3–1.5 | 1.1–1.3 |

---

## 4. Дебат — хто кого атакує

### ALPHA vs BRAVO
- ALPHA: breakout на retail = false breaks; BRAVO over-engineered для $1000
- BRAVO: mean-reversion карається trend days; ALPHA лишає monolithic scoring

### ALPHA vs CHARLIE
- ALPHA: CHARLIE вузьке вікно = concentration risk
- CHARLIE: ALPHA все ще багато параметрів на імпульсі

### BRAVO vs CHARLIE
- BRAVO: structure sweeps = crowded retail pattern
- CHARLIE: OFI/meta-ML = overfit на 15 угодах

### Усі троє vs поточний бот
> **idealFormula + profit_decay — це не стратегія, це машина зрізання прибутку.**

---

## 5. Scoring rubric — як обрати переможця

Після **5 днів shadow** + **90 днів demo** оцінюємо:

| Gate | Мінімум | Fail action |
|------|---------|-------------|
| Profit Factor | ≥ **1.2** | stop project |
| Expectancy/trade | > **$0** | redesign signal |
| Max DD | < **8%** | reduce risk |
| Sample size | ≥ **80** trades | continue collecting |
| Avg win / avg loss | ≥ **1.5** | fix exits |
| % profit_decay exits | **0%** | confirm mgmt off |

---

## 6. Рекомендація модератора (Composer)

### Фаза 0 — негайно (без rewrite)
Зупинити кровотечу поки будується новий бот:
```
FX_POSITION_MGMT=0
FX_SCALP_MODE=0
FX_STOP_PIPS=5
FX_TARGET_PIPS=8
FX_PAIRS=EURUSD,GBPUSD,USDJPY
```

### Фаза 1 — паралельний shadow (2 тижні)
Запустити **3 shadow workers** (log-only) з різними сигналами — без реальних ордерів.

### Фаза 2 — обрати 1 переможця (тиждень 3–4)
За таблицею gate → почати MVP rewrite.

### Мій голос як CTO
| Пріоритет | Проєкт | Чому |
|-----------|--------|------|
| 🥇 | **CHARLIE** | Найшвидше ламає математику R:R, простий сигнал, аудитований |
| 🥈 | **ALPHA** | Найвищий confidence, добрий backtest plan |
| 🥉 | **BRAVO** | Найглибший, але 90 днів і найнижча confidence |

---

## 7. Наступний крок (обери)

**✅ Обрано: CHARLIE** — MVP реалізовано (`FX_SIGNAL_ENGINE=charlie`, див. `docs/CHARLIE_MVP.md`)

- **`CHARLIE`** — liquidity sweep bot (active)
- **`ALPHA`** — snapback bot  
- **`BRAVO`** — VELES event-driven
- **`SHADOW`** — 3 профілі shadow 2 тижні
- **`STOP`** — фаза 0 env only

---

*Згенеровано AI Debate Panel: GPT (ALPHA), Claude (BRAVO), Claude (CHARLIE), синтез Composer.*
