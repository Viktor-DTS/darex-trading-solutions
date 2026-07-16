# CAPITAL HUNT — Дебат 10 AI: динамічні пари з активними сигналами

> Дата: 16.07.2026  
> Питання: як покращити **полювання на Capital**, щоб у журналах пар (**universe / focus / setups / testbot**) завжди були **динамічні** пари з **активними сигналами**, а не статичний або «залипший» набір.  
> Контекст коду: `marketHunt.js` → `universeJournal.js` (≤24, rotate 8) → `activePool.js` (focus ≤4) → `hub.expandWatchPairs` · інтервал hunt **15 хв** · seed `FX_PAIRS`.

---

## 0. Що є зараз (короткий аудит)

```
Capital nav/search + G10 matrix
        ↓ activityScore = %change + dayRange − spread
        ↓
charlie_universe.json  (core ~16 sticky + rotating 8)
        ↓
focus top-4  (ATR/range + journal bump + stickiness +8)
        ↓
аналіз / setups.jsonl / panel / testbot
```

| Шар | Ліміт | Проблема для «завжди динамічно» |
|-----|-------|----------------------------------|
| Seed `FX_PAIRS` | 12 | Сильно впливає на **core** — universe не «чистий» hunt |
| Hunt interval | 15 хв | Між циклами ротація стоїть; при 429 — `skipped` |
| Catalog cache | 6 год | Повільне оновлення епіків |
| Rotate slots | **8 з 24** | Лише ⅓ слотів реально рухається |
| Core sticky | ~16 | Старі seed-пари довго не вилітають |
| Focus | 4 | Panel/аналіз бачить вузько; stickiness +8 гальмує demote |
| Activity proxy | `%change` дня | Це **рух ціни**, не «активний торговий сигнал» (sweep/setup) |
| Setups journal | shadow/skip | Якщо focus тихий → журнал setups теж «мертвий» на тих самих парах |
| Rate limit | Capital REST | Hunt часто тонкий → fallback на попередній universe |

