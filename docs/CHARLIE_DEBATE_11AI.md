# CHARLIE — Дебат 11 AI-агентів

> Дата: 14.07.2026  
> Об'єкт: `FX_SIGNAL_ENGINE=charlie` (MVP, commit `ea2071b`)  
> Мета: знайти слабкі місця, ідеї покращення аналізу, корисні джерела інформації для рішень бота

---

## Панель (11 агентів)

| # | Агент | Роль | Фокус |
|---|-------|------|-------|
| 1 | **ATLAS** | Structure Purist (ICT/SMC) | PDH/PDL, Judas, MSS, FVG |
| 2 | **NOVA** | Quant / Statistics | WR, PF, sample size, expectancy |
| 3 | **RIVEN** | Data Engineer | Capital WS, бари, таймзони |
| 4 | **SAGE** | Risk Manager | exposure, correlation, DD |
| 5 | **ECHO** | Macro Analyst | DXY, news, daily bias |
| 6 | **PIXEL** | ML / Meta-labeling | score calibration, learning |
| 7 | **FORGE** | Execution | spread, slippage, fill quality |
| 8 | **LENS** | Backtest Auditor | walk-forward, overfit, journal |
| 9 | **PRISM** | Session Timing | kill zones, macro windows |
| 10 | **FLUX** | Signal Designer | sweep logic, levels, confirm |
| 11 | **ORACLE** | Moderator / Synthesis | консенсус, пріоритети |

---

## Раунд 1 — Слабкі місця (кожен агент)

### 1. ATLAS (Structure Purist)
> *«CHARLIE називається liquidity sweep, але це лише 30% справжнього London Open playbook.»*

| # | Слабкість | Деталь |
|---|-----------|--------|
| A1 | **Немає Daily Bias** | ICT вимагає: sweep у **протилежному** напрямку до bias. Зараз бот бере і long, і short після будь-якого sweep. |
| A2 | **Немає MSS** | Підтвердження = лише 1 bullish/bearish M5 бар. Немає Market Structure Shift (пробій swing point). |
| A3 | **Немає FVG entry** | Вхід на ask/bid одразу після confirm. ICT входить у **50% Fair Value Gap** після displacement — краща ціна, менший SL. |
| A4 | **TP фіксований** | T1 має бути **протилежний Asian extreme**, не фікс 10–15p. |

### 2. NOVA (Quant)
> *«Математика R:R виправлена, але edge ще не доведений статистикою.»*

| # | Слабкість | Деталь |
|---|-----------|--------|
| N1 | **Score не калібрований** | `scoreSetup()` — ручні ваги (55 + bonuses). Немає зв'язку score → WR/PF на журналі. |
| N2 | **Нульовий sample** | CHARLIE щойно запущений. 15 старих угод — від Ideal Formula, не CHARLIE. |
| N3 | **Немає shadow log** | SKIP-и не пишуться в journal → не можна оцінити missed opportunities vs bad filters. |
| N4 | **Min score = 60** | Поріг взятий з дебату, не з даних. Може відсікає 80% valid setups або пропускає шум. |

### 3. RIVEN (Data Engineer)
> *«Garbage in — garbage out. Рівні залежать від якості барів.»*

| # | Слабкість | Деталь |
|---|-----------|--------|
| R1 | **PDH/PDL з H1** | `capitalH1Max=80` барів ≈ 3–4 дні. При 429/fallback на Yahoo — **різні джерела** для різних пар. |
| R2 | **Asian H/L UTC** | Asian = 00:00–07:00 UTC hardcoded. ICT Asian Range = **19:00–00:00 ET** (інший вікно!). |
| R3 | **M5 only** | Sweep детекція на M5, але найточніший Judas часто видно на M1. 12-хвилинний `analyzeGap` може пропустити sweep+confirm за 1 цикл. |
| R4 | **Немає bar completeness check** | Не перевіряється чи останній M5 бар **закритий** (forming bar vs closed bar). |

