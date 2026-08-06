# FX Scalp Agent — закриття проєкту

**Дата:** 2026-08-06  
**Статус:** CLOSED  
**Причина:** немає підтвердженої торгової переваги (edge).

## Підсумок

1. **CHARLIE / Testbot (live + sim)** — історичний expectancy від’ємний; gates (oracle, math, scratch, session, long-bias, Kelly) не дали стійкого E > 0.
2. **Multi-agent sandbox (R01–R20)** — «чемпіон» `BREAK-GBPUSD-R20m2` відхилено Claude-рев’ю (2026-08-06):
   - симулятор оцінював виходи лише по `close` (без high/low) → стоп 3п невидимий;
   - holdout n ≈ 10; «18 robust rounds» = ~3 унікальні перерахунки тих самих угод;
   - holdout став тренувальним через мутації між раундами;
   - живий шлях ≠ модель (repaint по незакритому бару + USD-шари виходу).
3. **Вердикт:** REJECT. Заявлене `holdoutE ≈ 9.24` — артефакт вимірювання, не edge.

## Що вимкнено при закритті

- `FX_AUTO_START_WORKER=0` — воркер не стартує сам
- `FX_TESTBOT_ENABLED=0` / `FX_TESTBOT_CHAMPION=0`
- `FX_CHARLIE_ALWAYS_ON=0`
- Нових записів у Capital live з цього стеку не планується

## Артефакти (залишити для архіву)

- `experiments/multi-agent-sandbox/` — протокол, кампанія, кеш
- `services/testbot/champions/BREAK-GBPUSD-R20m2.json` — знімок кандидата
- `docs/PROFITABILITY_ORACLE_5M_MANDATE.md` — попередній post-mortem

## Урок

Без бар’єрно-коректного бектесту (high/low + спред/прослизання) і справжнього out-of-sample будь-який «чемпіон» на малому вікні — шум. Не масштабувати в live без FT-1 (H/L resim) і незалежних даних.
