# МАНДАТ: прибутковість + прогноз ціни кожної пари на +5 хв

> **Дата видачі:** 16.07.2026  
> **Хто замовив:** власник капіталу (DTS / FX Scalp)  
> **Статус:** **ОБОВʼЯЗКОВИЙ ДО ВИКОНАННЯ** — усі наступні AI-раунди кодять лише в рамках цього мандату, поки KPI не виконані.  
> **Контекст провалу:** testbot **238W→2/236L (−$738)** → flip **~28 угод ~4W/24L (мінус)** → миттєві `stop_usd`, conviction 68–84 не predictive.

---

## 0. Наказ замовника (дослівний сенс)

```
Модифікувати бота так, щоб була ПРИБУТКОВІСТЬ.
AI можуть робити що завгодно (архітектура, інверсія, фільтри, моделі, вимкнення flip).
Але бот ПОВИНЕН «точно знати» прогноз валютних пар:
  — будь-яка пара з журналу;
  — на горизонті +5 хвилин від моменту рішення;
  — перед кожним входом у sim/live.
```

**Це не побажання — це контракт на приймання.**

---

## 1. Що означає «точно знати ціну через 5 хв»

### 1.1 Заборона на брехню

| Заборонено казати | Дозволено вимагати в коді |
|-------------------|---------------------------|
| «Ми передбачимо close до піпса» | **Калібрований прогноз** з довірчим інтервалом |
| «100% точність FX» | **P(напрям) > порогу** + перевірка на факті |
| Торгувати без прогнозу в журналі | **Кожен entry** має запис `oracle5m` |

### 1.2 Операційне визначення ORACLE-5

У момент `t₀` (перед entry) для пари `P` бот **зобовʼязаний** обчислити та зберегти:

```json
{
  "pair": "NZDUSD",
  "t0": "2026-07-16T06:35:42.000Z",
  "horizonSec": 300,
  "spotMid": 0.61234,
  "forecastMid_5m": 0.61251,
  "forecastBid_5m": 0.61248,
  "forecastAsk_5m": 0.61254,
  "band_p10": 0.61210,
  "band_p90": 0.61290,
  "pUp": 0.63,
  "pDown": 0.37,
  "pHitTpBeforeSl": 0.58,
  "direction": "up",
  "confidence": 0.71,
  "models": { "gbm": 0.61, "mc": 0.64, "ou": 0.59, "kalman": 0.66 },
  "kappa": 0.82,
  "microOk": true,
  "session": "london",
  "features": { "H": 0.48, "sigma_5m": 0.00012, "spreadPips": 1.2 }
}
```

**«Знати» = мати цей обʼєкт + через 5 хв записати факт:**

```json
{
  "pair": "NZDUSD",
  "t0": "...",
  "actualMid_5m": 0.61244,
  "errorPips": 0.7,
  "directionHit": true,
  "oracleId": "..."
}
```

Без пари `oracle5m` на entry → **entry заборонений** (hard gate).

### 1.3 Мінімальна якість прогнозу (rolling, не разова угода)

На ковзному вікні **останніх 200 прогнозів** (або 48 год sim):

| Метрика | Мінімум | Baseline для перемоги |
|---------|---------|------------------------|
| **Direction hit rate** (знак Δmid) | **≥ 55%** | > 50% (монетка) |
| **Brier score** `pUp` vs факт up | **< 0.24** | < 0.25 (naive) |
| **MAE** mid у pips (major) | **< 1.5× median ATR(5m)/2** | < naive drift=0 |
| **Calibration** | \|avg(pUp) − freq(up)\| **< 8%** | — |

Якщо ORACLE-5 не бʼє baseline — **торгівля вимикається**, не «крутимо risk%».

---

## 2. Мета прибутковості (головний KPI)

Testbot (sim) — **полігон**. Live CHARLIE — лише після pass sim.

### 2.1 Gate A — прогноз (обовʼязковий)

- [ ] ORACLE-5 на **кожній** парі з `testbot-trades.jsonl` при кожному entry
- [ ] `oracle-actual.jsonl` — зіставлення прогноз/факт кожні 5 хв
- [ ] Панель: колонка **«Прогноз 5m / Факт / Hit»** по останніх угодах

### 2.2 Gate B — прибутковість sim (обовʼязковий)

На **нових** 100+ угодах після впровадження (стара −$738 не рахується):

| KPI | Поріг pass |
|-----|------------|
| Win rate | **≥ 52%** при симетричному $TP/$SL |
| Profit factor | **≥ 1.25** |
| Expectancy / угода | **> +$0.15** |
| Max consecutive losses | **≤ 8** |
| Rolling 24h P/L | **≥ 0** у ≥ 70% торгових днів |