### 4. SAGE (Risk Manager)
> *«Одна угода — ок. Три одночасно — катастрофа.»*

| # | Слабкість | Деталь |
|---|-----------|--------|
| S1 | **Немає correlation filter** | EURUSD + GBPUSD + EURGBP можуть бути top-3 — це **один і той самий ризик** 3×. |
| S2 | **maxOpen=5** | CHARLIE max 2/cycle, але 5 open positions на корельованих парах = hidden leverage. |
| S3 | **Немає daily bias stop** | Якщо 3 SL поспіль на London sweep — бот продовжує торгувати (немає session stop). |
| S4 | **JPY limit = 1** | Добре, але USD exposure не рахується (3 пари з USD = triple USD risk). |

### 5. ECHO (Macro Analyst)
> *«Sweep без контексту долара — сліпий.»*

| # | Слабкість | Деталь |
|---|-----------|--------|
| E1 | **DXY filter вимкнений для CHARLIE** | Старий `FX_DXY_FILTER` не підключений до charlie analyzer. |
| E2 | **Немає economic calendar bias** | Є blackout, але немає **directional bias** від CPI/NFP/ECB (bullish/bearish day). |
| E3 | **London open blackout** | `newsBlackout.js` блокує **07:00–07:05 UTC** — саме пік Judas Swing! CHARLIE втрачає найкращі 5 хвилин. |
| E4 | **Немає prev day close context** | PDH/PDL без premium/discount (ціна вище/нижче equilibrium вчорашнього range). |

### 6. PIXEL (ML Engineer)
> *«Score — це heuristic, не model.»*

| # | Слабкість | Деталь |
|---|-----------|--------|
| P1 | **Немає feature vector** | Journal не зберігає: level kind, sweep depth, confirm body, ADX, hour — неможливо тренувати. |
| P2 | **Learning module відключений** | `tuner.js` / `paramsStore` працюють на Ideal Formula scores, не CHARLIE. |
| P3 | **Немає meta-labeling** | Primary signal (sweep) + secondary model (take/skip) — gold standard López de Prado, не реалізовано. |
| P4 | **Pair rank = 2 features** | spread + ADX. Немає: realized vol, sweep frequency, pair-specific WR. |

### 7. FORGE (Execution)
> *«Сигнал ≠ fill.»*

| # | Слабкість | Деталь |
|---|-----------|--------|
| F1 | **Market entry на confirm close** | Найгірша точка: спред розширений після displacement. Limit на FVG/retest краще. |
| F2 | **SL за sweep extreme + 0.5p** | На GBPUSD під час London open slippage на SL може бути 1–2p (вже бачили −4.3p). |
| F3 | **TP 10p fixed** | На Capital.com TP може не досягатись через spread widening у quiet hours. |
| F4 | **Немає partial TP** | ICT: 50% на T1 (Asian opposite), runner на T2. Зараз all-or-nothing. |

### 8. LENS (Backtest Auditor)
> *«Без backtest CHARLIE — це віра, не система.»*

| # | Слабкість | Деталь |
|---|-----------|--------|
| L1 | **Немає CHARLIE backtest** | `jobs/backtest.js` — Ideal Formula. Новий engine не тестується на історії. |
| L2 | **Немає event replay** | Sweep — event-driven. Потрібен replay M1/M5 per session, не bar-by-bar scoring. |
| L3 | **Journal не тегує engine** | Старі угоди без `signalEngine: charlie` — неможливо A/B порівняти. |
| L4 | **Немає setup ID** | Кожен sweep не має унікального ID → важко deduplicate re-entries на тому ж рівні. |

### 9. PRISM (Session Timing)
> *«07:00–11:00 UTC — занадто широко.»*