**Симптом з live (16.07):** у логах довго `top pairs: GBPNZD, AUDCHF, AUDNZD, AUDCAD` + `tb-skip no eligible` — focus крутиться в одному кластері AUD/*, universe не виглядає «живим полюванням за сигналами».

---

## Панель агентів

| # | Агент | Роль | Фокус |
|---|-------|------|-------|
| 1 | **RIVEN** | Data / Capital API | nav, epics, 429, WS |
| 2 | **FLUX** | Signal hunter | що таке «активний сигнал» |
| 3 | **NOVA** | Quant ranking | score формула, freshness |
| 4 | **PIXEL** | Meta / journals | setups + universe як продукт |
| 5 | **PRISM** | Session / rotation cadence | як часто міняти пари |
| 6 | **SAGE** | Risk / correlation | динаміка без кореляційного вибуху |
| 7 | **FORGE** | Execution capacity | WS 40, analyze budget |
| 8 | **ATLAS** | Structure | рівні на нових парах |
| 9 | **LENS** | Metrics | KPI «динамічності» журналу |
| 10 | **ORACLE** | Synthesis | план v1 / v2 |

---

## Раунд 1 — Діагноз

### 1. RIVEN (Data)
> *«Hunt уже є. Він слабкий не тому, що Capital нічого не дає, а тому що ми рідко питаємо і сильно клеїмо core.»*

| # | Теза |
|---|------|
| R1 | `discoverFxCatalog` + `rankCapitalMovers` ок, але **15 хв + 429 skip** = universe застигає. |
| R2 | Потрібен **дешевий hot-path**: WS quotes уже є на ≤40 пар → рахувати **short-horizon activity** (1m/5m range, tick velocity) **без REST hunt**. |
| R3 | REST hunt лишити для **discovery** (нові epics) рідше (30–60 хв); **re-rank** ротації — кожні 1–3 хв з локальних snapshot. |
| R4 | Окремо тягнути Capital nodes `most_volatile` / `top_gainers` / `most_traded` (у коді вже є regex) — зараз часто skip через rate limit на deep walk. |

### 2. FLUX (Signal hunter)
> *«Активна пара ≠ волатильна пара. Активна = є кандидат на setup або вже є shadow signal.»*

| # | Теза |
|---|------|
| F1 | Два канали ранжування: **Market heat** (Capital %/range) і **Signal heat** (near level, draft BUY/SELL, WATCH, FVG forming). |
| F2 | У universe journal писати не лише `activityScore`, а `signalScore`, `lastSignalAt`, `lastAction`. |
| F3 | Ротація: викидати пари з `signalScore=0` N циклів поспіль, навіть якщо %change дня високий (мертвий тренд без setup). |
| F4 | «Полювання за сигналами»: **scan pool ширший** (12–20), deep analyze тільки top-K з signal heat; інакше setups journal знову на 4 AUD-кросах. |

### 3. NOVA (Quant)
> *«Stickiness +8 і core16 — ворог динаміки. Це anti-churn для стабільності, але користувач просить churn з смислом.»*

| # | Теза |
|---|------|
| N1 | Зменшити core sticky: **coreN = 6–8 majors**, rotate **16–18** (перевернути пропорцію). |
| N2 | Half-life: score *= exp(−age/τ); пара без signal 45–90 хв → demote. |
| N3 | Diversity penalty: друга пара з тією ж base/quote currency −penalty (анти-AUD кластер). |
| N4 | KPI: **Universe Entropy** / **Unique pairs per 6h in setups.jsonl** — якщо < 8 → hunt «мертвий». |

### 4. PIXEL (Journals)
> *«Журнал пар має бути first-class продуктом, не побічним ефектом focus=4.»*

| Журнал | Що має бути динамічним |
|--------|------------------------|
| `charlie_universe.json` | rotating список + ranked top-30 з timestamps |
| `charlie_focus.json` | promoted/demoted кожен analyze cycle |
| `charlie_setups.jsonl` | **обов’язковий** рядок на кожну scanned пару (SHADOW), не лише trade |
| Panel / testbot analyses | lastAnalyses покриває **scan pool**, не лише focus |

| # | Теза |
|---|------|
| P1 | Увімкнути/посилити **shadow log для всього scan pool** (не тільки focus) — інакше статистика «які пари живі» сліпа. |
| P2 | Окремий `pair_pulse.jsonl`: раз на цикл `{pair, heat, signal, spread, inFocus}` — стрічка динаміки для панелі. |
| P3 | Testbot читає той самий dynamic pool — інакше sim і live «полюють» різне. |

### 5. PRISM (Cadence)
> *«15 хвилин між hunt — вічність для scalper panel.»*

| Шар | Інтервал | Джерело |
|-----|----------|---------|
| Quote micro-heat | **кожний analyze** (~12с) | Capital WS |
| Focus re-pick | **кожний analyze** | heat + signal |
| Universe rotate | **2–5 хв** | micro-heat rank |
| Catalog rediscover | **30–60 хв** | REST nav/search |
| Full G10 reconcile | **раз / сесію** | matrix + open protection |

### 6. SAGE (Risk)
> *«Динамічні пари без кореляційного фільтра = 4× один AUD-ризик.»*

| # | Теза |
|---|------|
| S1 | При rotate: max 1–2 пари на валюту в focus (вже є cluster caps для trade — поширити на **focus selection**). |
| S2 | Open positions **завжди** в universe (вже є) — ок. |
| S3 | Не ростити universe > WS cap (~40) без пріоритезації. |

### 7. FORGE (Capacity)
> *«Не можна deep-analyze 40 пар кожні 12с.»*

| Бюджет | Пропозиція |
|--------|------------|
| WS watch | до 24–32 dynamic |
| Light scan (spread/ATR/nearLevel) | 16–24 / цикл |
| Full CHARLIE analyze | 4–6 focus |
| Promote to focus | якщо light scan: nearLevel + ATR gate + signal draft |

Інакше 429 на bars + «динаміка» вб’є якість барів.

### 8. ATLAS (Structure)
> *«Нова пара без історії барів = сміттєвий setup.»*

| # | Теза |
|---|------|
| A1 | Warm-up: після promote в universe — **мінімум N M5 барів** перед shadow BUY/SELL. |
| A2 | До warm-up пара в журналі як `WATCH/WARMING` — все одно **видима динаміка**, без фейкових entry. |
| A3 | Prefetch bars при `↑ replaced` у hunt log. |

### 9. LENS (Metrics)
> *«Без метрик “динамічно” — суб’єктивно.»*

| KPI | Ціль | Alarm |
|-----|------|-------|
| Unique pairs in universe / 1h | ≥ 12 змін rotating | < 3 заміни / год |
| Unique pairs in setups / 6h | ≥ 10 | < 5 |
| Focus churn / год | 4–12 promote|demote | 0 протягом 2 год |
| Signal-bearing pairs in scan | ≥ 2 з score>0 | 0 довше 30 хв → widen scan / lower nearLevel |
| AUD\|JPY cluster share in focus | ≤ 50% | > 70% → diversity fail |
| Hunt skip rate (429) | < 20% | > 50% → REST backoff, WS-only rank |

---

## Раунд 2 — Суперечка

**FLUX:** Ранжувати треба по signal heat, не по денному %.  
**NOVA:** Денний % — дешевий prior; signal heat — posterior. Бленд: `0.4*market + 0.6*signal`.  
**RIVEN:** Спочатку зняти REST з hot path, інакше будь-яка нова формула вмре на 429.  
**PIXEL:** Поки shadow не пише весь scan pool — журнали брешуть, що «пар немає».  
**PRISM:** Focus re-pick кожні 12с ок; повний universe rotate не частіше 2 хв (анти-флапінг).  
**SAGE:** Diversity обов’язкова, інакше знову AUDCHF/AUDCAD/AUDNZD.  
**ATLAS:** Warm-up або сміття в journal.  
**ORACLE:** Консенсус нижче.

---

## Раунд 3 — Архітектура «Pulse Hunt» (консенсус)

```
                    ┌─────────────────────────┐
   Capital WS ─────►│  MICRO-HEAT (12s)       │  range1m, spread, tickΔ
                    │  light nearLevel scan   │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │  SIGNAL HEAT            │  draft/WATCH/shadow
                    │  + market heat blend    │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
        SCAN POOL(16-24)   FOCUS(4-6)      UNIVERSE journal
        shadow → setups    deep CHARLIE    core6 + rotate18
              │                 │                 │
              └──────────── pair_pulse ───────────┘
                                │
                         Panel + Testbot
```

### Зміни відносно today (пріоритет)

| P | Зміна | Навіщо | Складність |
|---|-------|--------|------------|
| **P0** | Shadow/pulse на **весь scan pool**, не лише focus | Журнали завжди «живі» | S |
| **P1** | Micro-heat re-rank з WS **кожний analyze**; REST hunt рідше | Динаміка без 429 | M |
| **P2** | Core ↓ (6–8), Rotate ↑ (16–18) | Більше слотів під movers | S |
| **P3** | Currency diversity у focus | Анти-AUD кластер | S |
| **P4** | Blend market+signal heat + half-life demote | Полювання за сигналами | M |
| **P5** | Prefetch bars + WARMING state для нових пар | Якість setups | M |
| **P6** | Panel: стрічка `↑↓` universe + pulse table | Видно динаміку людині | S |
| **P7** | KPI + Telegram alarm «universe stagnant» | Контроль | S |

### Що НЕ робити
- Не ставити `FX_PAIRS` = усі 56 G10 і deep-analyze все.  
- Не крутити REST hunt кожні 30с.  
- Не вважати «динаміка» = просто частіше міняти пари без signal/heat (шум у журналі).  
- Не роздувати focus до 20 full CHARLIE.

---

## Фінальний вердикт ORACLE

> **Мета «завжди динамічні пари в журналах» досягається не агресивнішим REST по Capital, а тришаровим pulse:**  
> 1) **дешевий WS heat** постійно,  
> 2) **широкий scan + shadow journal**,  
> 3) **вузький focus** з diversity і half-life.  
> Capital nav/search — лише discovery.  
> «Активний сигнал» = nearLevel / draft / WATCH / setup, не лише %change дня.

### One-liner для імплементації
`Rotate harder · Scan wider · Shadow everything · Rank by signal·market blend · Diversify currencies · REST less.`

### Рекомендований перший спринт (1–2 дні)
1. `charlieUniverseRotate=16`, `universeMax=24`, зменшити вплив seed на core.  
2. `buildActivePairPool`: diversity + lower stickiness; focus re-pick кожен цикл.  
3. Писати shadow setup (або pair_pulse) для всіх `scanPool` пар.  
4. Micro-heat з наявних quotes/snapshots без очікування 15-хв hunt.  
5. На панель: `↑ replaced / ↓ demoted` + лічильник unique pairs / 1h.

Після спринту — перевірити KPI LENS на live за 6–12 год: якщо unique setups ≥ 10 і focus churn > 0 — полювання «оживає».
