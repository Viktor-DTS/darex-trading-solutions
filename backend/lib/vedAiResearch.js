/**
 * ШІ-дослідження постачальників для панелі ВЕД.
 * Веб-контекст: SerpApi (SERPAPI_API_KEY). LLM: OPENAI_API_KEY / PRODUCT_ASSISTANT_LLM_API_KEY.
 *
 * VED_AI_ENABLED=0 — вимкнути модуль
 * VED_AI_DAILY_LIMIT — ліміт сесій на користувача на добу (типово 8)
 * VED_AI_MAX_CANDIDATES — скільки кандидатів просити у LLM (типово 5)
 * VED_AI_LLM_MODEL — модель для ВЕД (типово gpt-4o-mini; не успадковує Groq/llama з асистента)
 * VED_AI_LLM_BASE_URL — опційно окремий OpenAI-сумісний endpoint для ВЕД
 */
const { resolveLlmApiKey } = require('../productCardAssistantLlm');
const { resolveSerpApiKey } = require('../productCardAssistantSerpApiImages');
const { VED_EQUIPMENT_TYPE_LABELS, normalizeEquipmentType, normalizeEquipmentTypes } = require('./vedEquipmentTypes');

const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';
const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_WEB_CONTEXT = 14000;
const MAX_USER_PROMPT = 6500;
const MAX_SEARCH_QUERIES = 18;

const DEFAULT_SERP_LOCALE = {
  google_domain: String(process.env.SERPAPI_GOOGLE_DOMAIN || 'google.com').trim() || 'google.com',
  gl: String(process.env.SERPAPI_GL || 'us').trim() || 'us',
  hl: String(process.env.SERPAPI_HL || 'en').trim() || 'en',
};

/** Google-домени для SerpApi: Азія + Європа + глобальний */
const REGIONAL_SERP_LOCALES = {
  global: { google_domain: 'google.com', gl: 'us', hl: 'en' },
  china: { google_domain: 'google.com.hk', gl: 'cn', hl: 'zh-CN' },
  taiwan: { google_domain: 'google.com.tw', gl: 'tw', hl: 'zh-TW' },
  japan: { google_domain: 'google.co.jp', gl: 'jp', hl: 'ja' },
  korea: { google_domain: 'google.co.kr', gl: 'kr', hl: 'ko' },
  india: { google_domain: 'google.co.in', gl: 'in', hl: 'en' },
  vietnam: { google_domain: 'google.com.vn', gl: 'vn', hl: 'vi' },
  thailand: { google_domain: 'google.co.th', gl: 'th', hl: 'th' },
  turkey: { google_domain: 'google.com.tr', gl: 'tr', hl: 'tr' },
  germany: { google_domain: 'google.de', gl: 'de', hl: 'de' },
  italy: { google_domain: 'google.it', gl: 'it', hl: 'it' },
  poland: { google_domain: 'google.pl', gl: 'pl', hl: 'pl' },
  france: { google_domain: 'google.fr', gl: 'fr', hl: 'fr' },
  netherlands: { google_domain: 'google.nl', gl: 'nl', hl: 'nl' },
  spain: { google_domain: 'google.es', gl: 'es', hl: 'es' },
  czech: { google_domain: 'google.cz', gl: 'cz', hl: 'cs' },
  europe: { google_domain: 'google.de', gl: 'de', hl: 'de' },
};

/** Порядок ротації: різноманітність країн за один пошук */
const DEFAULT_SEARCH_LOCALE_ORDER = [
  'global',
  'china',
  'germany',
  'italy',
  'japan',
  'korea',
  'india',
  'turkey',
  'poland',
  'france',
  'vietnam',
  'taiwan',
  'netherlands',
  'spain',
  'thailand',
  'czech',
];

/** Виключити РФ з пошуку постачальників (політика компанії з України) */
const SEARCH_QUERY_EXCLUSIONS = '-site:.ru -site:.su -Russia -"Russian Federation" -Россия';

const EXCLUDED_SUPPLIER_COUNTRY_RE =
  /^(russia|russian federation|росія|російська\s+федерація|рф|ru|россия|российская\s+федерация)$/i;

function extractHostname(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function isExcludedSupplierUrl(value) {
  const host = extractHostname(value);
  if (!host) return false;
  return (
    host === 'ru' ||
    host.endsWith('.ru') ||
    host.endsWith('.su') ||
    host.endsWith('.xn--p1ai') ||
    host.includes('.ru.')
  );
}

function isExcludedSupplierCountry(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  if (EXCLUDED_SUPPLIER_COUNTRY_RE.test(s)) return true;
  return /\b(росія|російськ|россия|российск|russian federation)\b/i.test(s);
}

function isExcludedSupplierCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  if (isExcludedSupplierCountry(candidate.country)) return true;
  if (isExcludedSupplierUrl(candidate.website)) return true;
  const urls = Array.isArray(candidate.sourceUrls) ? candidate.sourceUrls : [];
  if (urls.some((u) => isExcludedSupplierUrl(u))) return true;
  return false;
}

const EQUIPMENT_SEARCH_HINTS = {
  generator_diesel: 'diesel generator genset industrial silent canopy export manufacturer supplier',
  generator_benzin_gas: 'gasoline portable generator LP gas dual fuel export supplier OEM',
  generator_gas: 'natural gas generator industrial genset export supplier OEM',
  inverter_lifepo4: 'hybrid inverter LiFePO4 battery energy storage ESS supplier OEM export',
  inverter_hybrid: 'hybrid solar inverter off-grid on-grid supplier OEM export',
  batteries_lifepo4: 'LiFePO4 lithium battery rack BMS supplier OEM export manufacturer',
  ups: 'industrial UPS three phase backup power supplier export',
  ats: 'automatic transfer switch ATS AMF panel supplier export',
  solar_panels: 'solar panel monocrystalline Tier-1 manufacturer export',
  solar_inverter: 'solar inverter string hybrid supplier OEM export',
  charging_ev: 'EV charging station AC DC supplier export manufacturer',
  spare_parts: 'generator spare parts engine alternator controller export supplier',
  other: 'power equipment industrial supplier export manufacturer',
};