| # | Слабкість | Деталь |
|---|-----------|--------|
| T1 | **Kill zone = 07:00–10:00 UTC** | ICT London KZ = 02:00–05:00 ET ≈ **07:00–10:00 UTC** (DST). Остання година (10–11) — lower probability. |
| T2 | **Немає sub-windows** | Найвища ймовірність: 07:00–08:30 UTC (Judas + MSS). Після 09:30 — drift. |
| T3 | **Немає NY fallback** | Якщо London не дав sweep — NY AM KZ (13:30–16:00 UTC) теж valid (ALS strategy). |
| T4 | **Неділя/п'ятниця** | Friday London close + Sunday gap — окремі правила не реалізовані. |

### 10. FLUX (Signal Designer)
> *«Детектор sweep занадто простий — багато false positives.»*

| # | Слабкість | Деталь |
|---|-----------|--------|
| X1 | **Тільки 2-бар pattern** | sweepBar + confirmBar. Немає multi-bar sweep (3–5 bars accumulation). |
| X2 | **Proximity filter слабкий** | `distMid > proximityPips * 2` → skip. Але sweep може бути на рівні далеко від mid. |
| X3 | **Round numbers 50p** | Для EURUSD 1.14200 — ок. Для USDJPY крок 0.50 — занадто грубо (50 yen pips!). |
| X4 | **Немає equal highs/lows** | EQL/EQH — один з найсильніших liquidity pools, відсутній. |
| X5 | **Немає displacement check** | Confirm bar body ≥ 0.8p — замало. Немає вимоги до **impulse candle** (body > 60% range). |

### 11. ORACLE (Moderator) — початковий вердикт
> *«CHARLIE виправив математику старого бота, але поки що це **rule-based skeleton**, не повноцінний London sweep system.»*

**Топ-5 критичних слабкостей (голосування панелі):**

| Місце | ID | Слабкість | Голосів |
|-------|-----|-----------|---------|
| 🥇 | E3+A1 | London open blackout 07:00–07:05 + немає daily bias | 9/11 |
| 🥈 | A2+A3 | Немає MSS + FVG entry (вхід занадто рано) | 8/11 |
| 🥉 | R2 | Asian Range вікно неправильне (UTC vs ET) | 7/11 |
| 4 | S1 | Correlation filter відсутній | 7/11 |
| 5 | L1 | Немає backtest / shadow log | 6/11 |

---

## Раунд 2 — AI спілкуються між собою

```
ATLAS → FLUX:  «Твій confirm bar — це не MSS. Потрібен break of swing high/low 
                на M5 після sweep, не просто green candle.»

FLUX → ATLAS:  «Згоден. Пропоную: після sweep шукати swing break у 
                наступних 3–5 барах. Якщо немає — WATCH, не SKIP.»

ECHO → PRISM:  «Blackout 07:00–07:05 вбиває Judas. Для CHARLIE треба 
                 FX_NEWS_BLACKOUT_CHARLIE=0 або override london_open.»

PRISM → ECHO:  «Так, але CPI/NFP blackout лишаємо. Розділити static 
                 vs calendar blackouts.»

NOVA → PIXEL:  «Без feature logging ми сліпі. Додай в journal: 
                 level_kind, sweep_depth, confirm_body, hour_utc.»

PIXEL → NOVA:  «+ meta-label після 30 угод: P(win|features). 
                 До 30 — heuristic score.»

SAGE → RIVEN:  «Top-3 pairs по ADX — ок, але додай correlation matrix: 
                 max 1 EUR-cluster, max 1 GBP-cluster.»

RIVEN → SAGE:  «Correlation можна з H1 returns 24h. Вже є bars1h в hub.»

FORGE → ATLAS:  «FVG entry = limit order. Capital.com підтримує limit? 
                  Якщо ні — sim limit + market fallback.»

ATLAS → FORGE: «Якщо limit не fill за 2 M5 bars — skip. Не market chase.»

LENS → NOVA:   «Shadow log 2 тижні: записувати всі sweep candidates 
                 (включно з SKIP) в setups.jsonl. Потім replay.»

NOVA → LENS:   «+ рахувати theoretical P/L на shadow — 
                 "що було б якби входили".»
```

---

