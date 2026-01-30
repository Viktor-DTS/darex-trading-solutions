# DTS Mobile (Flutter)

Мобільний клієнт DTS Service для Android та iOS.

## Що реалізовано (MVP)

- **Авторизація**: логін, збереження токена та користувача (Secure Storage), AuthGate.
- **Головний екран**: модулі за роллю (Сервіс, Оператор, Склад, Тестування, Менеджери).
- **Сервіс**: список заявок, фільтр по статусу/пошук, деталі заявки, зміна статусу, звіт (роботи, матеріали, транспорт), завантаження фото (камера/галерея).
- **Оператор**: майстер створення заявки (клієнт, ЄДРПОУ, адреса, регіон, планова дата, контакт), чернетки, підтягування даних по ЄДРПОУ.
- **Склад**: обладнання, «в дорозі», підтвердження отримання, переміщення/відвантаження, документи переміщення та відвантаження, додавання обладнання, batch move/ship.
- **Тестування**: заявки на тестування, деталі, завершення тесту, фото.
- **Менеджери**: огляд заявок, статистика, деталі, таймлайн.

## Запуск

1. **Платформи** (якщо ще немає папок `android/` та `ios/`):
   ```bash
   cd dts-mobile
   flutter create . --platforms=android,ios
   ```

2. **API**: у `lib/core/config.dart` вказано базовий URL бекенду (без `/api` у кінці). За потреби змініть `AppConfig.apiBaseUrl` на свій сервер.

3. **Залежності та запуск**:
   ```bash
   flutter pub get
   flutter run
   ```

## Дозволи для фото (камера / галерея)

Після `flutter create .` додайте дозволи:

### Android

У файл `android/app/src/main/AndroidManifest.xml` всередині тега `<manifest>` (наприклад, перед `<application>`):

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
```

### iOS

У `ios/Runner/Info.plist` додайте:

```xml
<key>NSCameraUsageDescription</key>
<string>ДТС потребує доступу до камери для фото звітів</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>ДТС потребує доступу до галереї для додавання фото</string>
```

## Наступні кроки (опційно)

- Офлайн-режим або кеш для списків.
- Push-сповіщення для нових заявок.
- Покращена обробка помилок мережі та повторні спроби.
- Темна тема.
