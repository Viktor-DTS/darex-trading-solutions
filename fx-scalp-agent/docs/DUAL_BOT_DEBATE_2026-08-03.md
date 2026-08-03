# DUAL BOT DEBATE — 03.08.2026 (прибутковість)

> Snapshot ~07:02 UTC+3 · Worker ON · Learning/Risk **не** на паузі  
> Post-patch window **22.07→03.08** · Oracle hit **52%** (200 samples)

---

## Панель агентів

| # | Агент | Роль |
|---|-------|------|
| 1 | **LENS** | Емпірика журналів |
| 2 | **NOVA** | Expectancy / R:R |
| 3 | **THETA** | Math gate / micro |
| 4 | **ORACLE-5** | Forecast + pair edge |
| 5 | **MGMT** | Exits (scratch / cut_stale / bank) |
| 6 | **CHARLIE** | Live Capital entries |
| 7 | **TESTBOT** | Sim quality |
| 8 | **FORGE** | Execution / spread |
| 9 | **LEARN** | Pause / adaptive |
| 10 | **RISK** | Pair / day caps |
| 11 | **SYNTH** | Вердикт + патч |

---

## Раунд 1 — Факти

### LENS
> **CHARLIE** since 22.07: **59** · WR **20.3%** · **−$73.26**  
> Exits: `time_scratch` 20 · `conv_decay` 18 · `time_profit` 9 · `broker_sync` 8  
> Today 03.08: **5L / −$5.51** (scratch+sync+decay).  
> Worst: AUDUSD −$10.7 · GBPUSD −$10.3 · NZDUSD −$9.4 · CADJPY −$7.9 · USDCHF −$7.8  
> **Testbot** 53 · WR **34%** · **−$83.45**  
> Exits: **`cut_stale` 25** · `partial_usd` 12 · `stop_usd` 10 · `protect_green` 6 · `time_exit` **0**  
> Worst: USDCHF −$16.5 (0% WR) · EURUSD −$14.9 · EURCAD −$10.4  
> Висновок: попередній `cut_stale` **вбив time_exit**, але створив фабрику −$2; bank (`partial`/`protect`) працює, але рідко й дрібно.

### NOVA
> Testbot $5/$5 ⇒ BE ≈ 50% WR. Факт 34%.  
> Типовий win ≈ +$1.5 (partial), типові loss ≈ −$2 (cut_stale) або −$5 (stop).  
> Expectancy ≈ `0.34×(+1.6) + 0.47×(−2.0) + 0.19×(−5)` ≈ **−$1.6/угода** — збігається з avg −$1.57.  
> Шлях у плюс: (A) WR↑ через відсів токсичних пар / жорсткіший oracle, (B) win size↑ (банкувати $2–2.5, не $1.5), (C) рідше різати cut_stale.  
> CHARLIE: `time_profit` уже дає плюси — scratch/decay з’їдають edge до того, як ATR-хід дозріває.

### THETA
> На панелі досі `MATH BLOCK micro stop 0.4 bars < 1.0` при conv 76.  
> `MICRO_M1=1` допомогло частково, але **`MICRO_BARS=1.0`** досі ріже scalp SL на волатильних парах.  
> Для scalp SL~4.5p при medRange≫SL → barsInStop≪1 завжди. Потрібно **0.35** або soft-pass при score≥75.

### ORACLE-5
> Global hit **52%** ≈ монетка — **немає edge без pair filter**.  
> Добре: GBPUSD 65% · EURUSD 62% · GBPJPY 67% · EURCHF 62%.  
> Токсично: USDCHF **17%** · AUDUSD **40%** · NZDUSD **43%** · EURCAD **40%**.  
> Ці ж пари = найгірший PnL у обох ботів.  
> Пропозиція: `minPairHit=0.55` + blacklist токсичних + окремий testbot BL.