## Раунд 3 — Ідеї покращення аналізу (кожен агент)

### 1. ATLAS — Structure Upgrade
```
1. Daily Bias Module (charlie/bias.js):
   - Bullish: price < Asian EQ + DXY weak → expect SSL sweep → long
   - Bearish: mirror
   - Neutral: skip or reduce size 50%

2. MSS Detector (charlie/mss.js):
   - After sweep: find last M5 swing high/low (5-bar fractal)
   - Confirm = close beyond swing in sweep direction

3. FVG Entry (charlie/fvg.js):
   - Displacement candle after MSS creates gap
   - Entry at 50% CE of FVG (limit order)
   - SL beyond sweep wick; TP = opposite Asian extreme
```

### 2. NOVA — Statistical Layer
```
1. Shadow Journal (data/setups.jsonl):
   Every cycle: pair, levels, sweep detected Y/N, score, action, theoretical SL/TP

2. Score Calibration (after 50 trades):
   Bin scores 60-70, 70-80, 80+ → measured WR per bin → adjust minScore

3. Expectancy Dashboard:
   Panel block: CHARLIE-only WR, PF, avg R, sample size
```

### 3. RIVEN — Data Quality
```
1. Bar Close Guard:
   Ignore forming M5 bar if < 4 min old; use only closed bars for sweep

2. Asian Range Fix:
   Configurable: FX_CHARLIE_ASIAN_START=00:00 FX_CHARLIE_ASIAN_END=07:00
   Or ET-based: 00:00-05:00 ET (19:00-00:00 ET ICT style)

3. Source Tagging:
   Log dataSource per analysis; alert if >30% pairs on yahoo fallback

4. M1 Overlay:
   Fetch M1 for top-3 pairs only; refine sweep timing
```

### 4. SAGE — Risk Upgrade
```
1. Correlation Cluster Cap:
   EURUSD+EURGBP+EURAUD = max 1 open from EUR cluster
   GBPUSD+EURGBP+GBPJPY = max 1 from GBP cluster

2. Session Stop:
   3 SL in London window → stop trading until 11:00 UTC

3. Dynamic Size:
   Score 80+ → full risk 0.5%
   Score 60-70 → half risk 0.25%
```

### 5. ECHO — Macro Context
```
1. DXY Bias (reuse macro/dxy):
   DXY trending up → prefer short EURUSD/GBPUSD sweeps
   DXY down → prefer long

2. News Direction (calendar):
   After hawkish CPI → expect SSL sweep on EURUSD → long
   (rule table, not ML)

3. Blackout Override:
   FX_CHARLIE_SKIP_STATIC_BLACKOUT=1
   Keep calendar blackout for NFP/CPI only
```

### 6. PIXEL — Learning Loop
```
1. Feature Store per trade:
   { level_kind, sweep_depth, confirm_body, adx, spread, hour, pair_rank, dxy_dir }

2. Meta-Label Model (month 2+):
   Logistic regression: P(profitable | features)
   Threshold → replace heuristic score

3. Pair-Specific Stats:
   WR per pair per level_kind → adjust pairRank weights
```

### 7. FORGE — Execution
```
1. Limit Entry at FVG 50% (or confirm bar 50% retrace)

2. Partial TP:
   50% position at 0.5× target (opposite Asian level)
   50% runner with ATR trailing

3. Spread Gate per pair:
   GBPUSD max 2.5p, EURUSD max 1.8p during London
```

### 8. LENS — Validation
```
1. CHARLIE Backtest Job:
   jobs/backtestCharlie.js — replay last 90 days M5/H1 from cache

2. Walk-Forward:
   Train bias rules on month 1, test on month 2

3. Setup Dedup:
   setup_id = hash(pair, level_price, day) → no re-entry same sweep
```

