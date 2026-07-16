# Math Path Gate — P(дістане TP раніше за SL)

## Проблема

Жорсткі структурні фільтри → 0 угод.  
М'які фільтри → збитки.  
Корінь: бот **не оцінював**, чи ціна з ймовірністю дійде до TP раніше SL.

## Рішення (впроваджено)

Шар `services/analyzer/math/`:

| Модуль | Математика |
|--------|------------|
| `stats.js` | Hurst (R/S), OLS регресія T(t), автокореляція, log-returns |
| `barrier.js` | GBM barrier formula + Monte Carlo bootstrap шляхів |
| `pathExpectancy.js` | RSI, Bollinger, EMA, ATR, expectancy \(M = P\cdot R - (1-P)\) |

### Гейт входу

Угода відкривається лише якщо:

1. Є CHARLIE setup (sweep + MSS), **і**
2. **P(hit TP before SL) ≥ 0.52** (analytic 55% + MC 45%), **і**
3. **Expectancy M ≥ 0.05 R**

Якщо P ≥ 0.58 — structural minScore може знизитись до 68 (не глушимо сильний math).

### Формули

Barrier (дрифт μ, волатильність σ, відстані a=SL, b=TP):

\[
P(\text{hit } b \text{ first}) = \frac{1-e^{-2\mu a/\sigma^2}}{1-e^{-2\mu(a+b)/\sigma^2}}
\]

Expectancy:

\[
M = P_{\text{win}}\cdot R - (1-P_{\text{win}})\cdot 1,\quad R = \text{TP}/\text{SL}
\]

Hurst H: >0.5 тренд, <0.5 mean-reversion (для sweep-fade часто корисно).

## Env

```env
FX_MATH_GATE=1
FX_MATH_MIN_PREACH=0.52
FX_MATH_MIN_EXPECTANCY_R=0.05
FX_MATH_STRONG_PREACH=0.58
FX_MATH_SCORE_FLOOR=68
FX_MATH_MC_PATHS=400
FX_MATH_MC_MAX_BARS=36
```

## Θ Ensemble (16.07.2026)

Розширення gate: `services/analyzer/math/theta.js`

| Додано | Сенс |
|--------|------|
| GBM + MC + OU | ансамбль \(p_+\) |
| Jump share \(J\) | блок / discount при стрибках |
| Kalman / EWMA μ | online drift |
| κ (kappa) | згода моделей |
| Friction | спред vs SL |
| Micro gate | SL ≥ N× типовий bar range |

Увімкнення: `FX_MATH_THETA=1` (default). Дебати: `docs/FORECAST_MATH_DEBATE.md`.

## Логи

У reason з'явиться: `P(TP)=61% M=0.34R`  
У shadow `charlie_setups.jsonl` → поле `math`.
