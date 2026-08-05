/**
 * Аналіз конкурентоспроможності тендерів для ніші:
 * дизель-генератори, сервіс, монтаж, ДБЖ/UPS.
 */

const CPV_NICHE_PREFIXES = [
  '31120000',
  '31100000',
  '45311200',
  '50532000',
  '50532300',
];

const CATEGORY_LABELS = {
  dg: 'Дизель-генератор / ДЕС',
  service: 'Сервіс / ТО / ремонт',
  mounting: 'Монтаж / пусконалагодження',
  ups: 'ДБЖ / UPS / ІБП',
  mixed: 'Комплексна закупівля',
  other: 'Інше',
};

const CATEGORY_KEYWORDS = {
  dg: ['дизель', 'генератор', 'дес', 'дг', 'електростанц', 'дизель-генератор', 'power plant'],
  service: ['сервіс', 'то ', 'техобслугов', 'технічного обслугов', 'ремонт', 'обслуговування', 'maintenance', '505323', '50530000'],
  mounting: ['монтаж', 'пусконалагод', 'пнр', 'підключен', 'installation', 'electrical work'],
  ups: ['ups', 'дбж', 'ібп', 'безперебій', 'uninterruptible'],
};

function cpvMatchesNiche(cpvCodes) {
  return (cpvCodes || []).some((code) =>
    CPV_NICHE_PREFIXES.some((prefix) => String(code).startsWith(prefix))
  );
}

function cpvInText(text) {
  const hay = String(text || '');
  return CPV_NICHE_PREFIXES.some((prefix) => {
    const re = new RegExp(`\\b${prefix}\\d{0,2}(?:-\\d)?\\b`);
    return re.test(hay);
  });
}

function hasNicheCpv(tender, text) {
  return cpvMatchesNiche(tender.cpvCodes) || cpvInText(text);
}

function detectCategory(text) {
  const hay = String(text || '').toLowerCase();
  const hits = [];
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => hay.includes(w))) hits.push(cat);
  }
  if (hits.length === 0) return 'other';

  const hasService = hits.includes('service');
  const hasDg = hits.includes('dg');
  const hasMounting = hits.includes('mounting');

  if (hasService && (hasDg || hasMounting || cpvInText(hay))) return 'service';
  if (hasMounting && hasDg && !hasService) return 'mounting';
  if (hits.includes('ups') && hits.length === 1) return 'ups';

  if (hits.length === 1) return hits[0];
  if (hits.length >= 2) return 'mixed';
  return hits[0];
}

function extractPowerKw(text) {
  const hay = String(text || '');
  const patterns = [
    /(\d{1,4}(?:[.,]\d+)?)\s*(?:кВт|kW|квт|kw)/i,
    /(\d{1,4}(?:[.,]\d+)?)\s*(?:кВА|kVA|ква|kva)/i,
    /потужност[іью]\s*[:—-]?\s*(\d{1,4}(?:[.,]\d+)?)/i,
  ];
  for (const re of patterns) {
    const m = hay.match(re);
    if (m) {
      const n = parseFloat(String(m[1]).replace(',', '.'));
      if (!Number.isNaN(n) && n > 0 && n < 10000) return n;
    }
  }
  return null;
}

function daysUntil(deadlineIso) {
  if (!deadlineIso) return null;
  const end = new Date(deadlineIso);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}

function inferRequiredDocuments(tender) {
  const docs = [];
  const hay = `${tender.title || ''} ${tender.description || ''}`.toLowerCase();
  const docTitles = (tender.documents || []).map((d) => (d.title || '').toLowerCase()).join(' ');

  if (/licen|ліценз|дозвол/i.test(hay + docTitles)) docs.push('Ліцензії / дозволи');
  if (/сертиф|certificate/i.test(hay + docTitles)) docs.push('Сертифікати відповідності');
  if (/досвід|аналог|reference|референс/i.test(hay + docTitles)) docs.push('Досвід аналогічних робіт (референс-лист)');
  if (/фінанс|bank|банк|гарант/i.test(hay + docTitles)) docs.push('Фінансова звітність / банківська гарантія');
  if (/тз|технічн|specification/i.test(hay + docTitles)) docs.push('Технічне завдання (TZ)');
  if (/страхов|insurance/i.test(hay + docTitles)) docs.push('Страховий поліс');
  if (docs.length === 0) docs.push('Тендерна пропозиція', 'Документи постачальника (типовий пакет Prozorro)');

  return [...new Set(docs)];
}

