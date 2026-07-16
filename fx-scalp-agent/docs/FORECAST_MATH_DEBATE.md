# FORECAST MATH — Дебат 12 AI: формула коливань з графіка останніх 3 годин

> Дата: 16.07.2026 · **Режим: життя / смерть для капіталу**  
> Заборона на цей раунд: **не кодити** — лише глибокий аналіз і математична архітектура.  
> Контекст live (testbot flip, ~08:40): **13 закритих · 3W / 10L · −$25.16** · багато `stop_usd` в один timestamp з entry · є рідкі `target_usd` (+$3.12).  
> Вікно даних користувача: **останні 3 години** по парах (M1/M5/quotes).  
> Уже є в коді (не чіпати зараз): GBM barrier + MC + Hurst (`docs/MATH_PATH_GATE.md`).

---

## Присяга панелі (усі підписують)

```
1. Ніхто не обіцяє «передбачити ціну». Це шахрайство.
2. Мета — максимізувати P(шлях прибутку | історія 3h) і мінімізувати хвостовий ризик,
   не вгадати завтрашній close.
3. Кожна формула має: припущення, область валідності, спосіб фальсифікації на журналі.
4. Якщо модель не б'є naive baseline (random / invert / always-skip) — вона мертва.
5. 3 години — мікроскопія. Без режиму/сесії/подій це галюцинація.
```

---

## Панель (12 агентів)

| # | Агент | Дисципліна | Мандат |
|---|-------|------------|--------|
| 1 | **NOVA** | Quant / expectancy | break-even math, що саме оцінювати |
| 2 | **LENS** | Empirical science | 3h sample, bias, overfitting |
| 3 | **ORBIT** | Stochastic processes | GBM, jump-diff, OU, regime HMMs |
| 4 | **FRACTAL** | Scaling / Hurst / multiTF | пам’ять ряду, H(t) |
| 5 | **SPECTRA** | Spectral / vol surface | realized vol, RV, BV, jumps |
| 6 | **KALMAN** | State-space filtering | online μ̂, σ̂, hidden drift |
| 7 | **BAYES** | Bayesian model average | posterior over models |
| 8 | **ATLAS** | Market microstructure / levels | графік ≠ лише returns |
| 9 | **ECHO** | Macro / calendar | 3h всередині сесії |
| 10 | **FORGE** | Execution realism | спред/слипедж у формулі |
| 11 | **PIXEL** | ML honesty | що NN може / не може на 3h |
| 12 | **ORACLE** | Synthesis | канонічна формула + протокол |

---

## 0. Крива правда (раунд нуль)

### NOVA
> *«Передбачення ціни S_{t+Δ} — майже неможливе. Передбачення розподілу шляху — можливе частково.»*

При поточному payoff testbot (**≈ +$3 / −$3** після flip):

\[
E = p\cdot(+3) + (1-p)\cdot(-3) = 6p - 3
\]

Плюс лише при \(p > 0.5\). Факт **3/13 ≈ 23%** ⇒ система **нижче монетки** навіть після invert.  
Отже проблема не «трохи підкрутити score», а **модель напрямку/шляху бреше на горизонті 3–5 хвилин**.

### LENS
> *«12–13 угод — сигнал тривоги, не датасет для фіту формули.»*

На 3h M1 ≈ 180 барів / пару. Це достатньо для **локальної** оцінки σ, RV, H — **недостатньо** для тренування LSTM «прогнозувати FX».  
Будь-яка «формула з 3h графіка», підігнана під сьогоднішні 13 угод = **overfit до шуму**.

### ORACLE
> *«Формулюємо задачу правильно.»*

**Не:** \(\hat{S}_{t+\tau}\)  
**Так:** оцінити на горизонті \(\tau\) (напр. 5–36 M5 барів):

\[
\begin{aligned}
p_+ &= P(\text{hit TP before SL} \mid \mathcal{F}_{3h}) \\
p_- &= P(\text{hit SL before TP} \mid \mathcal{F}_{3h}) \\
M &= p_+ R - p_- \cdot 1 \\
\kappa &= \text{confidence / model disagreement}
\end{aligned}
\]

Рішення: торгувати лише якщо \(M > M_{\min}\) і \(\kappa > \kappa_{\min}\).

---

## Раунд 1 — Що каже графік за 3 години (інформаційний зміст)

### SPECTRA — волатильність і стрибки
З closes \(C_t\) на M1/M5 за вікно \(W=3h\):

