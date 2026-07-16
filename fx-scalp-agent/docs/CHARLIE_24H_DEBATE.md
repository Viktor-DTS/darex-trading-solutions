# Дебат 11 AI — «Цілодобово + прибуток»

> Дата: 14.07.2026  
> Питання користувача: як торгувати 24/7 і обовʼязково з прибутком?

---

## Одностайний вердикт ORACLE

> **«Цілодобово + гарантований прибуток» — суперечність.**  
> Прибутковий retail FX бот = **торгувати рідко й лише там, де є edge**.  
> 24/7 одним правилом CHARLIE = повернутись до збиткового scalp.

Голосування: **11/11 — НЕ торгувати 24/7 одним стратегічним шаблоном.**

---

## Діалог агентів

```
USER: Хочу цілодобово і з прибутком обовʼязково.

NOVA:  «"Обовʼязково" у фінансах не існує. Max expectancy, не guarantee.»

ATLAS: «Liquidity sweep без інституційного потоку = fake sweep. Asia тиха —
        London/NY роблять справжні Judas.»

PRISM: «Не "цілодобово". Multi-killzone: Asia mark → London → NY → Close.»

FORGE: «Поза overlap спред ширший, slippage гірший → R:R ламається.»

SAGE:  «Більше годин ≠ більше прибутку. Більше годин = більше DD.»

FLUX:  «Один детектор на 24h overfits. Різні сесії = різні правила.»

ECHO:  «NY без календаря новин — самогубство (CPI/NFP 12:30 UTC).»

PIXEL: «Спочатку доведи PF>1.2 на London. Потім meta-label на інші вікна.»

LENS:  «Розширення без 40+ угод CHARLIE London = оптимізм, не наука.»

RIVEN: «Capital demo rate limit. 24/7 REST = 429. WS ок, але edge ні.»

ORACLE: «План: 3 kill zones ≈ 8–9 год/день, не 24. Решта — спостерігати.»
```

---

## Найкращий план (консенсус)

### НЕ робити
| Ідея | Чому ні |
|------|---------|
| Розтягнути CHARLIE на 00–24 UTC | False sweeps, широкий спред, злиття балансу |
| Знизити minScore / вимкнути MSS щоб «торгувало» | Повернення до WR~25% |
| Гарантія прибутку | Неможливо; можна лише ймовірнісний edge |

### РОБИТИ — «майже цілодобове покриття» через **3 вікна**

| Сесія | UTC | Київ (~UTC+3) | Що робить бот | Пари | Risk |
|-------|-----|---------------|---------------|------|------|
| **A. Asia observe** | 00:00–07:00 | 03:00–10:00 | Лише levels (Asian H/L), **0 угод** | — | 0 |
| **B. London CHARLIE** | 07:00–10:00 | 10:00–13:00 | Full sweep+MSS (зараз) | EUR/GBP/USD majors | 100% size |
| **C. NY CHARLIE** | 12:00–15:00 | 15:00–18:00 | Той самий engine + news blackout | USD pairs | 75–100% |
| **D. Optional London Close** | 15:00–17:00 | 18:00–20:00 | Лише continuation, score +5, max 1 угода | Top-1 pair | 50% size |
| **Dead zones** | решта | — | SKIP | — | 0 |

**Разом активної торгівлі: ~6–8 год/день**, покриття майже всіх ліквідних годин FX.  
Ніч Asia — **не «мертвий бот»**, а етап збору рівнів для London.

### Правило прибутку (усі агенти)

```
1. London PF ≥ 1.2 на ≥ 40 угод  → дозволити NY
2. NY PF ≥ 1.1 на ≥ 30 угод     → дозволити London Close (optional)
3. Будь-яке вікно PF < 0.9 за 20 угод → AUTO-DISABLE цього вікна
4. Daily loss limit 1.5% → stop на день (вже є)
5. Ніколи не торгувати "щоб щось було"
```

---

## Архітектура «CHARLIE WORLD» (якщо будувати)

```
FX_CHARLIE_SESSIONS=london,ny
FX_CHARLIE_NY_FALLBACK=1
FX_CHARLIE_SESSION_START=07:00
FX_CHARLIE_SESSION_END=10:00
FX_CHARLIE_NY_START=12:00
FX_CHARLIE_NY_END=15:00
FX_CHARLIE_ASIA_TRADE=0          # observe only
FX_CHARLIE_LONDON_CLOSE=0       # off until proved
```

Per-session:
- London: Asian H/L + PDH/PDL (current)
- NY: London session H/L + PDH/PDL + **calendar gate**
- Asia: build levels only

---

## Відповіді по агентах (1 рядок)

| AI | Вердикт |
|----|---------|
| ATLAS | Не 24/7 — kill zones only |
| NOVA | Спочатку sample London, потім expand |
| RIVEN | Rate limits + spreads поза сесією = no |
| SAGE | DD вибухне на 24h |
| ECHO | NY тільки з news filter |
| PIXEL | Meta-label пізніше; зараз heuristic |
| FORGE | Лише tight-spread hours |
| LENS | Backtest кожне вікно окремо |
| PRISM | Multi-KZ = найкращий компроміс |
| FLUX | Різні levels на сесію |
| ORACLE | **Увімкнути NY зараз; Asia trade — ніколи без доказу** |

---

## Рекомендація користувачу (ORACLE)

**Крок 1 (сьогодні):** увімкнути `FX_CHARLIE_NY_FALLBACK=1` → +3 год (15:00–18:00 Київ).  
**Крок 2 (2 тижні):** оцінити London vs NY окремо у journal.  
**Крок 3:** лише якщо обидва прибуткують — optional London Close.  
**Ніколи:** Asia entries + 24h flat window.

Це дає **~6 год активної торгівлі/день** з тим самим edge-моделлем, не ілюзію 24/7.
