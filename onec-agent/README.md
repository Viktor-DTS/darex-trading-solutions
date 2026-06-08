# DTS 1С-агент

Локальний агент на **сервері 1С**: «Сформировать» → зберегти `.xlsx` → імпорт у DTS.

Тригери: кнопка «Почати роботу» (DTS → Адміністратор → Агент 1С) і розклад 08:00 / 12:00 / 16:00.

---

## Рекомендовано: portable-пакет (без Node.js на сервері 1С)

На **вашому ПК** (де є Node.js для збірки) один раз:

```powershell
cd C:\dts-service\darex-trading-solutions\onec-agent
.\build-portable.bat
```

Скопіюйте папку **`dist-portable\`** на сервер 1С (напр. `Desktop\onec-agent`). Там уже є `node\node.exe` — на сервері Node встановлювати **не потрібно**.

| Файл | Призначення |
|------|-------------|
| `Start-Agent.bat` | Старт агента |
| `Test-Once.bat` | Разовий цикл |
| `config.json` | Налаштування |

---

## Альтернатива: один файл `.exe` (pkg)

Потребує Git/patch на ПК збірки; часто довго або падає з 404. Якщо все ж потрібен exe:

```powershell
.\build.bat
```

У папці `dist\` — `dts-onec-agent.exe` + `config.json` + bat-файли.

### 2. Копіювання на сервер 1С

Скопіюйте **всю папку** `dist\` на робочий стіл, наприклад:

`C:\Users\V.Buhai\Desktop\onec-agent\`

(усередині мають лежати `dts-onec-agent.exe` і `config.json` **в одній теці**).

### 3. Налаштування `config.json`

- `dts.login` → `bugai1c`, `dts.password` → пароль користувача
- `dts.apiBaseUrl` → `https://darex-trading-solutions.onrender.com/api`
- `agentToken` — свій секрет (той самий у вкладці «Агент 1С» → Agent token)
- `save.dir` → `C:\\Users\\V.Buhai\\Desktop\\Залишки на складах імпорт`

Спершу: `"dts": { "dryRun": true }` і `"automation": { "enabled": false }`, покладіть готовий xlsx у `save.dir`, запустіть **«Тест один раз.bat»**.

### 4. Запуск на сервері

Подвійний клік **«Запуск агента.bat»** (вікно консолі не закривайте — агент працює).

Автозапуск: ярлик `Запуск агента.bat` → Win+R → `shell:startup`.

### Команди exe

```text
dts-onec-agent.exe          — сервер http://127.0.0.1:8765
dts-onec-agent.exe --once   — один цикл і вихід
```

`config.json` і папка `logs\` завжди **поруч із exe**, не всередині програми.

> **Емуляція 1С (nut.js)** у збірці exe може бути недоступна. Тоді вручну натискайте «Сформировать»/«Зберегти» в 1С, а агент лише забере найновіший файл з `save.dir` і завантажить у DTS (`automation.enabled: false`).

---

## Альтернатива: запуск через Node.js

```powershell
npm install
copy config.example.json config.json
npm start
```

Разовий тест: `npm run run-once` або `node src/runOnce.js`.

## Калібрування `automation.steps`

- `focusWindow`, `key`, `type`, `click`, `wait`, `screenshot`, `comment`
- Плейсхолдери: `{{filePath}}`, `{{fileName}}`, `{{ts}}`

Типово: фокус 1С → Ctrl+Enter → пауза → Ctrl+S → `{{filePath}}` → Enter.

Скриншоти помилок: `logs\` поруч із exe.
