# DUAL BOT IMPROVE — Дебат AI (код + моделі + статистика 20.07)

> Дата: 20.07.2026 · Режим: **дебат → імплементація**  
> Live snapshot ~11:58: CHARLIE 21 closed · 2W/19L · −$13.67 · today −$3.41  
> Testbot 18 closed · 4W/14L · −$39.10 · today −$3.60 · Oracle hit **63.5%** · Quality $5/$5 · Flip OFF

---

## Панель

| # | Агент | Роль |
|---|-------|------|
| 1 | **NOVA** | Expectancy / R:R |
| 2 | **LENS** | Empirical journal |
| 3 | **THETA** | Math path gate (κ, micro, P) |
| 4 | **ORACLE-5** | 5m forecast calibration |
| 5 | **MGMT** | Position exits (scratch / time / target) |
| 6 | **CHARLIE** | Structural sweep entry |
| 7 | **TESTBOT** | Sim quality profile |
| 8 | **FORGE** | Spread / execution realism |
| 9 | **SYNTH** | Фінальний вердикт + патч |

---

## Раунд 1 — Факти з журналу

### LENS
> CHARLIE: майже всі виходи `time_scratch` (−$0.4…−$1.1). Один плюс GBPNZD +$0.79. Остання AUDNZD −$0.69 за ~47с (`conv_decay`).  
> Testbot після quality: `time_exit` −$0.95…−$2.65 при oracle pUp 63–73%. Є `target_usd` +$5.15.  
> Зараз «Готові: 0» — усі SKIP (BUY) після MATH BLOCK; testbot правильно не бере draft.

### NOVA
> Testbot $5/$5 ⇒ break-even ≈ 50% WR. Факт ~22% ⇒ expectancy від’ємний.  
> Проблема вже не asymmetry TP/SL, а **не дотягуємо до TP** і закриваємось `time_exit` у мінусі.  
> CHARLIE scratch: закриває мікро-збитки до того, як ATR-хід встигає.

### THETA
> Типовий блок: `micro 0.96 < 1.5` · `P=18%` · `κ=0.36` при conv 85.  
> Gate занадто жорсткий для scalp SL ~4.5p: micro 1.5 bars майже завжди fail на спокійному ринку.  
> κ=0.55 відсікає більшість голосів ensemble при низькій згоді моделей — ок для live-капіталу, але зараз **перебір**.

### ORACLE-5
> Hit 63.5% / Gate PASS / MAE 1.7p — прогноз **кращий за монетку**.  
> Але entry-угод з pUp≥55% все одно часто `time_exit` у мінус → **exit policy ламає edge oracle**, не сам прогноз.

### MGMT
> CHARLIE `posTimeScratchLossMs=240s` + `scratchMaxLoss=-0.5p` = агресивний scratch.  
> Testbot: partial лише після 10хв на $2.5; до того — або стоп, або сидіти до 15хв і `time_exit`.  
> Немає «protect green» на sim: був +$1.5 → відкат → time_exit −$1.

### FORGE
> Spread + grace 30с уже є. Далі важливіше **банкувати малий плюс**, ніж розширювати SL.

---

## Раунд 2 — Пропозиції (конфлікт)

| Пропозиція | За | Проти |
|------------|-----|-------|
| Вимкнути MATH GATE | більше CHARLIE угод | повернемо сміття 15.07 |
| Soften micro 1.0 + κ 0.48 | більше якісних сетапів | трохи більше шуму |
| Testbot early partial $1.5@3хв | фіксує edge oracle | менше повних +$5 |
| Protect green / extend hold якщо ≥+$0.5 | менше time_exit мінус | довші збиткові хвости |
| Дозволити math-draft знову | активність | торгівля тим, що live відсік |

---

## Раунд 3 — Вердикт SYNTH (імплементуємо)

1. **CHARLIE math soft (не off):** `MICRO_BARS=1.0`, `MIN_KAPPA=0.48`, `MIN_PREACH=0.48`.  
2. **CHARLIE scratch softer:** scratch loss ≥ 6хв, max loss −1.0p, no-progress scratch ≥ 9хв.  
3. **Testbot exit rewrite:**  
   - early partial `$1.5` після **3хв**;  
   - protect green (peak ≥ $1.5 → банк ≥ $0.5 при відкаті);  
   - на maxHold: якщо net ≥ $0.5 → `time_flat`; якщо −$1 < net < $0.5 → **один** extend +5хв; інакше `time_exit`.  
4. **Oracle:** лишити pUp≥55% / κ≥0.45; не торгувати math-draft.  
5. **Не чіпати:** Flip OFF, $5/$5, minConv 70, `ALLOW_DRAFT=0`.

**Успіх через 24–48h:** CHARLIE WR > 25% або менше scratch-ratio; testbot `time_exit` частка ↓, з’являться `partial_usd` / `protect_green`.

---

## Імплементація

Див. коміт після цього документа (runner exit + render.yaml math/pos + config defaults).