const EQUIPMENT_SEARCH_HINTS_I18N = {
  generator_diesel: {
    tr: 'dizel jeneratör jeneratör seti üretici fabrika ihracat',
    zh: '柴油发电机 发电机组 厂家 工厂 出口',
    de: 'Diesel Generator Stromerzeuger Hersteller Export Fabrik',
    ja: 'ディーゼル発電機 発電設備 メーカー 輸出',
    ko: '디젤 발전기 발전설비 제조사 수출',
    hi: 'डीजल जनरेटर सेट निर्माता निर्यात',
    vi: 'máy phát điện diesel nhà sản xuất xuất khẩu',
    th: 'เครื่องกำเนิดไฟฟ้าดีเซล ผู้ผลิต ส่งออก',
    it: 'gruppo elettrogeno diesel produttore export fabbrica',
    pl: 'agregat prądotwórczy diesel producent export',
    fr: 'groupe électrogène diesel fabricant export',
    es: 'grupo electrógeno diésel fabricante exportación',
    cs: 'diesel generátor výrobce export',
  },
  generator_benzin_gas: {
    tr: 'benzinli jeneratör portatif üretici ihracat',
    zh: '汽油发电机 便携式 厂家 出口',
    de: 'Benzin Generator tragbar Hersteller Export',
    ja: 'ガソリン発電機 ポータブル メーカー',
    ko: '가솔린 발전기 휴대용 제조사',
    hi: 'पेट्रोल जनरेटर पोर्टेबल निर्माता',
    vi: 'máy phát điện xăng di động nhà sản xuất',
    th: 'เครื่องกำเนิดไฟฟ้าเบนซิน พกพา ผู้ผลิต',
    it: 'generatore benzina portatile produttore',
    pl: 'generator benzynowy przenośny producent',
    fr: 'groupe électrogène essence portable fabricant',
    es: 'generador gasolina portátil fabricante',
    cs: 'benzinový generátor přenosný výrobce',
  },
  generator_gas: {
    tr: 'doğalgaz jeneratör sanayi üretici ihracat',
    zh: '天然气发电机 工业 厂家 出口',
    de: 'Gas Generator Erdgas Hersteller Export',
    ja: 'ガス発電機 産業用 メーカー',
    ko: '가스 발전기 산업용 제조사',
    hi: 'गैस जनरेटर औद्योगिक निर्माता',
    vi: 'máy phát điện khí công nghiệp nhà sản xuất',
    th: 'เครื่องกำเนิดไฟฟ้าก๊าซ อุตสาหกรรม ผู้ผลิต',
    it: 'generatore gas naturale industriale produttore',
    pl: 'generator gazowy przemysłowy producent',
    fr: 'groupe électrogène gaz naturel fabricant',
    es: 'generador gas natural industrial fabricante',
    cs: 'plynový generátor průmyslový výrobce',
  },
  inverter_lifepo4: {
    tr: 'hibrit inverter LiFePO4 enerji depolama üretici',
    zh: '混合逆变器 磷酸铁锂 储能 厂家',
    de: 'Hybrid Wechselrichter LiFePO4 Speicher Hersteller',
    ja: 'ハイブリッドインバータ LiFePO4 蓄電 メーカー',
    ko: '하이브리드 인버터 LiFePO4 에너지 저장 제조사',
    hi: 'हाइब्रिड इन्वर्टर LiFePO4 ऊर्जा भंडारण निर्माता',
    vi: 'biến tần lai LiFePO4 lưu trữ năng lượng nhà sản xuất',
    th: 'อินเวอร์เตอร์ไฮบริด LiFePO4 กักเก็บพลังงาน ผู้ผลิต',
    it: 'inverter ibrido LiFePO4 accumulo energia produttore',
    pl: 'falownik hybrydowy LiFePO4 magazyn energii producent',
    fr: 'onduleur hybride LiFePO4 stockage énergie fabricant',
    es: 'inversor híbrido LiFePO4 almacenamiento energía fabricante',
    cs: 'hybridní měnič LiFePO4 úložiště energie výrobce',
  },
  inverter_hybrid: {
    tr: 'hibrit güneş inverter üretici ihracat',
    zh: '混合逆变器 太阳能 厂家 出口',
    de: 'Hybrid Solar Wechselrichter Hersteller Export',
    ja: 'ハイブリッド ソーラーインバータ メーカー',
    ko: '하이브리드 태양광 인버터 제조사',
    hi: 'हाइब्रिड सोलर इन्वर्टर निर्माता',
    vi: 'biến tần lai năng lượng mặt trời nhà sản xuất',
    th: 'อินเวอร์เตอร์ไฮบริดโซลาร์ ผู้ผลิต',
    it: 'inverter ibrido solare produttore export',
    pl: 'falownik hybrydowy solarny producent',
    fr: 'onduleur hybride solaire fabricant export',
    es: 'inversor híbrido solar fabricante exportación',
    cs: 'hybridní solární měnič výrobce export',
  },
  batteries_lifepo4: {
    tr: 'LiFePO4 lityum batarya BMS üretici ihracat',
    zh: '磷酸铁锂电池 BMS 厂家 出口',
    de: 'LiFePO4 Lithium Batterie BMS Hersteller Export',
    ja: 'LiFePO4 リチウム電池 BMS メーカー',
    ko: 'LiFePO4 리튬 배터리 BMS 제조사',
    hi: 'LiFePO4 लिथियम बैटरी BMS निर्माता',
    vi: 'pin lithium LiFePO4 BMS nhà sản xuất',
    th: 'แบตเตอรี่ LiFePO4 ลิเธียม BMS ผู้ผลิต',
    it: 'batteria LiFePO4 litio BMS produttore',
    pl: 'bateria LiFePO4 litowa BMS producent',
    fr: 'batterie LiFePO4 lithium BMS fabricant',
    es: 'batería LiFePO4 litio BMS fabricante',
    cs: 'baterie LiFePO4 lithium BMS výrobce',
  },
  ups: {
    tr: 'endüstriyel UPS kesintisiz güç kaynağı üretici',
    zh: '工业UPS 不间断电源 厂家',
    de: 'industrielle USV Unterbrechungsfreie Stromversorgung Hersteller',
    ja: '産業用UPS 無停電電源 メーカー',
    ko: '산업용 UPS 무정전 전원 제조사',
    hi: 'औद्योगिक UPS निर्माता',
    vi: 'UPS công nghiệp nhà sản xuất',
    th: 'UPS อุตสาหกรรม ผู้ผลิต',
    it: 'UPS industriale produttore',
    pl: 'UPS przemysłowy producent',
    fr: 'onduleur industriel UPS fabricant',
    es: 'UPS industrial fabricante',
    cs: 'průmyslový UPS výrobce',
  },
  ats: {
    tr: 'otomatik transfer switch ATS panel üretici',
    zh: '自动转换开关 ATS 厂家',
    de: 'Automatikumschalter ATS Schaltanlage Hersteller',
    ja: '自動切替開閉器 ATS メーカー',
    ko: '자동 전환 개폐기 ATS 제조사',
    hi: 'ATS स्वचालित स्थानांतरण स्विच निर्माता',
    vi: 'cầu dao chuyển mạch ATS nhà sản xuất',
    th: 'ATS สวิตช์โอนอัตโนมัติ ผู้ผลิต',
    it: 'commutatore automatico ATS produttore',
    pl: 'przełącznik automatyczny ATS producent',
    fr: 'commutateur automatique ATS fabricant',
    es: 'conmutador automático ATS fabricante',
    cs: 'automatický přepínač ATS výrobce',
  },
  solar_panels: {
    tr: 'monokristal güneş paneli üretici ihracat',
    zh: '单晶硅 太阳能板 组件 厂家 出口',
    de: 'monokristalline Solarmodule Hersteller Export',
    ja: '単結晶 ソーラーパネル メーカー 輸出',
    ko: '단결정 태양광 패널 제조사 수출',
    hi: 'मोनोक्रिस्टलाइन सोलर पैनल निर्माता',
    vi: 'tấm pin mặt trời mono nhà sản xuất',
    th: 'แผงโซลาร์เซลล์ mono ผู้ผลิต',
    it: 'pannello solare monocristallino produttore',
    pl: 'panel słoneczny monokrystaliczny producent',
    fr: 'panneau solaire monocristallin fabricant',
    es: 'panel solar monocristalino fabricante',
    cs: 'solární panel monokrystalický výrobce',
  },
  solar_inverter: {
    tr: 'güneş inverter string hibrit üretici',
    zh: '光伏逆变器 组串 厂家 出口',
    de: 'Solar Wechselrichter String Hybrid Hersteller',
    ja: 'ソーラーインバータ ストリング メーカー',
    ko: '태양광 인버터 스트링 제조사',
    hi: 'सोलर इन्वर्टर स्ट्रिंग निर्माता',
    vi: 'biến tần quang điện string nhà sản xuất',
    th: 'อินเวอร์เตอร์โซลาร์ สตริง ผู้ผลิต',
    it: 'inverter solare string hybrid produttore',
    pl: 'falownik solarny string producent',
    fr: 'onduleur solaire string fabricant',
    es: 'inversor solar string fabricante',
    cs: 'solární měnič string výrobce',
  },
  charging_ev: {
    tr: 'elektrikli araç şarj istasyonu AC DC üretici',
    zh: '电动汽车 充电桩 厂家 出口',
    de: 'Elektrofahrzeug Ladestation AC DC Hersteller',
    ja: 'EV充電ステーション AC DC メーカー',
    ko: '전기차 충전소 AC DC 제조사',
    hi: 'EV चार्जिंग स्टेशन निर्माता',
    vi: 'trạm sạc xe điện AC DC nhà sản xuất',
    th: 'สถานีชาร์จ EV AC DC ผู้ผลิต',
    it: 'stazione ricarica EV AC DC produttore',
    pl: 'stacja ładowania EV AC DC producent',
    fr: 'station recharge VE AC DC fabricant',
    es: 'estación carga VE AC DC fabricante',
    cs: 'nabíjecí stanice EV AC DC výrobce',
  },
  spare_parts: {
    tr: 'jeneratör yedek parça motor alternatör üretici',
    zh: '发电机 配件 发动机 厂家',
    de: 'Generator Ersatzteile Motor Generator Hersteller',
    ja: '発電機 部品 エンジン メーカー',
    ko: '발전기 부품 엔진 제조사',
    hi: 'जनरेटर spare parts निर्माता',
    vi: 'phụ tùng máy phát điện nhà sản xuất',
    th: 'อะไหล่เครื่องกำเนิดไฟฟ้า ผู้ผลิต',
    it: 'ricambi generatore motore produttore',
    pl: 'części zamienne agregat producent',
    fr: 'pièces détachées générateur fabricant',
    es: 'repuestos generador fabricante',
    cs: 'náhradní díly generátor výrobce',
  },
  other: {
    tr: 'endüstriyel güç ekipmanı üretici ihracat',
    zh: '工业电力设备 厂家 出口',
    de: 'industrielle Stromversorgung Ausrüstung Hersteller Export',
    ja: '産業用電力機器 メーカー 輸出',
    ko: '산업용 전력 장비 제조사 수출',
    hi: 'औद्योगिक बिजली उपकरण निर्माता',
    vi: 'thiết bị điện công nghiệp nhà sản xuất',
    th: 'อุปกรณ์ไฟฟ้าอุตสาหกรรม ผู้ผลิต',
    it: 'apparecchiature elettriche industriali produttore',
    pl: 'sprzęt elektryczny przemysłowy producent',
    fr: 'équipement électrique industriel fabricant',
    es: 'equipo eléctrico industrial fabricante',
    cs: 'průmyslové elektrické zařízení výrobce',
  },
};

