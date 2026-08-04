# ТЗ: інтеграція Meta Lead Ads → CRM DTS (Darex Trading Solutions)

> **Оновлено:** повне ТЗ (Етап 1 + 2) — див. **`META_INTEGRATION_FULL_TZ.md`**

**Версія:** 1.1 · **Дата:** 2026-08-04  
**CRM:** Маркетинговий віділ DTS  
**Backend (Render):** `https://darex-trading-solutions.onrender.com`

---

## 1. Мета

Автоматично отримувати заявки з **Facebook / Instagram Lead Ads** у панель **«Маркетинговий віділ»** з повною атрибуцією реклами (кампанія, ad set, оголошення, UTM) і передавати їх менеджерам.

---

## 2. Що вже реалізовано на стороні DTS

| Функція | Статус |
|---------|--------|
| Webhook Meta Lead Ads (`leadgen`) | ✅ |
| Завантаження даних ліда через Graph API | ✅ |
| Назви кампанії / ad set / ad / form (Graph API) | ✅ |
| UTM-поля (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`) | ✅ |
| Instagram vs Facebook (джерело `instagram` / `facebook`) | ✅ |
| `trafficSource`, `landingPage`, `referrer` (сайт / custom fields) | ✅ |
| Дедуплікація за телефоном / email / metaLeadId | ✅ |
| Передача менеджеру + вкладка «Запити з зовнішньої реклами» | ✅ |

### Webhook URL (Callback URL для Meta)

```
https://darex-trading-solutions.onrender.com/api/marketing/webhooks/meta
```

### Verify Token

Задає **замовник (DTS / IT)**, однаковий у Meta App і на Render:

```
META_VERIFY_TOKEN=DTS_meta_verify_2026_xK9m   ← приклад, замінити на свій
```

---

## 3. Що потрібно зробити адміністратору Meta

### 3.1. Developer App (developers.facebook.com)

1. Створити або відкрити **Facebook App** (тип: Business).
2. Додати продукт **Webhooks**.
3. Object: **Page** → Subscribe: **`leadgen`**.
4. **Callback URL:** (див. вище).
5. **Verify Token:** (див. вище) → **Verify and Save**.
6. Переконатися, що статус webhook: **Verified**.

### 3.2. Права Page Access Token

Token має бути **long-lived** з правами:

- `leads_retrieval` — **обов’язково**
- `pages_manage_metadata`
- `pages_read_engagement`
- `pages_show_list`

**Де отримати:** Meta Business Suite → System User → Generate Token  
або Graph API Explorer → Page → Generate Access Token.

### 3.3. Lead Forms

- Форми лідів прив’язані до **Facebook Page** (тієї ж, що в webhook).
- Рекламні кампанії використовують **Lead generation** objective.
- Надати замовнику список **Form ID** активних форм.

### 3.4. Що передати замовнику DTS (безпечним каналом)

| Дані | Env на Render |
|------|----------------|
| App ID | `META_APP_ID` |
| App Secret | `META_APP_SECRET` |
| Page Access Token | `META_PAGE_ACCESS_TOKEN` |
| Verify Token (той самий) | `META_VERIFY_TOKEN` |
| Page ID | для перевірки (не обов’язково в env) |
| Lead Form IDs | для перевірки |

---

## 4. Які дані автоматично потрапляють у CRM

### 4.1. З форми ліда (Lead Form)

| Поле Meta | Поле DTS |
|-----------|----------|
| full_name | clientName |
| phone_number | contactPhone |
| email | contactEmail |
| city | city |
| custom questions | productInterest / comment |

### 4.2. Атрибуція реклами (webhook + Graph API)

| Дані | Поле DTS |
|------|----------|
| leadgen_id | metaLeadId |
| form_id | metaFormId + metaFormName |
| ad_id | metaAdId + metaAdName |
| adgroup_id (ad set) | metaAdsetId + metaAdsetName |
| campaign (через Graph API) | metaCampaignId + metaCampaignName |
| Платформа IG/FB | metaPlatform, source |

### 4.3. UTM (автоматичний мапінг для Lead Ads)

Meta Lead Ads **не передає класичні UTM-рядки** у webhook. DTS **формує UTM** з назв кампаній:

| UTM | Значення за замовчуванням |
|-----|---------------------------|
| utm_source | `meta` |
| utm_medium | `paid_social` |
| utm_campaign | назва кампанії Meta |
| utm_content | назва оголошення або ad set |
| utm_term | ad_id або назва форми |
| trafficSource | `instagram.com` або `facebook.com` |

Якщо в **custom questions** форми додати поля `utm_campaign`, `utm_content` тощо — вони **перекриють** автоматичні значення.

---

## 5. UTM з сайту (повний трекінг як PixelYourSite)

Якщо клієнт спочатку заходить на **landing** (наприклад `led-global.com`) з UTM у посиланні, а потім залишає заявку — потрібен **сайт → DTS inbound API**:

```
POST https://darex-trading-solutions.onrender.com/api/marketing/leads/inbound
Header: X-Marketing-Api-Key: <MARKETING_INBOUND_API_KEY>
```

**Body (приклад):**

```json
{
  "source": "website",
  "clientName": "Іван Петренко",
  "contactPhone": "+380501234567",
  "landingPage": "https://led-global.com/",
  "trafficSource": "instagram.com",
  "utmSource": "meta",
  "utmMedium": "paid_social",
  "utmCampaign": "30_07_2026_rozmovni_girl",
  "utmContent": "video_pro_nigti_zgaduesh",
  "utmTerm": "120250587682150541",
  "referrer": "https://instagram.com/",
  "productInterest": "Генератор",
  "comment": "Заявка з сайту"
}
```

**Рекомендація для сайту:** PixelYourSite / GTM / server-side — при submit форми або замовленні передавати FIRST VISIT UTM у цей API.

---

## 6. Instagram Direct / коментарі — окремий етап

| Канал | Lead Ads webhook | Статус |
|-------|------------------|--------|
| Lead Form (реклама) | ✅ | Підключено |
| Instagram Direct | ❌ | Етап 2 — Instagram Messaging API |
| Коментарі IG/FB | ❌ | Етап 2 — Comments webhook + App Review |

**Lead Ads webhook не включає Direct і коментарі.**  
Для цього потрібно:

- Instagram Messaging API (`instagram_manage_messages`)
- Окремий webhook на `/api/marketing/webhooks/instagram-messages` (майбутня розробка)
- Meta App Review

Якщо потрібно — оформлю окреме ТЗ Етап 2.

---

## 7. Рекомендації для налаштування форм Lead Ads

1. **Обов’язкові поля:** ім’я, телефон (email — бажано).
2. **Custom question «Продукт / потужність»** → потрапляє в `productInterest`.
3. **Опційно** додати приховані/custom поля для UTM (якщо передаєте з pre-fill):
   - `utm_campaign`, `utm_content`, `utm_term`
4. **Naming кампаній:** включати `instagram` або `facebook` у назву — DTS краще визначить платформу.
5. **Одна Page** на webhook — всі форми цієї Page автоматично обробляються.

---

## 8. Env-змінні Render (повний список для Meta)

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

`META_DEFAULT_PLATFORM=instagram` — якщо більшість кампаній Instagram і назви не містять підказок.

---

## 9. Тестування (чеклист)

- [ ] Webhook у Meta App: **Verified**
- [ ] Env на Render збережено, backend redeploy
- [ ] Тестова Lead Ad форма → submit
- [ ] У DTS «Маркетинговий віділ» з’явився лід `ML-xxxxx`
- [ ] У картці ліда видно **UTM** та **назви кампанії/оголошення**
- [ ] Призначення менеджера → «Передати» → лід у «Запити з зовнішньої реклами»

---

## 10. Контакти / підтримка

- **Webhook URL:** `https://darex-trading-solutions.onrender.com/api/marketing/webhooks/meta`
- **Inbound API (сайт):** `https://darex-trading-solutions.onrender.com/api/marketing/leads/inbound`
- **Панель:** DTS → Маркетинговий віділ → Джерела та інтеграції

---

## Додаток A — текст для листа адміну Meta (RU)

```
Нужно подключить Lead Ads → CRM DTS.

1. Webhook в Developer App:
   • Callback URL: https://darex-trading-solutions.onrender.com/api/marketing/webhooks/meta
   • Verify Token: [DTS_meta_verify_2026_xK9m] — тот же, что даст заказчик
   • Object: Page, subscribe: leadgen

2. После настройки прислать нам:
   • App ID, App Secret
   • Page Access Token (long-lived, leads_retrieval)
   • Page ID, список Lead Form ID

3. CRM автоматически получает:
   • данные формы (имя, телефон, email)
   • campaign / adset / ad names через Graph API
   • UTM-маппинг (utm_source=meta, utm_campaign=название кампании)

4. Instagram Direct и комментарии — НЕ входят в Lead Ads webhook.
   Это отдельный этап (Instagram Messaging API).

5. Полный UTM с landing (как PixelYourSite) — через сайт → inbound API.
```

---

*Документ для передачі маркетинговій команді та адміністратору Meta.*