| Ознака | Формула / сенс |
|--------|----------------|
| Realized variance | \(RV = \sum r_t^2\), \(r_t=\ln C_t/C_{t-1}\) |
| bipower variation | \(BV\) — відділити continuous vol від jumps |
| Jump share | \(J = \max(RV-BV,0)/RV\) |
| Parkinson / Garman-Klass | high-low estimators (ефективніше за close-close) |
| Vol-of-vol | std(локальних σ вікон 15–30 хв) |

**Інтерпретація життя/смерті:** якщо \(J\) високий — GBM barrier **бреше** (хвости). Потрібні jump-aware бар’єри або **заборона входу**.

### FRACTAL — пам’ять
Hurst \(H\) (вже є) на 3h:

| H | Режим | Наслідок для стратегії |
|---|-------|------------------------|
| \(H>0.55\) | тренд / персистентність | fade/sweep проти тренду = смерть |
| \(H\approx 0.5\) | майже random walk | edge лише від microstructure / levels |
| \(H<0.45\) | mean-reversion | fade екстремуму можливий |

**Критично:** рахувати \(H\) не один раз на 3h, а **ковзне** (30–60 хв) → \(H(t)\). Злам режиму = kill-switch.

### ORBIT — моделі шляху (кандидати)

1. **GBM / BM+drift** (вже): \(dS = \mu dt + \sigma dW\) → barrier formula.  
   *Слабкість:* постійні μ,σ; немає стрибків; FX часто mean-revert інтрадей.

2. **Ornstein–Uhlenbeck (OU):** \(dX = \theta(\bar{X}-X)dt + \sigma dW\)  
   Краще для mean-reversion після sweep. Оцінка \(\theta,\bar{X},\sigma\) з 3h M1.

3. **Jump-diffusion (Merton):** \(dS/S = \mu dt + \sigma dW + J dN\)  
   Якщо SPECTRA бачить jumps — інакше P(hit) завищений.

4. **Regime-switching (2-state HMM):** Quiet / Violent.  
   Параметри \(\mu_i,\sigma_i\), переходи \(P_{ij}\). Вхід лише в режимі, де historical M>0.

5. **Local-vol / Dupire-lite:** \(\sigma=\sigma(S,t)\) з realized smile proxy (немає опціонної поверхні на Capital demo — лише з OHLC).

### KALMAN — online оцінка
Не фіксувати μ,σ раз на вхід. Фільтр:

\[
\begin{aligned}
x_t &= (\mu_t, \ln\sigma_t) \\
\text{observation} &= r_t
\end{aligned}
\]

Дає **поточний** дрифт з uncertainty band. Якщо \(|\hat\mu|/\mathrm{se}(\hat\mu) < z_{\min}\) — дрифт незначущий → **не торгувати напрямок**, лише skip або tighter gate.

### ATLAS — графік ≠ returns
3h графік містить структуру, яку returns вбивають:

- PDH/PDL, Asian H/L, EQ, FVG, MSS  
- **відстань до рівня в σ-одиницях:** \(d_\sigma = \Delta_{\text{price}} / \hat\sigma_{3h}\)  
- **час біля рівня** (sojourn) — liquidity hunt часто перед імпульсом  

Формула без levels на FX scalp = сліпий дифузійний шум.

### ECHO — календар усередині 3h
3h «тиші» ≠ 3h «після CPI».  
Ознака: `minutes_to_high_impact`, `session_phase ∈ {Asia,London,NY,dead}`.  
Без цього одна й та сама формула вбиває в різні години.

### FORGE — realism у P
Будь-яка \(p_+\) має зменшуватись на вартість шляху:

\[
p_+^{\text{net}} = p_+^{\text{gross}} \cdot \underbrace{(1 - c_{\text{spread/slip}})}_{\text{friction}}
\]

Миттєвий `stop_usd` у журналі = часто **не «прогноз поганий»**, а **вхід у шум спреду / занадто великий лот відносно мікро-руху**. Математика напрямку і математика fill — різні рівняння.

### PIXEL — ML без ілюзій
На 3h × N пар:

| Можна | Не можна |
|-------|----------|
| Класифікувати режим (H, RV, jump) | Передбачити знак next 5m з accuracy 70%+ стабільно |
| Meta-label: take/skip при вже відомому setup | «Ціна буде 1.0850» |
| Calibration plot score→WR | Deep LSTM без walk-forward = театр |