const EQUIPMENT_LABELS_UK = VED_EQUIPMENT_TYPE_LABELS;

const SYSTEM_PROMPT = `Ти аналітик відділу зовнішньоекономічної діяльності (ВЕД) компанії з України.
Завдання: за описом заявки на імпорт обладнання підібрати 3–5 зарубіжних постачальників-кандидатів для подальшої перевірки людиною.

Поверни ЛИШЕ один JSON-об'єкт без markdown:
{
  "summary": "короткий висновок українською (2–4 речення)",
  "recommendations": ["рекомендація 1", "..."],
  "candidates": [
    {
      "supplierName": "назва компанії",
      "country": "країна",
      "website": "https://... або порожній рядок",
      "contact": "email або телефон або порожній",
      "productModel": "модель / лінійка продукції",
      "tradeCategories": ["Дизель-генератори", "ЗИП до генераторів"] — 1–3 короткі категорії товарів, якими РЕАЛЬНО торгує цей постачальник (українською),
      "equipmentTypeHints": ["generator_diesel"] — опційно, 1 ключ для фільтра (лише категорії цього постачальника),
      "productSummary": "коротко що пропонують",
      "priceFrom": null або число (мінімальна орієнтовна ціна),
      "priceTo": null або число (максимальна орієнтовна ціна),
      "priceEstimate": null або число (якщо один діапазон — дублюй у priceFrom/priceTo),
      "priceStatus": "unverified | estimated | quoted",
      "currency": "USD|EUR|CNY|... або порожній",
      "certificates": "наявність сертифікатів текстом (CE, ISO, UL…) або порожній",
      "powerLineup": "лінійка по потужності (діапазони kW/kVA) або порожній",
      "incotermsHint": "FOB/CIF/EXW або порожній — лише якщо знайдено в джерелах",
      "moqHint": "MOQ текстом або порожній",
      "leadTimeHint": "термін поставки текстом або порожній",
      "prepaymentPercentHint": null або число 0–100,
      "riskNotes": ["ризик 1", "..."],
      "riskDescription": "короткий опис ризиків співпраці українською (1–3 речення)",
      "strengths": ["перевага 1", "..."],
      "sourceUrls": ["https://...", "..."]
    }
  ]
}

Правила:
- Не пропонуй постачальників і виробників з Російської Федерації (РФ): ні за країною, ні за доменом .ru/.su, ні за російськими джерелами. Це обовʼязкове обмеження компанії з України.
- Шукай постачальників у будь-якій мові та регіоні. Пріоритет — виробники з Азії (Китай, Японія, Південна Корея, Індія, Вʼєтнам, Тайвань, Таїланд, Туреччина) та Європи (Німеччина, Італія, Польща, Франція, Нідерланди, Іспанія, Чехія та ін.).
- Уривки веб-пошуку можуть бути не українською — аналізуй їх і включай релевантних OEM/виробників, а не лише дистрибʼюторів.
- Усі текстові поля JSON для людини (summary, recommendations, tradeCategories, productSummary, riskDescription, riskNotes, strengths, moqHint, leadTimeHint, certificates, powerLineup) — ЛИШЕ українською.
- supplierName — офіційна назва компанії (латиницею); country — українською (напр. «Німеччина», «Японія», «Китай»).
- Не обмежуйся англомовними сайтами: локальні домени (.de, .jp, .kr, .cn, .in, .it, .pl, Alibaba, Made-in-China, Europages) — важливі джерела.
- Не вигадуй контакти, ціни та умови — якщо немає в уривках веб-пошуку, лишай порожнім/null і priceStatus=unverified.
- sourceUrls — лише URL, що згадані в контексті пошуку або логічно випливають з відомих сайтів компаній; не більше 5 на кандидата.
- riskNotes — гіпотези (санкції, prepayment 100%, новий домен, відсутність сертифікатів) — не категоричні висновки.
- candidates: від 3 до MAX_CANDIDATES, різні країни/профілі де можливо.
- tradeCategories — ОБОВ'ЯЗКОВО: чим саме торгує ця компанія за джерелами; НЕ копіюй усі типи з заявки.
- equipmentTypeHints — лише 1–2 ключі з переліку типів заявки, що відповідають асортименту постачальника.
- Це чернетка для ВЕД-фахівця, не договірна пропозиція.`;

