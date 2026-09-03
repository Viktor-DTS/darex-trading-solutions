# DTS Assistant — архітектурний дебат (2026-03)

## Проблема

Патчі окремих regex-фраз не масштабуються: кожна нова формулювання («скільки виконав Петренко», «приват банку в роботі») потребує ручного виправлення.

## Варіанти

| Підхід | Плюси | Мінуси | Верdict |
|--------|-------|--------|---------|
| **A. Ще більше regex** | Швидко для одного кейсу | Не покриває синоніми/опечатки; регресії | ❌ |
| **B. RAG + LLM** | «Знає» документацію | Галюцинації по цифрах з MongoDB | ❌ для метрик |
| **C. Knowledge + Tools + LLM + Eval** | Цифри з БД; LLM форматує; eval ловить регресії | Потрібна початкова інфраструктура | ✅ |

## Обрана архітектура (C)

```
Користувач
    ↓
Planner (rule-based → пізніше function-calling)
    ↓
Tools: client_stats | engineer_stats | regional_stats | task_lookup | navigation_help
    ↓
MongoDB / analytics (джерело правди для чисел)
    ↓
Knowledge block (поля, статуси, визначення метрик)
    ↓
LLM (gpt-4o-mini) — формулювання відповіді, не вигадування цифр
    ↓
Eval suite (CI без LLM для planner/tools)
```

## Визначення метрик

- **client_stats** — `Task` де `client`/`clientName` містить назву; опційно `status`.
- **engineer_stats** — match по `engineer1..6` (текст ПІБ); «виконав» = `status: Виконано`.
- **regional_stats** — buckets по `serviceRegion` + статуси (як TasksStatisticsBar).
- **task_lookup** — `requestNumber` з padding (KV-997 → KV-0000997).

## Roadmap

1. ✅ `assistantKnowledge.js` — глосарій полів і метрик
2. ✅ `assistantToolRunner.js` + `engineerStatsTool.js`
3. ✅ Eval: `assistantEval/cases.json` + `scripts/runAssistantEval.js`
4. ⏳ Wire у `assistantChatRoutes.js`
5. ⏳ Phase 2: OpenAI function-calling для динамічного planner

## Очікування якості

Ціль — **80–90%** коректних відповідей на типові питання адмінів без патчів під кожну фразу. Повна паритетність з Cursor IDE agent недосяжна (немає доступу до всього коду в runtime), але tools+knowledge дають стабільні цифри.