### 9. PRISM — Timing
```
1. Narrow Kill Zone:
   FX_CHARLIE_SESSION_START=07:00
   FX_CHARLIE_SESSION_END=10:00  (not 11:00)

2. Power Hour Boost:
   07:00-08:30 → score +5 bonus
   09:30-10:00 → score -5 penalty (or skip)

3. NY Fallback (optional):
   FX_CHARLIE_NY_FALLBACK=1 → 13:30-16:00 UTC second window
```

### 10. FLUX — Signal Refinement
```
1. Equal Highs/Lows Detector:
   2+ touches within 2p on H1 → EQL/EQH level

2. Displacement Filter:
   confirm bar: body/range > 0.6 AND body > 1.2p

3. Multi-Bar Sweep:
   Allow sweep across 2 bars (accumulation) if total wick > level

4. Level Priority:
   PDH/PDL > Asian H/L > EQL > Round Numbers
   (weighted in score, not flat +8/+6/+3)
```

### 11. ORACLE — Synthesis: ТОП-10 покращень (пріоритет)

| Пріоритет | Покращення | Агент | Складність | Impact |
|-----------|------------|-------|------------|--------|
| **P0** | Вимкнути london_open blackout для CHARLIE | ECHO | 1 рядок | 🔥🔥🔥 |
| **P0** | Daily Bias filter (sweep проти bias = skip) | ATLAS | 2–3 дні | 🔥🔥🔥 |
| **P0** | Shadow journal (setups.jsonl) | NOVA+LENS | 1–2 дні | 🔥🔥🔥 |
| **P1** | MSS detector замість simple confirm | ATLAS+FLUX | 3–5 днів | 🔥🔥 |
| **P1** | Correlation cluster cap | SAGE | 1–2 дні | 🔥🔥 |
| **P1** | Asian Range вікно (configurable ET/UTC) | RIVEN | 1 день | 🔥🔥 |
| **P1** | Feature logging в journal | PIXEL | 1 день | 🔥🔥 |
| **P2** | FVG limit entry | ATLAS+FORGE | 5–7 днів | 🔥 |
| **P2** | TP = opposite Asian extreme (dynamic) | ATLAS | 2 дні | 🔥 |
| **P2** | CHARLIE backtest job | LENS | 3–5 днів | 🔥 |
| **P3** | DXY bias integration | ECHO | 2 дні | medium |
| **P3** | Meta-label model | PIXEL | 2–4 тижні | long-term |
| **P3** | NY fallback window | PRISM | 2 дні | medium |
| **P3** | Partial TP + runner | FORGE | 3–5 днів | medium |

---

## Раунд 4 — Корисна інформація для рішень бота

### A. Джерела даних (що підключити)

| Джерело | Що дає | Пріоритет | Як використати |
|---------|--------|-----------|----------------|
| **Capital.com WS** (вже є) | Real-time bid/ask, OHLC | ✅ active | Entry/SL/TP, spread gate |
| **DXY (Yahoo ^DXY)** | Dollar strength | P1 | Daily bias direction |
| **ForexFactory Calendar** (вже є) | CPI, NFP, ECB times | ✅ active | Directional bias + blackout |
| **COT Report (CFTC)** | Large spec positioning | P3 | Weekly bias confirmation |
| **OIS/Fed Funds futures** | Rate expectations | P3 | USD pair directional filter |
| **VIX (^VIX)** | Risk-on/off | P2 | Skip sweeps when VIX > 25 |
| **Session Volume Proxy (ATR)** | Volatility regime | P1 | Pair rank + sweep depth threshold |
| **Tick volume (if available)** | Displacement strength | P2 | Confirm impulse candles |

### B. Правила рішень (decision tree CHARLIE v2)

```
START → London KZ active (07:00-10:00 UTC)?
  NO → SKIP
  YES → News blackout (NFP/CPI only)?
    YES → SKIP
    NO → Compute daily bias (DXY + PD close + Asian EQ)
      → Mark levels: PDH, PDL, Asian H/L, EQL
      → Top-3 pairs (spread + ADX + correlation filter)
        → For each pair:
          → Sweep detected (wick beyond level, close inside)?
            NO → shadow log SKIP
            YES → Sweep direction OPPOSITE to bias?
              NO → shadow log SKIP (wrong side)
              YES → MSS within 5 bars?
                NO → WATCH (wait 1-2 cycles)
                YES → FVG formed?
                  → Limit entry at 50% FVG
                  → SL beyond sweep wick
                  → TP1 = opposite Asian extreme (50% close)
                  → TP2 = runner (trail or fixed 2R)
```