### 2.3 Gate C — anti-токсичність журналу

Автоматично **не входити**, якщо для пари за 7 днів:

- WR < 40% **і** ≥ 10 угод, або
- instant `stop_usd` rate > 50%, або
- ORACLE direction hit < 50% на цій парі

Пари з журналу з токсичним профілем (пріоритет blacklist з факту):

`NZDUSD`, `NZDCAD`, `USDCAD` — до pass ORACLE на них окремо.

---

## 3. Що AI **можуть** змінювати (повна свобода в межах мандату)

| Дозволено | Приклад |
|-----------|---------|
| Будь-які моделі прогнозу | GBM, MC, OU, HMM, Kalman, XGB на features, ensemble |
| Полярність | invert ON/OFF/auto по rolling edge |
| Виходи | TP/SL $, partial, time stop, micro-gate |
| Фільтри входу | conv, Θ, ORACLE-5, сесія, новини, pair CD |
| Вимкнути flip | якщо invert гірший за oracle-direction |
| Нові файли/сервіси | `services/oracle/*` |
| Журнали | `oracle-forecasts.jsonl`, `oracle-actual.jsonl` |
| Панель | блок ORACLE-5 live |

| Заборонено без окремого дозволу | Чому |
|----------------------------------|------|
| Live CHARLIE з новим oracle до pass Gate B | капітал |
| Обіцяти 100% ціну | шахрайство / overfit |
| Піднімати risk% щоб «відіграти» | смерть рахунку |
| Торгувати без запису oracle на entry | порушення контракту |

---

## 4. Архітектура (канонічний план — AI не вигадують з нуля)

### 4.1 Модулі (створити)

```
services/oracle/
  oracle5m.js          # головний API: forecast(pair, bars, quote, levels) → Oracle5m
  features.js          # σ, H, J, spread, session, tick velocity, OU κ
  ensemble.js          # зважена суміш моделей → pUp, forecastMid, bands
  calibration.js       # online Brier, reliability bins, auto threshold
  reconcile.js         # t0+5m: actual vs forecast → oracle-actual.jsonl
  journalReplay.js     # offline: прогноз на кожен entry з jsonl → чи був би profit
  gate.js              # allowEntry(analysis, oracle) → { ok, reason }
```

### 4.2 Інтеграція (обовʼязкові точки)

1. **`worker/index.js`** — перед `prepareTestbotAnalysis()`:
   ```js
   const oracle = await forecastOracle5m(pair, snap, candidate, cfg);
   if (!oracle.ok) { log [tb-skip] oracle; continue; }
   if (!oracleGateAllows(oracle, candidate, cfg)) { continue; }
   // append oracle to entry payload
   ```

2. **`services/testbot/runner.js`** — `invert` лише якщо `cfg.oracleRespectInvert === true` **і** oracle погоджується; інакше напрямок = **oracle.direction**.

3. **`services/analyzer/charlie/index.js`** — після pass sim: той самий `oracle5m` (зараз лише Θ).

4. **`api/server.js`** — `GET /oracle/forecasts?limit=100`, `GET /oracle/stats`

5. **`dashboard/app.js`** — секція **ORACLE-5 · 5m forecast vs fact**

6. **Cron / worker tick** — `reconcileOracleActuals()` кожні 30–60 с для відкритих прогнозів віком 5 хв.

### 4.3 Джерела даних

| Джерело | Горизонт | Для чого |
|---------|----------|----------|
| M1/M5 bars (≥3h) | локальна σ, H, drift | ensemble |
| WS quote bid/ask | spread, micro | instant stop fix |
| `testbot-trades.jsonl` | ground truth exits | replay, blacklist |
| `oracle-actual.jsonl` | calibration | thresholds |

---

## 5. Алгоритм ORACLE-5 (мінімальна формула — розширювати дозволено)

**Вхід:** `S₀` mid, bars M5 (≥36), M1 (≥60), spread, side candidate, TP/SL geometry.

**Кроки:**

1. **Features** з 3h: `μ̂`, `σ̂`, `H`, `J`, Parkinson vol, Kalman drift, median bar range.
2. **Три шляхи до ціни +5m:**
   - **A)** GBM: `E[S] = S₀ exp(μΔt)`, quantiles `p10/p90`
   - **B)** Bootstrap MC на log-returns (≥500 paths)
   - **C)** OU якщо `κ > κ_min` (mean-reversion)