function buildCompetitiveNotes(tender, category) {
  const notes = [];
  const days = daysUntil(tender.deadline);
  const power = extractPowerKw(`${tender.title} ${tender.description}`);
  const text = `${tender.title} ${tender.description}`;

  if (hasNicheCpv(tender, text)) {
    notes.push('CPV відповідає профілю (генератори / ТО / монтаж).');
  }

  if (tender.numberOfTenderers != null) {
    if (tender.numberOfTenderers === 0) notes.push('Поки немає учасників — можлива можливість без жорсткої конкуренції.');
    else if (tender.numberOfTenderers <= 2) notes.push(`Низька конкуренція (${tender.numberOfTenderers} учасн.).`);
    else notes.push(`Висока конкуренція (${tender.numberOfTenderers} учасн.) — потрібна агресивна ціна.`);
  }

  if (days != null) {
    if (days < 3) notes.push('⚠️ Критично мало часу до дедлайну — ризик не встигнути підготувати документи.');
    else if (days < 7) notes.push('Обмежений термін — пріоритетна перевірка TZ та постачальників.');
    else if (days >= 14) notes.push('Достатній термін для підготовки КП та узгодження з постачальником.');
  }

  if (power) {
    if (power >= 500) notes.push(`Потужність ~${power} кВт — потребує перевірки логістики та монтажної бригади.`);
    else if (power <= 50) notes.push(`Потужність ~${power} кВт — типовий сегмент, швидше погодження.`);
  } else if (category === 'service') {
    notes.push('Сервісна закупівля — перевірте перелік об’єктів і періодичність ТО в TZ.');
  }

  if (tender.budget != null && tender.budget < 100000) {
    notes.push('Невеликий бюджет — перевірте маржинальність та мінімальний поріг участі.');
  }
  if (tender.budget != null && tender.budget > 5000000) {
    notes.push('Великий бюджет — можлива потреба в консорціумі або субпідряді.');
  }

  return notes;
}

function computeScore(tender, category) {
  let score = 50;
  const days = daysUntil(tender.deadline);
  const text = `${tender.title} ${tender.description}`;
  const power = extractPowerKw(text);
  const nicheCpv = hasNicheCpv(tender, text);

  if (['dg', 'service', 'mounting', 'ups'].includes(category)) score += 15;
  else if (category === 'mixed') score += 8;

  if (nicheCpv) score += 15;
  if (category === 'service') score += 5;

  if (power) score += 10;
  else if (category === 'service' && nicheCpv) score += 5;

  if (tender.budget != null && tender.budget >= 200000) score += 5;
  if (tender.budget != null && tender.budget >= 50000 && category === 'service') score += 3;
  if (tender.region) score += 5;

  if (days != null) {
    if (days < 2) score -= 30;
    else if (days < 5) score -= 15;
    else if (days >= 10) score += 10;
  }

  if (tender.numberOfTenderers != null && tender.numberOfTenderers >= 5) score -= 10;
  if (tender.numberOfTenderers === 0) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function recommendationFromScore(score, days) {
  if (days != null && days < 2) return 'skip';
  if (score >= 70) return 'take';
  if (score >= 45) return 'review';
  return 'skip';
}

const RECOMMENDATION_LABELS = {
  take: '✅ Беремо в роботу',
  review: '🔍 Потрібна перевірка',
  skip: '⏭️ Пропускаємо',
};

function analyzeTender(tender) {
  const text = `${tender.title || ''} ${tender.description || ''}`;
  const category = detectCategory(text);
  const powerKw = extractPowerKw(text);
  const daysLeft = daysUntil(tender.deadline);
  const nicheCpv = hasNicheCpv(tender, text);
  const score = computeScore(tender, category);
  const recommendation = recommendationFromScore(score, daysLeft);
  const requiredDocs = inferRequiredDocuments(tender);
  const competitiveNotes = buildCompetitiveNotes(tender, category);

  const strengths = [];
  const risks = [];

  if (['dg', 'service', 'mounting', 'ups'].includes(category)) {
    strengths.push(`Відповідає профілю компанії: ${CATEGORY_LABELS[category]}`);
  }
  if (nicheCpv) strengths.push('CPV / предмет закупівлі в ніші ДГ, ТО або монтажу');
  if (powerKw) strengths.push(`Визначено потужність: ~${powerKw} кВт/кВА`);
  if (daysLeft != null && daysLeft >= 10) strengths.push(`Залишилось ${daysLeft} дн. до дедлайну`);
  if (tender.budget != null) strengths.push(`Бюджет: ${tender.budgetFormatted || tender.budget}`);

  if (daysLeft != null && daysLeft < 5) risks.push('Мало часу на підготовку документів');
  if (!tender.region) risks.push('Регіон не визначено — уточнити логістику');
  if (tender.numberOfTenderers >= 4) risks.push('Висока конкуренція');

  const summary = [
    CATEGORY_LABELS[category] || category,
    powerKw ? `${powerKw} кВт` : null,
    tender.region || null,
    RECOMMENDATION_LABELS[recommendation],
  ].filter(Boolean).join(' · ');

  return {
    category,
    categoryLabel: CATEGORY_LABELS[category] || category,
    powerKw,
    daysLeft,
    score,
    recommendation,
    recommendationLabel: RECOMMENDATION_LABELS[recommendation],
    requiredDocs,
    competitiveNotes,
    strengths,
    risks,
    summary,
  };
}

module.exports = {
  CATEGORY_LABELS,
  RECOMMENDATION_LABELS,
  CPV_NICHE_PREFIXES,
  detectCategory,
  extractPowerKw,
  hasNicheCpv,
  analyzeTender,
};