### C. Метрики для моніторингу (Panel + Telegram)

| Метрика | Формула | Alarm |
|---------|---------|-------|
| CHARLIE WR | wins / total charlie trades | < 30% after 30 trades |
| CHARLIE PF | gross win / gross loss | < 0.8 after 30 trades |
| Avg R | avg win(pips) / avg loss(pips) | < 1.5 |
| Shadow ratio | shadow setups / entries | > 20:1 → filters too loose |
| Sweep→Entry | entries / sweeps detected | < 10% → filters too tight |
| Spread cost | avg spread at entry | > 2p → reduce pairs |
| Session P/L | London window only P/L | negative 5 days → pause |

### D. Література / Research (посилання)

| Тема | Джерело |
|------|---------|
| ICT London Open | [ICT London Open Strategy (2026)](https://www.ictkillzone.com/ict-london-open-strategy) |
| Liquidity Sweep mechanics | [ICT Liquidity Sweep](https://www.ictkillzone.com/ict-liquidity-sweep) |
| Asian Range Sweep | [Asian Range Liquidity Sweep](https://en.forexclub.pl/Asian-Range-Liquidity-Sweep-at-London-Opening/) |
| Kill Zone procedural | [London Open Kill Zone Guide](https://liquidityscan.io/blog/the-london-open-kill-zone-strategy-a-procedural-guide) |
| Meta-labeling | López de Prado, *Advances in Financial Machine Learning* (2018) |
| FX microstructure | BIS Triennial Survey — UK = 43% global FX volume |
| Walk-forward testing | Pardo, *The Evaluation and Optimization of Trading Strategies* |

---

## Фінальний консенсус ORACLE

### Що CHARLIE робить ДОБРЕ ✅
1. Виправлена математика R:R (4.5/10p vs 3/3p)
2. Вимкнено profit_decay (головна причина збитків)
3. Вузьке вікно + top-3 пари (менше шуму)
4. Структурний сигнал замість непредиктивного conviction score
5. Infrastructure (Capital, journal, panel) збережено

### Що КРИТИЧНО потрібно (тиждень 1)
1. **Blackout fix** — не блокувати 07:00–07:05
2. **Daily bias** — sweep проти bias = skip
3. **Shadow journal** — логувати всі setups
4. **Feature tags** — в journal для кожної угоди

### Що дасть найбільший edge (тиждень 2–4)
5. MSS + FVG entry (замість market chase)
6. Dynamic TP (opposite Asian extreme)
7. Correlation filter
8. CHARLIE backtest на 90 днях

### Чесний прогноз панелі

| Сценарій | PF | WR | Угод/день |
|----------|-----|-----|-----------|
| CHARLIE MVP (зараз) | 0.9–1.1 | 30–38% | 1–3 |
| + P0 fixes | 1.0–1.2 | 33–40% | 1–3 |
| + MSS/FVG (v2) | 1.1–1.4 | 35–45% | 1–2 |
| + Meta-label (v3) | 1.2–1.5 | 38–48% | 1–2 |

> *«Без shadow journal і backtest ми не знаємо, чи CHARLIE кращий — ми просто сподіваємось.»* — NOVA  
> *«MVP — це крок 1. MSS + bias — крок 2. Без них це sweep-shaped Ideal Formula.»* — ATLAS  
> *«Панель одностайна: спочатку P0 (3 дні), потім оцінка 2 тижні London sessions.»* — ORACLE

---

*Згенеровано AI Debate Panel × 11. Наступний крок: обрати фазу впровадження (P0 / P1 / full v2).*
