/**
 * Після збірки exe: копіює шаблон конфігу та створює bat для запуску.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

if (!fs.existsSync(dist)) {
  console.error('Папка dist/ відсутня. Спочатку: npm run build');
  process.exit(1);
}

const example = path.join(root, 'config.example.json');
if (fs.existsSync(example)) {
  const dest = path.join(dist, 'config.example.json');
  fs.copyFileSync(example, dest);
  if (!fs.existsSync(path.join(dist, 'config.json'))) {
    fs.copyFileSync(example, path.join(dist, 'config.json'));
    console.log('Створено dist/config.json з шаблону — відредагуйте пароль і token.');
  }
}

const startBat = `@echo off
chcp 65001 >nul
cd /d "%~dp0"
title DTS 1C Agent
if not exist config.json (
  echo Немає config.json. Скопіюйте config.example.json -^> config.json
  pause
  exit /b 1
)
echo Запуск DTS 1C Agent...
dts-onec-agent.exe
if errorlevel 1 pause
`;

fs.writeFileSync(path.join(dist, 'Запуск агента.bat'), startBat, 'utf8');

const testBat = `@echo off
chcp 65001 >nul
cd /d "%~dp0"
dts-onec-agent.exe --once
pause
`;

fs.writeFileSync(path.join(dist, 'Тест один раз.bat'), testBat, 'utf8');

const readme = `DTS 1C Agent (exe)
==================

1. Відредагуйте config.json (пароль bugai1c, agentToken, save.dir).
2. Запуск: подвійний клік «Запуск агента.bat» або dts-onec-agent.exe
3. Тест без сервера: «Тест один раз.bat» (прапорець --once)
4. Логи: папка logs\\

Автозапуск: ярлик «Запуск агента.bat» у shell:startup користувача V.Buhai.

Фронтенд DTS: Адміністратор → Агент 1С → Почати роботу
`;

fs.writeFileSync(path.join(dist, 'ПРОЧИТАЙТЕ.txt'), readme, 'utf8');
console.log('dist/ готово:', fs.readdirSync(dist).join(', '));