function stripJsonFence(text) {
  const s = String(text || '').trim();
  const m = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1].trim() : s;
}

function resolveVedLlmClient() {
  const vedKey = String(process.env.VED_AI_LLM_API_KEY || '').trim();
  const openAiKey = String(process.env.OPENAI_API_KEY || '').trim();

  if (vedKey) {
    return {
      apiKey: vedKey,
      base: String(process.env.VED_AI_LLM_BASE_URL || DEFAULT_BASE).replace(/\/$/, ''),
      model: String(process.env.VED_AI_LLM_MODEL || DEFAULT_MODEL).trim(),
    };
  }

  // Якщо додали OpenAI ключ для VED — не змішуємо з Groq/llama налаштуваннями асистента.
  if (openAiKey) {
    return {
      apiKey: openAiKey,
      base: String(process.env.VED_AI_LLM_BASE_URL || DEFAULT_BASE).replace(/\/$/, ''),
      model: String(process.env.VED_AI_LLM_MODEL || DEFAULT_MODEL).trim(),
    };
  }

  const base = String(process.env.VED_AI_LLM_BASE_URL || process.env.PRODUCT_ASSISTANT_LLM_BASE_URL || DEFAULT_BASE).replace(
    /\/$/,
    ''
  );
  const inheritedModel = String(process.env.PRODUCT_ASSISTANT_LLM_MODEL || '').trim();
  return {
    apiKey: resolveLlmApiKey(),
    base,
    model: String(process.env.VED_AI_LLM_MODEL || inheritedModel || DEFAULT_MODEL).trim(),
  };
}

