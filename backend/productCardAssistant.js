/**
 * Асистент для форми «нова карточка продукту»: довідкові дані з Вікіпедії + заглушка, якщо нічого не знайдено.
 * Імпорт зображень — лише з дозволених HTTPS-доменів (Wikimedia / Wikipedia).
 */

const cloudinary = require('cloudinary').v2;

const USER_AGENT =
  process.env.PRODUCT_ASSISTANT_USER_AGENT ||
  'DarexTradingSolutions/1.0 (product-card-assistant; warehouse)';

function allowedImageHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  return (
    h.endsWith('wikimedia.org') ||
    h.endsWith('wikipedia.org') ||
    h === 'upload.wikimedia.org' ||
    h.endsWith('.upload.wikimedia.org')
  );
}

function assertAllowedImageUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch (_) {
    throw new Error('Некоректний URL зображення');
  }
  if (u.protocol !== 'https:') throw new Error('Дозволені лише HTTPS-посилання на зображення');
  if (!allowedImageHostname(u.hostname)) {
    throw new Error('Дозволені лише зображення з Wikipedia / Wikimedia');
  }
  return u.href;
}

async function fetchJson(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function wikipediaSuggestForLang(lang, query) {
  const api = `https://${lang}.wikipedia.org/w/api.php`;
  const sp = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    format: 'json',
    utf8: '1',
    srlimit: '3',
  });
  const searchData = await fetchJson(`${api}?${sp.toString()}`);
  const hits = searchData?.query?.search;
  if (!Array.isArray(hits) || hits.length === 0) return null;

  const title = hits[0].title;
  const encoded = encodeURIComponent(title.replace(/ /g, '_'));
  const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  let summary;
  try {
    summary = await fetchJson(summaryUrl);
  } catch (_) {
    return null;
  }

  const specs = [];
  const sid = `wiki-${lang}`;
  if (summary.extract) {
    const ex = String(summary.extract).trim().slice(0, 800);
    if (ex) specs.push({ id: `${sid}-extract`, name: 'Опис (Вікіпедія)', value: ex });
  }
  if (summary.description) {
    specs.push({
      id: `${sid}-desc`,
      name: 'Категорія (Вікіпедія)',
      value: String(summary.description).trim(),
    });
  }

  const images = [];
  if (summary.thumbnail?.source) {
    images.push({
      id: `${sid}-thumb`,
      url: summary.thumbnail.source,
      title: summary.title || title,
    });
  }

  return {
    source: 'wikipedia',
    lang,
    suggestedName: (summary.title || title || '').trim(),
    manufacturerHint: '',
    specs,
    images,
    disclaimer:
      'Дані з Вікіпедії носять довідковий характер. Перевірте точність перед збереженням карточки.',
  };
}

async function wikipediaSuggest(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return null;
  try {
    return (await wikipediaSuggestForLang('uk', q)) || (await wikipediaSuggestForLang('en', q));
  } catch (e) {
    console.warn('[product-card-assistant] Wikipedia:', e.message);
    return null;
  }
}

function mockSuggest(query) {
  const q = String(query || '').trim();
  const specs = [
    {
      id: 'mock-note',
      name: 'Підказка асистента',
      value:
        'Живий пошук через Вікіпедію тимчасово недоступний або нічого не знайдено. Можна підключити платні API (Google Custom Search, LLM) для точніших даних.',
    },
  ];
  if (/генератор|genset|diesel|ква|kva|квт|kwt|de-|дизел/i.test(q)) {
    specs.push(
      {
        id: 'mock-gen-1',
        name: 'Типові характеристики (перевірте за паспортом)',
        value: 'Номінальна / резервна потужність (кВт або кВА), напруга (В), частота (Гц), клас двигуна',
      },
      {
        id: 'mock-gen-2',
        name: 'Рекомендовано уточнити',
        value: 'Виробник двигуна та альтернатора, витрата палива, рівень шуму, маса / габарити',
      },
    );
  }
  return {
    source: 'mock',
    suggestedName: q,
    manufacturerHint: '',
    specs,
    images: [],
    disclaimer: 'Заглушка асистента без зовнішнього джерела. Дані потрібно перевірити вручну.',
  };
}

async function suggest(query) {
  const q = String(query || '').trim();
  if (q.length < 2) {
    return { source: 'empty', suggestedName: '', manufacturerHint: '', specs: [], images: [], disclaimer: '' };
  }
  const wiki = await wikipediaSuggest(q);
  if (wiki && (wiki.specs.length > 0 || wiki.images.length > 0)) return wiki;
  return mockSuggest(q);
}

async function importImageFromUrl(imageUrl) {
  const url = assertAllowedImageUrl(imageUrl);
  const result = await cloudinary.uploader.upload(url, {
    folder: 'product-card-assistant',
    resource_type: 'image',
  });
  return {
    photoUrl: result.secure_url,
    cloudinaryId: result.public_id,
    filename: 'assistant-wiki-image.jpg',
  };
}

module.exports = {
  suggest,
  importImageFromUrl,
  allowedImageHostname,
};
