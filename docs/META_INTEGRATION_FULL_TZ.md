# Повне ТЗ: Meta / Instagram → CRM DTS

**Версія:** 2.0 · **Дата:** 2026-08-04  
**Система:** Darex Trading Solutions — панель «Маркетинговий віділ»  
**Backend:** `https://darex-trading-solutions.onrender.com`

---

## Зміст

1. [Загальна архітектура](#1-загальна-архітектура)
2. [Етап 1 — Lead Ads (форми в рекламі)](#2-етап-1--lead-ads)
3. [Етап 2 — Direct + коментарі](#3-етап-2--direct--коментарі)
4. [UTM та атрибуція](#4-utm-та-атрибуція)
5. [Сайт / PixelYourSite](#5-сайт--pixelyoursite)
6. [Env-змінні Render (DTS)](#6-env-змінні-render-dts)
7. [Налаштування Meta App (адмін Meta)](#7-налаштування-meta-app)
8. [App Review та дозволи](#8-app-review-та-дозволи)
9. [Тестування](#9-тестування)
10. [FAQ для адмінів Meta](#10-faq)

---

## 1. Загальна архітектура

```
┌─────────────────────────────────────────────────────────────┐
│  Meta / Instagram                                           │
│  • Lead Ads forms    • Direct (DM)    • Comments            │
└───────────────┬─────────────────┬───────────────┬───────────┘
                │                 │               │
                ▼                 ▼               ▼
     POST /api/marketing/webhooks/meta  (один URL)
                │
                ▼
     CRM DTS — Маркетинговий віділ → Менеджери
```

**Один Webhook URL для всього Meta:**

```
https://darex-trading-solutions.onrender.com/api/marketing/webhooks/meta
```

**Verify Token** — задає DTS/IT, однаковий у Meta App і Render (`META_VERIFY_TOKEN`).

---

## 2. Етап 1 — Lead Ads

### Що автоматично потрапляє в CRM

| Дані | Поле CRM |
|------|----------|
| Ім’я, телефон, email, місто | clientName, contactPhone, … |
| campaign / adset / ad / form (ID + назви) | metaCampaign*, metaAd*, Graph API |
| UTM (авто-мапінг) | utm_source=meta, utm_campaign=назва кампанії |
| Тип взаємодії | interactionType = `lead_form` |

### Підписки webhook (Object: **Page**)

| Field | Обов’язково |
|-------|-------------|
| `leadgen` | ✅ Етап 1 |

### Що передати DTS після налаштування

- App ID, App Secret  
- Page Access Token (`leads_retrieval`)  
- Page ID, Lead Form IDs  
- Підтвердження: webhook **Verified**

*Деталі: `docs/META_LEAD_ADS_TZ.md`*

---

## 3. Етап 2 — Direct + коментарі

> **Статус коду:** реалізовано в DTS.  
> **Увімкнення на Render:** після налаштувань Meta встановити env `META_PHASE2_MESSAGING=1` та/або `META_PHASE2_COMMENTS=1`.

### 3.1 Instagram / Facebook Direct (Messenger)

**Сценарій для клієнта:**
1. Пише в Direct / Messenger → `/start`
2. Бот: ім’я → телефон → місто → продукт
3. Створюється лід `ML-xxxxx` у CRM
4. `interactionType` = `direct_message`

**Підписки webhook:**

| Object | Field | Env DTS |
|--------|-------|---------|
| Page | `messages` | `META_PHASE2_MESSAGING=1` |
| Instagram | `messages` | `META_PHASE2_MESSAGING=1` |

**Додаткові дозволи:** `pages_messaging`, `instagram_manage_messages`

### 3.2 Коментарі Instagram / Facebook

**Сценарій:**
1. Користувач залишає коментар під постом/рекламою
2. Webhook → CRM створює лід з текстом коментаря
3. `interactionType` = `comment`, пріоритет **high**
4. Маркетинг зв’язується в Direct для отримання телефону

**Підписки webhook:**

| Object | Field | Env DTS |
|--------|-------|---------|
| Page | `feed` (comments) | `META_PHASE2_COMMENTS=1` |
| Instagram | `comments` | `META_PHASE2_COMMENTS=1` |

**Додаткові дозволи:** `instagram_manage_comments`, `pages_manage_engagement`, `pages_read_engagement`

**Опційно — авто-відповідь на коментар:**

```env
META_COMMENT_AUTO_REPLY=1
META_COMMENT_REPLY_TEXT=@username Дякуємо! Напишіть нам у Direct...
```

*(Потребує прав на відповіді; може вимагати App Review.)*

### 3.3 Що НЕ входить автоматично

| Канал | Примітка |
|-------|----------|
| Особисті DM без /start | Потрібен welcome message / реклама «Message» |
| Старі коментарі | Тільки нові після підключення webhook |
| WhatsApp | Окремий Meta product |

---

## 4. UTM та атрибуція

### Lead Ads (Етап 1)

Meta не передає класичні UTM у webhook. DTS **формує**:

| UTM | Значення |
|-----|----------|
| utm_source | meta |
| utm_medium | paid_social |
| utm_campaign | назва кампанії (Graph API) |
| utm_content | назва оголошення |
| utm_term | ad_id / form |

### Direct (Етап 2)

| utm_medium | direct_message |
| utm_source | meta |

### Коментарі (Етап 2)

| utm_medium | comment |
| utm_content | post_id / media_id |

### Custom UTM у Lead Form

Якщо в формі є custom questions `utm_campaign`, `utm_content` — вони **перекривають** автоматичні.

### Повні UTM з landing (PixelYourSite)

Див. розділ 5 — через inbound API сайту.

---

## 5. Сайт / PixelYourSite

Якщо клієнт заходить на сайт з UTM (приклад з email-звіту):

```
utm_source=meta
utm_medium=paid_social
utm_campaign=30_07_2026_rozmovni_girl
utm_content=video_pro_nigti_zgaduesh
utm_term=120250587682150541
landing: https://led-global.com/
traffic source: instagram.com
```

**Сайт має POST на:**

```
POST https://darex-trading-solutions.onrender.com/api/marketing/leads/inbound
Header: X-Marketing-Api-Key: <MARKETING_INBOUND_API_KEY>
```

**Body:**

```json
{
  "source": "website",
  "clientName": "...",
  "contactPhone": "+380...",
  "landingPage": "https://led-global.com/",
  "trafficSource": "instagram.com",
  "utmSource": "meta",
  "utmMedium": "paid_social",
  "utmCampaign": "30_07_2026_rozmovni_girl",
  "utmContent": "video_pro_nigti_zgaduesh",
  "utmTerm": "120250587682150541"
}
```

*Налаштування PixelYourSite / WooCommerce — на стороні сайту (окреме ТЗ для web-розробника).*

---

## 6. Env-змінні Render (DTS)

### Базові (Етап 1)

```env
MARKETING_PUBLIC_BASE_URL=https://darex-trading-solutions.onrender.com
META_APP_ID=
META_APP_SECRET=
META_PAGE_ACCESS_TOKEN=
META_VERIFY_TOKEN=
META_DEFAULT_PLATFORM=instagram
MARKETING_DEDUP_DAYS=30
MARKETING_DEDUP_MODE=warn
```

### Етап 2 (увімкнути після Meta)

```env
META_PHASE2_MESSAGING=1
META_PHASE2_COMMENTS=1
META_COMMENT_AUTO_REPLY=0
META_COMMENT_REPLY_TEXT=@username Дякуємо! Напишіть у Direct...
```

### Сайт

```env
MARKETING_INBOUND_API_KEY=
```

---

## 7. Налаштування Meta App

### 7.1 Developer App → Webhooks

**URL:** `https://darex-trading-solutions.onrender.com/api/marketing/webhooks/meta`  
**Verify Token:** = `META_VERIFY_TOKEN`

### 7.2 Підписки (повний набір)

**Object: Page**

| Field | Етап |
|-------|------|
| leadgen | 1 |
| messages | 2 |
| feed | 2 |

**Object: Instagram** *(Instagram Business + Page linked)*

| Field | Етап |
|-------|------|
| comments | 2 |
| messages | 2 |

### 7.3 Instagram Business Account

1. Instagram Professional/Business  
2. Прив’язка до Facebook Page  
3. У Meta App → Instagram → додати IG account  

### 7.4 Що передати DTS після налаштування

| # | Дані |
|---|------|
| 1 | App ID, App Secret |
| 2 | Page Access Token (long-lived) |
| 3 | Page ID, Instagram Business Account ID |
| 4 | Lead Form IDs |
| 5 | Скрін: webhook Verified + список subscribed fields |
| 6 | Підтвердження App Review (якщо потрібно для messaging/comments) |

---

## 8. App Review та дозволи

### Мінімум для Етап 1 (Lead Ads)

- `leads_retrieval`
- `pages_manage_metadata`
- `pages_read_engagement`

### Додатково для Етап 2

| Permission | Для чого |
|------------|----------|
| pages_messaging | Facebook Messenger |
| instagram_manage_messages | Instagram Direct |
| instagram_manage_comments | коментарі IG |
| pages_manage_engagement | відповіді FB |

**App Review:** для production доступу до messaging/comments Meta може вимагати:
- опис use case (CRM для заявок на обладнання)
- screencast бота / webhook
- Privacy Policy URL

---

## 9. Тестування

### Етап 1
- [ ] Test Lead Form submit → лід у DTS з UTM + campaign name
- [ ] interactionType = lead_form

### Етап 2 Direct
- [ ] Написати в Instagram Direct → /start → пройти діалог
- [ ] Лід з телефоном, interactionType = direct_message

### Етап 2 Comments
- [ ] Коментар під IG post → лід у DTS (comment, без телефону)
- [ ] Маркетинг бачить @username, текст коментаря

### Загальне
- [ ] Призначити менеджера → Передати → вкладка «Запити з зовнішньої реклами»

---

## 10. FAQ

**Q: Один webhook чи кілька?**  
A: Один URL `/api/marketing/webhooks/meta` для page + instagram objects.

**Q: Чи тягнуться Direct і коментарі разом з Lead Ads?**  
A: Так, після підписки fields + env META_PHASE2_*=1 на Render.

**Q: Чи є UTM?**  
A: Lead Ads — авто-мапінг + Graph API. Повні UTM — через сайт/inbound API.

**Q: Verify Token хто генерує?**  
A: DTS/IT. Meta лише перевіряє збіг.

**Q: Коли вмикати Етап 2 на Render?**  
A: Після того, як адмін Meta підписав fields і (за потреби) пройшов App Review.

---

## Додаток — лист адміну Meta (RU/UA)

```
Тема: Подключение Meta → CRM DTS (Lead Ads + Direct + Comments)

Webhook URL (единый):
https://darex-trading-solutions.onrender.com/api/marketing/webhooks/meta

Verify Token: [от DTS]

Подписки:
• Page: leadgen, messages, feed
• Instagram: comments, messages

Нужны permissions:
leads_retrieval, pages_messaging, instagram_manage_messages,
instagram_manage_comments, pages_manage_engagement

После настройки прислать:
App ID, App Secret, Page Access Token, Page ID, IG Business Account ID,
Lead Form IDs, скрин Verified webhook.

CRM автоматически получает:
• Lead Forms + UTM mapping
• Direct (диалог заявки по /start)
• Comments (лид для обработки маркетингом)

Полное ТЗ: META_INTEGRATION_FULL_TZ.md
```

---

*Документ для передачи команде Meta / маркетингу. После их настройки — DTS включает env и проводит тест.*