function formatLlmHttpError(status, errText, model, base) {
  const raw = String(errText || '').slice(0, 400);
  if (status === 404 && /model.*does not exist|model_not_found/i.test(raw)) {
    console.warn('[ved-ai] model not found:', { model, base });
    return (
      `Модель «${model}» недоступна на ${base}. ` +
      'Для OpenAI на Render: OPENAI_API_KEY + VED_AI_LLM_MODEL=gpt-4o-mini (без Groq/llama в PRODUCT_ASSISTANT_LLM_MODEL).'
    );
  }
  return `LLM HTTP ${status}: ${raw}`;
}

function vedAiEnabled() {
  const v = String(process.env.VED_AI_ENABLED || '').trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  const client = resolveVedLlmClient();
  return Boolean(client.apiKey);
}

function vedAiDailyLimit() {
  const n = parseInt(String(process.env.VED_AI_DAILY_LIMIT || '8'), 10);
  return Math.min(50, Math.max(1, n || 8));
}

function vedAiMaxCandidates() {
  const n = parseInt(String(process.env.VED_AI_MAX_CANDIDATES || '5'), 10);
  return Math.min(8, Math.max(3, n || 5));
}

function makeSearchQuery(q, localeKey = 'global') {
  const base = String(q || '').trim();
  const text = `${base} ${SEARCH_QUERY_EXCLUSIONS}`.trim().slice(0, 200);
  if (text.length < 8) return null;
  const locale = REGIONAL_SERP_LOCALES[localeKey] || REGIONAL_SERP_LOCALES.global;
  return {
    q: text,
    locale: localeKey,
    google_domain: locale.google_domain,
    gl: locale.gl,
    hl: locale.hl,
  };
}

function detectRegionalFocus(extraHint = '') {
  const hint = String(extraHint || '').toLowerCase();
  const priority = [];
  const add = (...keys) => {
    for (const key of keys) {
      if (!priority.includes(key)) priority.push(key);
    }
  };

  if (/азі|asia|asian|східна\s*азія/.test(hint)) {
    add('china', 'japan', 'korea', 'india', 'vietnam', 'taiwan', 'thailand', 'turkey');
  }
  if (/європ|europe|eu\b|західна\s*європ/.test(hint)) {
    add('germany', 'italy', 'poland', 'france', 'netherlands', 'spain', 'czech');
  }
  if (/китай|china|chinese|кнр|alibaba|made-in-china/.test(hint)) add('china');
  if (/тайван|taiwan/.test(hint)) add('taiwan', 'china');
  if (/япон|japan|japanese|tokyo/.test(hint)) add('japan');
  if (/коре|korea|korean|seoul/.test(hint)) add('korea');
  if (/інд|india|indian|mumbai|delhi/.test(hint)) add('india');
  if (/вʼ?єт|vietnam|vietnamese|hanoi/.test(hint)) add('vietnam');
  if (/тайланд|thailand|thai|bangkok/.test(hint)) add('thailand');
  if (/турц|turkey|turkish|türkiye|istanbul/.test(hint)) add('turkey');
  if (/німеч|germany|german|deutsch/.test(hint)) add('germany');
  if (/італ|italy|italian|milano/.test(hint)) add('italy');
  if (/поль|poland|polish|warsaw/.test(hint)) add('poland');
  if (/фран|france|french|paris/.test(hint)) add('france');
  if (/нідер|netherlands|dutch|holland/.test(hint)) add('netherlands');
  if (/іспан|spain|spanish|madrid/.test(hint)) add('spain');
  if (/чех|czech|prague/.test(hint)) add('czech');

  if (!priority.length) return [...DEFAULT_SEARCH_LOCALE_ORDER];
  add('global');
  return priority;
}

