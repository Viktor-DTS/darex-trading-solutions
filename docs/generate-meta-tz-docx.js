/**
 * Генерація META_INTEGRATION_FULL_TZ.docx з markdown-джерела.
 * Запуск: node generate-meta-tz-docx.js
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, ShadingType,
} = require('docx');

const OUT = path.join(__dirname, 'META_INTEGRATION_FULL_TZ.docx');

function h1(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 200 } });
}
function h2(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 160 } });
}
function h3(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 120 } });
}
function p(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, ...opts })],
    spacing: { after: 120 },
  });
}
function bullet(text) {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 80 } });
}
function codeBlock(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: 'Consolas', size: 20 })],
    shading: { type: ShadingType.SOLID, color: 'F2F2F2' },
    spacing: { before: 100, after: 100 },
  });
}
function table(headers, rows) {
  const headerCells = headers.map((h) => new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
    shading: { type: ShadingType.SOLID, color: 'E8E8E8' },
  }));
  const bodyRows = rows.map((row) => new TableRow({
    children: row.map((cell) => new TableCell({
      children: [new Paragraph({ text: String(cell) })],
    })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: headerCells }), ...bodyRows],
  });
}

const children = [
  new Paragraph({
    children: [new TextRun({ text: 'Повне ТЗ: Meta / Instagram → CRM DTS', bold: true, size: 32 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }),
  p('Версія: 2.0  |  Дата: 2026-08-04'),
  p('Система: Darex Trading Solutions — панель «Маркетинговий віділ»'),
  p('Backend: https://darex-trading-solutions.onrender.com'),
  p('Документ для передачі адміністраторам Meta / маркетинговій команді.', { italics: true }),

  h1('Зміст'),
  bullet('1. Загальна архітектура'),
  bullet('2. Етап 1 — Lead Ads'),
  bullet('3. Етап 2 — Direct + коментарі'),
  bullet('4. UTM та атрибуція'),
  bullet('5. Сайт / PixelYourSite'),
  bullet('6. Env-змінні Render (DTS)'),
  bullet('7. Налаштування Meta App'),
  bullet('8. App Review та дозволи'),
  bullet('9. Тестування'),
  bullet('10. FAQ'),

  h1('1. Загальна архітектура'),
  p('Meta / Instagram надсилає події на один webhook URL CRM DTS. Маркетинговий віділ обробляє ліди та передає їх менеджерам.'),
  codeBlock('Meta/Instagram (Lead Ads, Direct, Comments) → POST /api/marketing/webhooks/meta → CRM DTS → Менеджери'),
  p('Webhook URL (єдиний для всього Meta):', { bold: true }),
  codeBlock('https://darex-trading-solutions.onrender.com/api/marketing/webhooks/meta'),
  p('Verify Token задає DTS/IT. Той самий рядок вноситься в Meta App (Webhooks) і на Render (META_VERIFY_TOKEN).'),

  h1('2. Етап 1 — Lead Ads'),
  h2('Що автоматично потрапляє в CRM'),
  table(
    ['Дані', 'Поле CRM'],
    [
      ['Ім\'я, телефон, email, місто', 'clientName, contactPhone, …'],
      ['campaign / adset / ad / form (ID + назви)', 'metaCampaign*, metaAd*, Graph API'],
      ['UTM (авто-мапінг)', 'utm_source=meta, utm_campaign=назва кампанії'],
      ['Тип взаємодії', 'interactionType = lead_form'],
    ]
  ),
  new Paragraph({ spacing: { after: 200 } }),
  h2('Підписки webhook (Object: Page)'),
  table(['Field', 'Етап'], [['leadgen', 'Етап 1 — обов\'язково']]),
  new Paragraph({ spacing: { after: 200 } }),
  h2('Що передати DTS після налаштування'),
  bullet('App ID, App Secret'),
  bullet('Page Access Token (leads_retrieval)'),
  bullet('Page ID, Lead Form IDs'),
  bullet('Підтвердження: webhook Verified'),

  h1('3. Етап 2 — Direct + коментарі'),
  p('Статус коду: реалізовано в DTS. Увімкнення на Render після налаштувань Meta: META_PHASE2_MESSAGING=1 та/або META_PHASE2_COMMENTS=1.', { italics: true }),

  h2('3.1 Instagram / Facebook Direct (Messenger)'),
  p('Сценарій для клієнта:'),
  bullet('Пише в Direct / Messenger → /start'),
  bullet('Бот: ім\'я → телефон → місто → продукт'),
  bullet('Створюється лід ML-xxxxx у CRM'),
  bullet('interactionType = direct_message'),
  table(
    ['Object', 'Field', 'Env DTS'],
    [
      ['Page', 'messages', 'META_PHASE2_MESSAGING=1'],
      ['Instagram', 'messages', 'META_PHASE2_MESSAGING=1'],
    ]
  ),
  new Paragraph({ spacing: { after: 200 } }),
  p('Додаткові дозволи: pages_messaging, instagram_manage_messages'),

  h2('3.2 Коментарі Instagram / Facebook'),
  bullet('Webhook → CRM створює лід з текстом коментаря'),
  bullet('interactionType = comment, пріоритет high'),
  bullet('Маркетинг зв\'язується в Direct для отримання телефону'),
  table(
    ['Object', 'Field', 'Env DTS'],
    [
      ['Page', 'feed (comments)', 'META_PHASE2_COMMENTS=1'],
      ['Instagram', 'comments', 'META_PHASE2_COMMENTS=1'],
    ]
  ),
  new Paragraph({ spacing: { after: 200 } }),
  p('Додаткові дозволи: instagram_manage_comments, pages_manage_engagement, pages_read_engagement'),
  p('Опційно — авто-відповідь: META_COMMENT_AUTO_REPLY=1 (може вимагати App Review).'),

  h2('3.3 Що НЕ входить автоматично'),
  table(
    ['Канал', 'Примітка'],
    [
      ['DM без /start', 'Потрібен welcome message або реклама Message'],
      ['Старі коментарі', 'Тільки нові після підключення webhook'],
      ['WhatsApp', 'Окремий продукт Meta'],
    ]
  ),
  new Paragraph({ spacing: { after: 200 } }),

  h1('4. UTM та атрибуція'),
  h2('Lead Ads (Етап 1)'),
  table(
    ['UTM', 'Значення'],
    [
      ['utm_source', 'meta'],
      ['utm_medium', 'paid_social'],
      ['utm_campaign', 'назва кампанії (Graph API)'],
      ['utm_content', 'назва оголошення'],
      ['utm_term', 'ad_id / form'],
    ]
  ),
  new Paragraph({ spacing: { after: 200 } }),
  h2('Direct та коментарі'),
  p('Direct: utm_source=meta, utm_medium=direct_message'),
  p('Коментарі: utm_medium=comment, utm_content=post_id/media_id'),
  p('Custom UTM у Lead Form (utm_campaign, utm_content) перекривають автоматичні значення.'),

  h1('5. Сайт / PixelYourSite'),
  p('Приклад UTM з landing (instagram.com → led-global.com):'),
  codeBlock('utm_source=meta | utm_medium=paid_social | utm_campaign=30_07_2026_rozmovni_girl'),
  p('Inbound API для сайту:', { bold: true }),
  codeBlock('POST https://darex-trading-solutions.onrender.com/api/marketing/leads/inbound'),
  codeBlock('Header: X-Marketing-Api-Key: <MARKETING_INBOUND_API_KEY>'),
  p('JSON body: source, clientName, contactPhone, landingPage, trafficSource, utmSource–utmTerm'),

  h1('6. Env-змінні Render (DTS)'),
  h2('Етап 1'),
  codeBlock('MARKETING_PUBLIC_BASE_URL=https://darex-trading-solutions.onrender.com'),
  codeBlock('META_APP_ID= / META_APP_SECRET= / META_PAGE_ACCESS_TOKEN= / META_VERIFY_TOKEN='),
  codeBlock('META_DEFAULT_PLATFORM=instagram | MARKETING_DEDUP_DAYS=30 | MARKETING_DEDUP_MODE=warn'),
  h2('Етап 2'),
  codeBlock('META_PHASE2_MESSAGING=1 | META_PHASE2_COMMENTS=1'),
  codeBlock('META_COMMENT_AUTO_REPLY=0 | META_COMMENT_REPLY_TEXT=...'),
  h2('Сайт'),
  codeBlock('MARKETING_INBOUND_API_KEY='),

  h1('7. Налаштування Meta App'),
  h2('7.1 Webhooks'),
  p('URL: https://darex-trading-solutions.onrender.com/api/marketing/webhooks/meta'),
  p('Verify Token = META_VERIFY_TOKEN'),
  h2('7.2 Підписки'),
  table(
    ['Object', 'Field', 'Етап'],
    [
      ['Page', 'leadgen', '1'],
      ['Page', 'messages', '2'],
      ['Page', 'feed', '2'],
      ['Instagram', 'comments', '2'],
      ['Instagram', 'messages', '2'],
    ]
  ),
  new Paragraph({ spacing: { after: 200 } }),
  h2('7.3 Instagram Business'),
  bullet('Instagram Professional/Business акаунт'),
  bullet('Прив\'язка до Facebook Page'),
  bullet('У Meta App → Instagram → додати IG account'),
  h2('7.4 Що передати DTS'),
  table(
    ['#', 'Дані'],
    [
      ['1', 'App ID, App Secret'],
      ['2', 'Page Access Token (long-lived)'],
      ['3', 'Page ID, Instagram Business Account ID'],
      ['4', 'Lead Form IDs'],
      ['5', 'Скрін: webhook Verified + subscribed fields'],
      ['6', 'Підтвердження App Review (якщо потрібно)'],
    ]
  ),
  new Paragraph({ spacing: { after: 200 } }),

  h1('8. App Review та дозволи'),
  h2('Етап 1'),
  bullet('leads_retrieval, pages_manage_metadata, pages_read_engagement'),
  h2('Етап 2'),
  table(
    ['Permission', 'Для чого'],
    [
      ['pages_messaging', 'Facebook Messenger'],
      ['instagram_manage_messages', 'Instagram Direct'],
      ['instagram_manage_comments', 'Коментарі IG'],
      ['pages_manage_engagement', 'Відповіді FB'],
    ]
  ),
  new Paragraph({ spacing: { after: 200 } }),
  p('App Review може вимагати: опис use case (CRM заявок), screencast, Privacy Policy URL.'),

  h1('9. Тестування'),
  h3('Етап 1'),
  bullet('[ ] Test Lead Form → лід у DTS з UTM + campaign name'),
  bullet('[ ] interactionType = lead_form'),
  h3('Етап 2 Direct'),
  bullet('[ ] Instagram Direct → /start → діалог → лід з телефоном'),
  h3('Етап 2 Comments'),
  bullet('[ ] Коментар IG → лід comment, @username видно'),
  h3('Загальне'),
  bullet('[ ] Передати менеджеру → вкладка «Запити з зовнішньої реклами»'),

  h1('10. FAQ'),
  p('Q: Один webhook чи кілька?'),
  p('A: Один URL /api/marketing/webhooks/meta для page + instagram.'),
  p('Q: Чи тягнуться Direct і коментарі?'),
  p('A: Так, після підписки fields + env META_PHASE2_*=1.'),
  p('Q: Чи є UTM?'),
  p('A: Lead Ads — авто-мапінг. Повні UTM — через сайт/inbound API.'),
  p('Q: Verify Token хто генерує?'),
  p('A: DTS/IT. Meta лише перевіряє збіг.'),

  h1('Додаток — лист адміну Meta'),
  codeBlock('Тема: Подключение Meta → CRM DTS (Lead Ads + Direct + Comments)'),
  codeBlock('Webhook: https://darex-trading-solutions.onrender.com/api/marketing/webhooks/meta'),
  codeBlock('Verify Token: [от DTS]'),
  codeBlock('Подписки Page: leadgen, messages, feed | Instagram: comments, messages'),
  codeBlock('Permissions: leads_retrieval, pages_messaging, instagram_manage_messages, instagram_manage_comments, pages_manage_engagement'),
  codeBlock('После настройки: App ID, Secret, Page Token, Page ID, IG Business ID, Form IDs, скрин Verified'),
  p('CRM получает: Lead Forms + UTM, Direct (/start), Comments для обработки маркетингом.', { italics: true }),
];

const doc = new Document({
  sections: [{
    properties: {},
    children,
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(OUT, buffer);
  console.log('Created:', OUT);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
