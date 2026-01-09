# Render Build Fix

Якщо бекенд не запускається на Render з помилками типу:
- `Cannot find module './debug'`
- `Cannot find module './router'`

**Рішення:** Змініть Build Command в Render Dashboard:

**Замість:** `npm install`  
**Використайте:** `npm ci`

Це забезпечить чисте встановлення з `package-lock.json` без "плаваючих" версій.

---

**Альтернатива:** Якщо `npm ci` не працює, скрипт `postinstall` автоматично спробує виправити биті залежності.