NN лише як **четвертий голос** у Bayesian average, не як oracle.

---

## Раунд 2 — Канонічна цільова величина (консенсус математиків)

Усі стохастики згодні: **оптимальна «формула передбачення коливань» для торгівлі** — не ціна, а **функція шляху**:

\[
\boxed{
\Theta_t = f\!\left(
\underbrace{\hat\mu_t,\hat\sigma_t,H_t,J_t}_{\text{dynamics 3h}},
\underbrace{d_\sigma,\text{side}}_{\text{setup geometry}},
\underbrace{\text{session},\text{news}}_{\text{context}},
\underbrace{\text{spread},\text{slip}}_{\text{friction}}
\right)
=
\bigl(p_+^{\text{net}},\, M,\, \kappa\bigr)
}
\]

Торгове правило життя/смерті:

\[
\text{ENTER} \iff
M \ge M_{\min}
\;\wedge\;
\kappa \ge \kappa_{\min}
\;\wedge\;
J < J_{\max}
\;\wedge\;
\text{regime} \in \mathcal{R}_{\text{allowed}}
\]

Інакше **SKIP** (найприбутковіша дія при WR 23%).

---

## Раунд 3 — Конкретна складена формула (пропозиція ORBIT+NOVA+KALMAN)

### Крок A — Оцінки з 3h (M1 primary, M5 confirm)

\[
\begin{aligned}
r_t &= \ln(C_t/C_{t-1}) \\
\hat\sigma_{\Delta} &= \sqrt{\tfrac{1}{n}\sum r_t^2}\quad(\text{або Parkinson}) \\
\hat\mu_{\Delta} &= \text{Kalman / EWMA drift} \\
H &= \mathrm{Hurst}_{R/S}(C_{3h}) \\
J &= \max(RV-BV,0)/RV
\end{aligned}
\]

### Крок B — Геометрія угоди в σ-одиницях

\[
a = \frac{|entry - SL|}{\hat\sigma_{\text{path}}},\quad
b = \frac{|TP - entry|}{\hat\sigma_{\text{path}}}
\]

(де \(\hat\sigma_{\text{path}}\) — σ на горизонт утримання, не «сирий» bar σ без масштабу часу).

### Крок C — Ансамбль ймовірностей (не одна модель)

\[
\begin{aligned}
p_{\text{GBM}} &= P_{\text{barrier}}(a,b,\hat\mu,\hat\sigma) \\
p_{\text{MC}} &= P_{\text{bootstrap paths}} \\
p_{\text{OU}} &= P_{\text{OU hit}}(\theta,\bar X,\sigma) \quad\text{(якщо } H<0.48\text{)} \\
p_{\text{jump}} &= P_{\text{jump-diff}} \quad\text{(якщо } J>J_*\text{ else N/A)}
\end{aligned}
\]

Bayesian / лінійна суміш:

\[
p_+ = \sum_k w_k\, p_k,\quad
w_k \propto \exp\!\bigl(-\mathrm{CV\_error}_k\bigr)\cdot \mathbb{1}_{k\text{ valid}}
\]

\[
\kappa = 1 - \mathrm{std}(\{p_k\}) \quad\text{(згода моделей)}
\]

### Крок D — Expectancy і напрямок

\[
M = p_+^{\text{net}} \cdot R - (1-p_+^{\text{net}})
\]

\[
\mathrm{side}^* = \arg\max_{\text{long/short}} M
\quad\text{(якщо }|M_{\text{long}}-M_{\text{short}}| < \varepsilon \Rightarrow \mathrm{SKIP})
\]

Це і є відповідь на «передбачити коливання»: **який бік і чи варто взагалі**, з числами з 3h графіка + геометрії TP/SL.

### Крок E — Анти-смерть фільтри (з вашого журналу)

Спостереження: entry і `stop_usd` часто **в одну секунду** ⇒ шлях не «програний за 10 барів», а **вбитий мікроструктурою**.

Обов’язкові члени формули:

1. \( \hat\sigma_{\text{1m}} \cdot \text{units} \cdot \text{pipValue} < \alpha \cdot \mathrm{StopUSD} \)  
   (інакше один тік = стоп)  
2. \( \text{spread} / \hat\sigma_{\text{5m}} < \beta \)  
3. Заборона входу якщо \(J\) високий або news < N хв  
4. Cooldown не лише 5 хв на пару, а **на режим**: після 3 stop_usd поспіль → \(M_{\min}\) підняти або pause