3. **Ensemble:** `forecastMid = weighted median(A,B,C)`, `pUp = weighted avg`.
4. **Friction:** зсув на half-spread + slippage pip.
5. **Barrier check:** `pHitTpBeforeSl` (існуючий Θ / barrier.js).
6. **kappa** = 1 − std(pUp across models).
7. **ENTER** лише якщо:
   ```
   pUp > 0.55 (long) або pUp < 0.45 (short)
   AND pHitTpBeforeSl > 0.52
   AND kappa > 0.55
   AND microOk (stop ≥ 1.5× median M5 range)
   AND pair not toxic-blacklisted
   ```

**Invert flip-режим:** якщо `invertDirection` суперечить `oracle.direction` → **SKIP** (не «грати проти oracle»).

---

## 6. Протокол перевірки (AI здають роботу лише з цим)

### 6.1 Offline (перед deploy)

```bash
node scripts/oracle-replay.js --journal data/testbot-trades.jsonl --horizon 300
```

Звіт обовʼязково містить:

- direction hit % по **кожній парі з журналу**
- hypothetical PnL якби входили **тільки коли oracle згоден**
- порівняння: raw signal / invert / oracle-only / always-skip

### 6.2 Online (після deploy)

- 24h: ≥ 50 прогнозів з reconcile
- 7d: Gate A + Gate B
- Панель: зелений блок «ORACLE pass» або червоний «BLOCKED — calibration fail»

### 6.3 Rollback

Якщо rolling 30 угод WR < 45% **або** oracle hit < 52%:

- `FX_ORACLE_TRADE=0` (прогнози логуються, входи стоп)
- алерт у лог + панель

---

## 7. Панель агентів (наступний дебат → код)

| # | Агент | Відповідальність |
|---|-------|------------------|
| 1 | **ORACLE** | синтез мандату, thresholds |
| 2 | **NOVA** | expectancy, KPI math |
| 3 | **LENS** | replay на jsonl, pair toxicity |
| 4 | **ORBIT** | stochastic ensemble |
| 5 | **KALMAN** | online μ, σ |
| 6 | **ATLAS** | microstructure / instant stop |
| 7 | **PIXEL** | ML тільки якщо бʼє baseline на walk-forward |
| 8 | **FORGE** | bid/ask forecast, execution |
| 9 | **ECHO** | session / news veto |
| 10 | **SAGE** | rollback, capital guard |
| 11 | **FLUX** | invert vs oracle polarity |
| 12 | **PRISM** | 5m horizon calibration |

**Порядок імплементації (не міняти):**

```
P0  oracle5m.js + oracle-forecasts.jsonl + gate на testbot
P1  reconcile.js + oracle-actual.jsonl + stats API
P2  journalReplay.js + pair blacklist auto
P3  panel ORACLE block
P4  offline pass Gate A на 200+ replay points
P5  sim 100 угод → Gate B
P6  (лише після B) CHARLIE live oracle gate
```

---

## 8. Env (пропозиція)

```env
FX_ORACLE_5M=1
FX_ORACLE_HORIZON_SEC=300
FX_ORACLE_MIN_P_UP=0.55
FX_ORACLE_MIN_KAPPA=0.55
FX_ORACLE_MIN_P_TP=0.52
FX_ORACLE_TRADE=1
FX_ORACLE_RESPECT_INVERT=0
FX_ORACLE_LOG=data/oracle-forecasts.jsonl
FX_ORACLE_ACTUAL_LOG=data/oracle-actual.jsonl
FX_ORACLE_TOXIC_WR=0.40
FX_ORACLE_TOXIC_MIN_TRADES=10
```

---

## 9. Одне речення для будь-якого AI

> **Не входь, поки не можеш записати в журнал калібрований прогноз mid через 5 хв і поки rolling точність напрямку та прибутковість sim не бʼють монетку та старий мінусовий edge; роби що хочеш у коді, але факти в `oracle-actual.jsonl` — єдиний суддя.**

---

## 10. Звʼязок з попередніми дебатами

| Документ | Статус після мандату |
|----------|----------------------|
| `TESTBOT_FLIP_DEBATE.md` | invert — **підчинений** oracle.direction |
| `FORECAST_MATH_DEBATE.md` | Θ — **компонент** ORACLE-5, не окремий gate |
| `CAPITAL_HUNT_DEBATE.md` | pulse лишається для universe; entry = oracle |
| `MATH_PATH_GATE.md` | merge в `services/oracle/ensemble.js` |

---

*Видав: аналіз live журналу 16.07.2026. Наступний крок AI: **P0 — код `oracle5m.js` + hard gate testbot**.*
