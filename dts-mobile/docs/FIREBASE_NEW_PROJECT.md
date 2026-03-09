# Новий Firebase-проєкт під особистим акаунтом

Покрокова інструкція для обходу політики організації darex.energy.

---

## Крок 1: Вийти з корпоративного акаунту

1. Відкрий [Firebase Console](https://console.firebase.google.com)
2. Клікни на іконку профілю (праворуч зверху) → **Вийти** (Sign out)
3. Або відкрий **приватне вікно** (Ctrl+Shift+N) і зайди під **особистим Gmail** (не @darex.energy)

---

## Крок 2: Створити новий проєкт

1. [Firebase Console](https://console.firebase.google.com) → **Create a project**
2. **Project name:** наприклад `dts-mobile-push`
3. **Project ID:** наприклад `dts-mobile-push` (уникальний)
4. Google Analytics — можна вимкнути
5. **Create project**

---

## Крок 3: Додати Android-додаток

1. У проєкті → іконка **Android**
2. **Android package name:** `com.dts_mobile` (як у build.gradle)
3. **App nickname:** DTS Mobile
4. **Register app**
5. **Download google-services.json** → зберегти файл

---

## Крок 4: Змінити google-services.json у проєкті

Скопіюй завантажений `google-services.json` сюди:

```
c:\dts-service\dts-mobile\android\app\google-services.json
```

(замінити існуючий файл)

---

## Крок 5: Отримати Service Account Key

1. Firebase Console → **Project settings** (шестерінка) → **Service accounts**
2. **Generate new private key** → **Generate key**
3. Завантажиться JSON-файл (наприклад `dts-mobile-push-firebase-adminsdk-xxxxx.json`)
4. Зберегти файл в безпечному місці

---

## Крок 6: Налаштувати Render

1. Render → твій backend-сервіс → **Environment**
2. Додай змінну:
   - **Key:** `FIREBASE_SERVICE_ACCOUNT`
   - **Value:** відкрий завантажений JSON у текстовому редакторі, скопіюй **весь вміст** (включно з `{` та `}`), вставити в один рядок без переносів

---

## Крок 7: Пересобрати мобільний додаток

```powershell
cd c:\dts-service\dts-mobile
flutter clean
flutter pub get
flutter build apk
```

---

## Чекліст

- [ ] Вийти з darex.energy / увійти в особистий Gmail
- [ ] Створити Firebase-проєкт (dts-mobile-push або інша назва)
- [ ] Додати Android app з package `com.dts_mobile`
- [ ] Завантажити google-services.json
- [ ] Замінити `dts-mobile/android/app/google-services.json`
- [ ] Згенерувати Service Account Key
- [ ] Додати FIREBASE_SERVICE_ACCOUNT на Render
- [ ] Зробити deploy бекенду
- [ ] flutter build apk

---

**Примітка:** Старий проєкт darex-trading-mobile залишається. Тестові push з Firebase Console будуть надходити з нового проєкту.