function selectDiverseQueries(candidates, max, priorityLocales = []) {
  const byLocale = new Map();
  for (const item of candidates) {
    const loc = item.locale || 'global';
    if (!byLocale.has(loc)) byLocale.set(loc, []);
    byLocale.get(loc).push(item);
  }

  const localeOrder = [...new Set([...priorityLocales, ...DEFAULT_SEARCH_LOCALE_ORDER])];
  const out = [];
  const seen = new Set();

  for (const loc of localeOrder) {
    const list = byLocale.get(loc);
    if (!list?.length) continue;
    const item = list.shift();
    const key = `${item.locale}:${item.q.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) return out;
  }

  for (const item of candidates) {
    const key = `${item.locale}:${item.q.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }

  return out;
}

function i18nHintForLocale(i18n, localeKey, fallbackHint) {
  const map = {
    china: 'zh',
    taiwan: 'zh',
    japan: 'ja',
    korea: 'ko',
    india: 'hi',
    vietnam: 'vi',
    thailand: 'th',
    turkey: 'tr',
    germany: 'de',
    europe: 'de',
    italy: 'it',
    poland: 'pl',
    france: 'fr',
    netherlands: 'de',
    spain: 'es',
    czech: 'cs',
  };
  const key = map[localeKey];
  return (key && i18n[key]) || fallbackHint;
}

function buildSearchQueriesForType(requestDoc, type, extraHint = '') {
  const hint = EQUIPMENT_SEARCH_HINTS[type] || EQUIPMENT_SEARCH_HINTS.other;
  const i18n = EQUIPMENT_SEARCH_HINTS_I18N[type] || EQUIPMENT_SEARCH_HINTS_I18N.other;
  const name = String(requestDoc.equipmentName || '').trim().slice(0, 120);
  const tech = String(requestDoc.technicalRequirements || '').trim().slice(0, 200);
  const extra = String(extraHint || '').trim().slice(0, 120);
  const parts = [name, tech, extra].filter(Boolean).join(' ').slice(0, 220);

  const queries = [];
  const push = (q, localeKey = 'global') => {
    const item = makeSearchQuery(q, localeKey);
    if (item) queries.push(item);
  };

  for (const localeKey of DEFAULT_SEARCH_LOCALE_ORDER) {
    if (localeKey === 'global') {
      push(`${parts} ${hint} manufacturer export OEM factory`, 'global');
      continue;
    }
    const localized = i18nHintForLocale(i18n, localeKey, hint);
    push(`${parts} ${localized}`, localeKey);
  }

  push(`${parts} supplier FOB CIF MOQ export`, 'global');
  push(`${parts} site:alibaba.com manufacturer factory`, 'global');
  push(`${parts} site:made-in-china.com supplier`, 'china');
  push(`${parts} site:europages.com manufacturer`, 'germany');

  if (type === 'inverter_lifepo4' || type === 'batteries_lifepo4' || type === 'inverter_hybrid') {
    push(`${parts} LiFePO4 OEM CE UL certification factory`, 'global');
    push(`${parts} ${i18n.zh} CE UL 认证 厂家`, 'china');
    push(`${parts} ${i18n.de} CE TÜV Hersteller`, 'germany');
  }
  if (type === 'generator_diesel' || type === 'generator_gas' || type === 'generator_benzin_gas') {
    push(`${parts} diesel genset Perkins Cummins MTU OEM export`, 'global');
    push(`${parts} ${i18n.de} Stromerzeuger OEM Export`, 'germany');
    push(`${parts} ${i18n.it} gruppo elettrogeno OEM export`, 'italy');
    push(`${parts} ${i18n.ja} ディーゼル発電機 OEM`, 'japan');
    push(`${parts} ${i18n.ko} 디젤발전기 OEM`, 'korea');
  }
  if (type === 'solar_panels' || type === 'solar_inverter') {
    push(`${parts} solar PV Tier-1 CE TUV export factory`, 'global');
    push(`${parts} ${i18n.zh} TUV CE 光伏 厂家`, 'china');
    push(`${parts} ${i18n.de} Photovoltaik Hersteller TÜV`, 'germany');
  }

  return queries;
}

function buildSearchQueries(requestDoc, extraHint = '') {
  const types = normalizeEquipmentTypes(requestDoc);
  const priorityLocales = detectRegionalFocus(extraHint);
  const seen = new Set();
  const candidates = [];

  for (const type of types) {
    for (const item of buildSearchQueriesForType(requestDoc, type, extraHint)) {
      const k = `${item.locale}:${item.q.toLowerCase()}`;
      if (seen.has(k)) continue;
      seen.add(k);
      candidates.push(item);
    }
  }

  return selectDiverseQueries(candidates, MAX_SEARCH_QUERIES, priorityLocales);
}

function buildUserPrompt(requestDoc, webContext, maxCandidates, excludeSuppliers = []) {
  const types = normalizeEquipmentTypes(requestDoc);
  const typeLabels = types.map((t) => EQUIPMENT_LABELS_UK[t] || t).join(', ');
  const typeKeys = types.join(', ');
  const lines = [
    `Заявка: ${requestDoc.requestNumber || ''}`,
    `Тип${types.length > 1 ? 'и' : ''} обладнання: ${typeLabels}`,
    `Ключі категорій (для equipmentTypeHints): ${typeKeys}`,
    `Найменування: ${requestDoc.equipmentName || '—'}`,
    `Кількість: ${requestDoc.quantity ?? 1}`,
    `Технічні вимоги:\n${requestDoc.technicalRequirements || '—'}`,
    `Коментар менеджера: ${requestDoc.managerComment || '—'}`,
    `Бажаний термін: ${requestDoc.desiredDeliveryDate || '—'}`,
    `\nПотрібно до ${maxCandidates} кандидатів-постачальників.`,
    `\nОБОВ'ЯЗКОВО: не включай постачальників з Російської Федерації (РФ) — ні в candidates, ні в sourceUrls.`,
  ];
  if (excludeSuppliers.length) {
    lines.push(
      `\n--- У базі ВЕД вже є ці постачальники (НЕ пропонуй їх повторно, шукай інших): ---\n${excludeSuppliers.slice(0, 80).join('\n')}`
    );
  }
  if (webContext) {
    lines.push(
      `\n--- Уривки з веб-пошуку (SerpApi, різні мови/регіони). Використовуй як джерело; опис у JSON — українською. ---\n${webContext}`
    );
  } else {
    lines.push('\n--- Веб-пошук недоступний. Формуй обережні гіпотези; багато полів лишай порожніми. ---');
  }
  return lines.join('\n').slice(0, MAX_USER_PROMPT);
}

async function fetchVedWebContext(queries) {
  const apiKey = resolveSerpApiKey();
  if (!apiKey || !queries.length) return { context: '', sources: [] };

  const fallback = DEFAULT_SERP_LOCALE;
  const perQuery = Math.min(8, Math.max(4, parseInt(String(process.env.VED_AI_ORGANIC_PER_QUERY || '5'), 10) || 5));

  const blocks = [];
  const sources = [];
  const seenLinks = new Set();
  let n = 0;

  for (const rawQuery of queries) {
    const query =
      typeof rawQuery === 'string'
        ? { q: rawQuery, ...fallback }
        : {
            q: rawQuery.q,
            google_domain: rawQuery.google_domain || fallback.google_domain,
            gl: rawQuery.gl || fallback.gl,
            hl: rawQuery.hl || fallback.hl,
            locale: rawQuery.locale || '',
          };
    const q = String(query.q || '').trim();
    if (q.length < 8) continue;

    const sp = new URLSearchParams({
      engine: 'google',
      api_key: apiKey,
      q,
      google_domain: query.google_domain,
      gl: query.gl,
      hl: query.hl,
      safe: 'active',
    });
    let data;
    try {
      const r = await fetch(`${SERPAPI_ENDPOINT}?${sp.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) continue;
      data = await r.json();
    } catch (e) {
      console.warn('[ved-ai] SerpApi:', e.message);
      continue;
    }

    const organic = Array.isArray(data?.organic_results) ? data.organic_results : [];
    for (const row of organic.slice(0, perQuery)) {
      const link = String(row?.link || '').trim();
      const title = String(row?.title || '').trim().slice(0, 220);
      const snippet = String(row?.snippet || '').trim().slice(0, 700);
      if (!snippet && !title) continue;
      if (link && (seenLinks.has(link) || isExcludedSupplierUrl(link))) continue;
      if (link) {
        seenLinks.add(link);
        sources.push({
          url: link,
          title: title || link,
          snippet: snippet.slice(0, 400),
          locale: query.locale || '',
        });
      }
      n += 1;
      const localeTag = query.locale ? ` [${query.locale}]` : '';
      const lines = [`[${n}]${localeTag} ${title || '(без заголовка)'}`];
      if (link) lines.push(link);
      if (snippet) lines.push(snippet);
      blocks.push(lines.join('\n'));
      if (blocks.join('\n\n').length >= MAX_WEB_CONTEXT) break;
    }
    if (blocks.join('\n\n').length >= MAX_WEB_CONTEXT) break;
  }

  return {
    context: blocks.join('\n\n').slice(0, MAX_WEB_CONTEXT),
    sources: sources.slice(0, 40),
  };
}

function normalizeCandidate(raw, idx) {
  const priceStatus = ['unverified', 'estimated', 'quoted'].includes(String(raw?.priceStatus || '').toLowerCase())
    ? String(raw.priceStatus).toLowerCase()
    : 'unverified';
  let priceEstimate = raw?.priceEstimate;
  if (priceEstimate != null) {
    const n = Number(priceEstimate);
    priceEstimate = Number.isFinite(n) && n >= 0 ? n : null;
  } else {
    priceEstimate = null;
  }
  let priceFrom = raw?.priceFrom;
  let priceTo = raw?.priceTo;
  if (priceFrom != null) {
    const n = Number(priceFrom);
    priceFrom = Number.isFinite(n) && n >= 0 ? n : null;
  } else {
    priceFrom = null;
  }
  if (priceTo != null) {
    const n = Number(priceTo);
    priceTo = Number.isFinite(n) && n >= 0 ? n : null;
  } else {
    priceTo = null;
  }
  if (priceFrom == null && priceTo == null && priceEstimate != null) {
    priceFrom = priceEstimate;
    priceTo = priceEstimate;
  }
  let prep = raw?.prepaymentPercentHint;
  if (prep != null) {
    const n = Number(prep);
    prep = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
  } else {
    prep = null;
  }
  const sourceUrls = Array.isArray(raw?.sourceUrls)
    ? raw.sourceUrls.map((u) => String(u || '').trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, 5)
    : [];
  const hintRaw = Array.isArray(raw?.equipmentTypeHints)
    ? raw.equipmentTypeHints
    : raw?.equipmentTypeHint
      ? [raw.equipmentTypeHint]
      : [];
  const equipmentTypeHints = normalizeEquipmentTypes({ equipmentTypes: hintRaw }).slice(0, 3);
  const tradeCategoriesRaw = Array.isArray(raw?.tradeCategories)
    ? raw.tradeCategories
    : raw?.tradeCategory
      ? [raw.tradeCategory]
      : [];
  const tradeCategories = tradeCategoriesRaw
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .slice(0, 5);

  return {
    supplierName: String(raw?.supplierName || '').trim().slice(0, 200),
    country: String(raw?.country || '').trim().slice(0, 120),
    website: String(raw?.website || '').trim().slice(0, 300),
    contact: String(raw?.contact || '').trim().slice(0, 300),
    productModel: String(raw?.productModel || '').trim().slice(0, 300),
    productSummary: String(raw?.productSummary || '').trim().slice(0, 800),
    priceFrom,
    priceTo,
    priceEstimate,
    priceStatus,
    currency: String(raw?.currency || '').trim().slice(0, 12).toUpperCase(),
    certificates: String(raw?.certificates || raw?.certificatesHint || '').trim().slice(0, 400),
    powerLineup: String(raw?.powerLineup || raw?.powerLineupHint || '').trim().slice(0, 400),
    riskDescription: String(raw?.riskDescription || '').trim().slice(0, 2000),
    equipmentTypeHints,
    tradeCategories,
    incotermsHint: String(raw?.incotermsHint || '').trim().slice(0, 40).toUpperCase(),
    moqHint: String(raw?.moqHint || '').trim().slice(0, 120),
    leadTimeHint: String(raw?.leadTimeHint || '').trim().slice(0, 120),
    prepaymentPercentHint: prep,
    riskNotes: Array.isArray(raw?.riskNotes)
      ? raw.riskNotes.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 8)
      : [],
    strengths: Array.isArray(raw?.strengths)
      ? raw.strengths.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 6)
      : [],
    sourceUrls,
    addedToProposalId: null,
    sortOrder: idx,
  };
}

function normalizeLlmResult(parsed, model, maxCandidates) {
  const candidatesRaw = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  const candidates = candidatesRaw
    .map((c, i) => normalizeCandidate(c, i))
    .filter((c) => (c.supplierName || c.website || c.productModel) && !isExcludedSupplierCandidate(c))
    .slice(0, maxCandidates);

  return {
    summary: String(parsed?.summary || '').trim().slice(0, 2000),
    recommendations: Array.isArray(parsed?.recommendations)
      ? parsed.recommendations.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 8)
      : [],
    candidates,
    llmModel: model,
    disclaimer:
      'Результат згенеровано ШІ на основі відкритих джерел. Ціни, контакти та умови потребують обов’язкової перевірки ВЕД-фахівцем перед RFQ/договором.',
  };
}

async function callVedLlm(userPrompt, maxCandidates) {
  const { apiKey, base, model } = resolveVedLlmClient();
  if (!apiKey) throw new Error('LLM не налаштовано (OPENAI_API_KEY або PRODUCT_ASSISTANT_LLM_API_KEY)');

  const timeoutMs = Math.min(
    120000,
    Math.max(15000, parseInt(String(process.env.VED_AI_LLM_TIMEOUT_MS || '90000'), 10) || 90000)
  );

  const system = SYSTEM_PROMPT.replace('MAX_CANDIDATES', String(maxCandidates));
  const url = `${base}/chat/completions`;
  const body = {
    model,
    temperature: 0.35,
    max_tokens: 3500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(formatLlmHttpError(res.status, errText, model, base));
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM повернув порожню відповідь');

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch (e) {
    throw new Error('LLM повернув некоректний JSON');
  }

  return normalizeLlmResult(parsed, model, maxCandidates);
}

/**
 * @param {object} requestDoc — lean VedImportRequest
 * @param {{ extraSearchHint?: string }} options
 */
async function runVedSupplierResearch(requestDoc, options = {}) {
  if (!vedAiEnabled()) {
    throw new Error('ШІ-модуль ВЕД вимкнено або не налаштовано LLM');
  }

  const maxCandidates = vedAiMaxCandidates();
  const searchQueries = buildSearchQueries(requestDoc, options.extraSearchHint);
  const { context: webContext, sources } = await fetchVedWebContext(searchQueries);
  const excludeSuppliers = Array.isArray(options.excludeSuppliers) ? options.excludeSuppliers : [];
  const userPrompt = buildUserPrompt(requestDoc, webContext, maxCandidates, excludeSuppliers);
  const llmResult = await callVedLlm(userPrompt, maxCandidates);

  return {
    searchQueries,
    webContextPreview: webContext.slice(0, 4000),
    sources,
    userPromptPreview: userPrompt.slice(0, 4000),
    ...llmResult,
    hasWebSearch: Boolean(resolveSerpApiKey()),
  };
}

function candidateToProposalDraft(candidate) {
  const commentParts = [
    candidate.productSummary,
    candidate.riskNotes?.length ? `Ризики (ШІ): ${candidate.riskNotes.join('; ')}` : '',
    candidate.strengths?.length ? `Переваги (ШІ): ${candidate.strengths.join('; ')}` : '',
    candidate.priceStatus === 'unverified'
      ? 'Ціна з ШІ: не перевірено — потрібен запит пропозиції.'
      : `Ціна з ШІ (${candidate.priceStatus}): потребує верифікації.`,
    candidate.sourceUrls?.length ? `Джерела: ${candidate.sourceUrls.join(', ')}` : '',
  ].filter(Boolean);

  return {
    supplierName: candidate.supplierName || '',
    country: candidate.country || '',
    website: candidate.website || '',
    contact: candidate.contact || '',
    productModel: candidate.productModel || '',
    price: candidate.priceEstimate,
    currency: candidate.currency || '',
    incoterms: candidate.incotermsHint || '',
    moq: candidate.moqHint || '',
    leadTime: candidate.leadTimeHint || '',
    prepaymentPercent: candidate.prepaymentPercentHint,
    paymentTerms: '',
    comment: commentParts.join('\n').slice(0, 8000),
  };
}

module.exports = {
  vedAiEnabled,
  vedAiDailyLimit,
  vedAiMaxCandidates,
  buildSearchQueries,
  runVedSupplierResearch,
  candidateToProposalDraft,
  isExcludedSupplierCandidate,
  resolveSerpApiKey,
  resolveLlmApiKey,
};