---

## Раунд 4 — Суперечка (гостро)

**PIXEL:** Давайте XGBoost на фічах 3h.  
**LENS:** Sample size вб’є вас. Спочатку ансамбль класичних \(p_k\), walk-forward по днях.  
**ATLAS:** Без levels ваша GBM — академічна іграшка.  
**ORBIT:** Levels задають a,b; процес задає p. Обидва.  
**FORGE:** Підніміть friction у p інакше знову 23% WR при «гарних» P.  
**ECHO:** Одна формула на Asia і London = самогубство; \(w_k=w_k(\text{session})\).  
**NOVA:** Invert без path-math дав 3W/10L — polarity ≠ edge. Потрібен Θ, не дзеркало.  
**ORACLE:** Досить. Нижче — план без коду.

---

## Раунд 5 — Протокол валідації (як на війні)

Поки **немає** коду — вимагаємо доказ на даних:

### Baseline (обов’язкові)

| # | Baseline | Правило |
|---|----------|---------|
| B0 | Always skip | PnL=0 |
| B1 | Random side | p=0.5 |
| B2 | Current CHARLIE+math gate | as live |
| B3 | Invert only | вже тестували |
| B4 | Θ-gate (цільова формула) | ENTER iff умови |

### Метрики (не vanity)

- Net PnL, Max DD, PF, WR  
- **Calibration:** predicted \(p_+\) vs realized hit rate (bins)  
- **Brier score** / log-loss для p  
- Час до стопу (медіана) — якщо ≈0, проблема fill не forecast  
- Stability across sessions (London vs mid)

### Дані з графіка 3h (мінімальний feature store — пізніше)

На кожен потенційний setup:

`pair, ts, H, RV, BV, J, μ̂, σ̂, d_σ, session, spread, a, b, p_GBM, p_MC, p_OU, M, κ, outcome`

Без цього «формула» не фальсифікується.

---

## Фінальний вердикт ORACLE

### Що НЕ казати собі
- «Знайдемо формулу, яка передбачає коливання валюти» як точкова ціна.  
- «13 угод доводять invert / будь-який тюнінг».  
- «Нейромережа врятує 3 години графіка».

### Що є максимально близьким до істини
1. Коливання на 3h **описуються** локальною динамікою \((\hat\mu,\hat\sigma,H,J)\).  
2. Торговий edge — у **ймовірності бар’єрів і режиму**, не в foresight ціни.  
3. Канон: ансамбль GBM+MC+OU(+jump) → \(p_+,\kappa\) → \(M\) → ENTER/SKIP.  
4. Ваш журнал кричить: спочатку **мікроструктурний стоп-вбивця**, інакше найкраща path-math мертва на вході.  
5. Існуючий Math Path Gate — **скелет правильний**, але:  
   - μ/σ занадто грубі / не Kalman  
   - немає jump/OU режиму  
   - немає κ (disagree)  
   - friction і tick-vs-stopUSD не в рівнянні  
   - invert не замінює Θ  

### Одностроковий закон
> **Не передбачаємо валюту — оцінюємо ймовірність виживання шляху до TP на основі 3h динаміки, геометрії та режиму; торгуємо лише коли математика expectancy і згода моделей перевищують поріг смерті.**

### Наступний крок (коли скажеш «коди» — не зараз)
1. Spec: feature store 3h + Θ pipeline (папір → код).  
2. Offline replay на journal+bars vs baselines B0–B4.  
3. Лише після calibration plot → увімкнути gate у worker.

---

## Додаток — карта моделей vs задача

| Модель | Що дає з 3h | Ризик смерті якщо ігнорувати |
|--------|-------------|------------------------------|
| GBM barrier | \(p_+\) при гладкій vol | jumps, mean-reversion |
| Monte Carlo bootstrap | емпіричні хвости returns | малий sample, режимний зсув |
| OU | fade/mean-reversion p | сильний тренд (H↑) |
| Jump-diff | хвостові стопи | «непояснені» миттєві SL |
| HMM regimes | коли торгувати взагалі | торгівля в чужому режимі |
| Kalman μ̂ | чи є значущий дрифт | торгівля шуму як тренду |
| Levels \(d_\sigma\) | де стоїть графік | дифузія без структури |
| Friction | реальний p | paper edge, live bleed |

**Кінець дебату. Код не писався.**