### MGMT
> `cut_stale` (25/53) — over-fired. Краще: **12хв / −$2.5**, і лише якщо peak ніколи не був ≥+$1.  
> Early partial $1.5@3хв занадто жадібний до дрібного плюса → підняти до **$2.2@4хв**, protect peak $2 / floor $1.  
> CHARLIE: **вимкнути loss-scratch** (`scratchLossMs=0`); лишити no-progress ≥15хв.  
> `conv_decay` у мінусі: підняти поріг drop (менше передчасних).

### CHARLIE
> Входи є (на відміну від mid-July MATH lock), але менеджмент убиває.  
> Пріоритет: тримати до `time_profit` / dynamic TP, не scratch −$1…−$2.

### TESTBOT
> Quality lock OK. Проблема не Flip і не draft — **селекція пар + асиметрія bank/cut**.  
> EURUSD часто в журналі: змішаний PnL — лишити, але з жорсткішим pUp.

### FORGE
> `broker_sync` 8 на CHARLIE — інколи закриття брокером/десинк; не головний PnL-драйвер, але лог варто моніторити.  
> Grace 30с на stop_usd лишаємо.

### LEARN
> Pause знято — добре. Не чіпати пороги зараз; спочатку pair/exit.

### RISK
> Немає **денного ліміту збитків на пару** → USDCHF може злити 5× підряд.  
> Модуль **PAIR_DAY_LOSS_CAP=2**: після 2 збиткових закриттів на парі сьогодні — skip до завтра.

---

## Раунд 2 — Конфлікт пропозицій

| Пропозиція | За | Проти | Рішення |
|------------|-----|-------|---------|
| Вимкнути MATH GATE | більше угод | сміття 15.07 | ❌ soft micro only |
| MICRO_BARS 0.35 | пропуск scalp | трохи шуму | ✅ |
| Вимкнути cut_stale | менше −$2 | знову time_exit −$4 | ❌ soften |
| cut_stale 12m/−$2.5 | баланс | трохи більше stop | ✅ |
| Early bank $2.2 | кращий R | менше fill | ✅ |
| Blacklist USDCHF,AUDUSD,NZDUSD,EURCAD | прибрати токсин | менше угод | ✅ |
| minPairHit 0.55 | oracle edge | менше entries | ✅ |
| Disable CHARLIE loss-scratch | більше time_profit | довші збитки до SL | ✅ |
| PAIR_DAY_LOSS_CAP=2 | стоп серій | — | ✅ |
| Flip ON | — | історія негативна | ❌ |

---

## Раунд 3 — SYNTH вердикт (імплементуємо)

### Код / алгоритм
1. **MICRO_BARS → 0.35** (CHARLIE math).  
2. **CHARLIE scratchLoss OFF** (`FX_POS_TIME_SCRATCH_LOSS_MS=0`); no-progress scratch **15хв**.  
3. **conv_decay loss** м’якше: `FX_POS_CONV_DECAY_LOSS=18`.  
4. **Testbot exits:** earlyPartial **$2.2 / 4хв**; protect **peak $2 / floor $1**; cut_stale **12хв / −$2.5**.  
5. **PAIR_EDGE:** `FX_ORACLE_MIN_PAIR_HIT=0.55`, toxicMin=5, toxicWr=0.35; testbot pUp≥**0.60**, κ≥**0.52**.  
6. **Blacklist:** `USDCHF,AUDUSD,NZDUSD,EURCAD` (+ testbot same).  
7. **Модуль PAIR_DAY_LOSS_CAP=2** (testbot + charlie entry skip).  

### Нові / підсилені модулі
- `PAIR_EDGE` (жорсткіше)  
- `PAIR_DAY_LOSS_CAP` (**новий**)  
- `MICRO_BARS_SCALP`  
- `SCRATCH_LOSS_OFF`  
- ` asymmetric BANK/CUT` (більший bank, рідший cut)

### Успіх 48–72h
- Testbot WR ≥ 42% або avg PnL > −$0.30  
- CHARLIE scratch-ratio < 25% closed  
- Немає нових угод на blacklisted pairs  
- Oracle-торгові пари з hit ≥55%

**Не чіпати:** Flip OFF, $5/$5 SL/TP cap, ALLOW_DRAFT=0, QUALITY_LOCK=1.
