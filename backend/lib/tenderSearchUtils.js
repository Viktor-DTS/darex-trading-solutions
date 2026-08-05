/**
 * Спільні утиліти пошуку тендерів (Prozorro + DZO).
 */
const { detectCategory } = require('./tenderAnalysis');

function isVagueRegion(region) {
  const r = String(region || '').toLowerCase();
  return !r || r.includes('відповідно') || r.includes('документац') || r.includes('згідно');
}

function regionFromTitleText(titleHay) {
  const oblastMatch = String(titleHay || '').match(
    /[А-ЯІЇЄ][а-яіїє'-]+(?:ська|ський)(?:\s*(?:та|і)\s*[А-ЯІЇЄ][а-яіїє'-]+(?:ська|ський))*\s*обл/
  );
  return oblastMatch ? oblastMatch[0] : '';
}

function resolveTenderRegion({ deliveryRegion, procRegion, title, description }) {
  const titleHay = `${title || ''} ${description || ''}`;
  const regionFromTitle = regionFromTitleText(titleHay);
  const delivery = isVagueRegion(deliveryRegion) ? '' : deliveryRegion;
  return delivery || regionFromTitle || procRegion || '';
}

function textMatchesNiche(text, keywords) {
  const hay = String(text || '').toLowerCase();
  return keywords.some((kw) => hay.includes(String(kw).toLowerCase()));
}

function cpvMatchesNiche(cpvCodes, cpvPrefixes) {
  return (cpvCodes || []).some((code) =>
    (cpvPrefixes || []).some((prefix) => String(code).startsWith(prefix))
  );
}

/** CPV часто є в назві тендера, коли API search не повертає items[].classification */
function cpvInText(text, cpvPrefixes) {
  const hay = String(text || '');
  return (cpvPrefixes || []).some((prefix) => {
    const re = new RegExp(`\\b${prefix}\\d{0,2}(?:-\\d)?\\b`);
    return re.test(hay);
  });
}

function matchesRegionFilter(summary, region) {
  if (!region) return true;
  const needle = region.toLowerCase();
  if (summary.region && summary.region.toLowerCase().includes(needle)) return true;
  const hay = `${summary.title || ''} ${summary.description || ''}`.toLowerCase();
  return hay.includes(needle);
}

/** Дедлайн подачі ще не минув. Якщо дедлайн не визначено — показуємо. */
function isSubmissionOpen(deadline) {
  if (!deadline) return true;
  const end = new Date(deadline);
  if (Number.isNaN(end.getTime())) return true;
  return end.getTime() > Date.now();
}

function passesTenderFilters(raw, summary, {
  query,
  keywords,
  category,
  region,
  minBudget,
  maxBudget,
  nicheOnly,
  defaultKeywords,
  cpvPrefixes,
  isActive,
  fromCpvSearch = false,
}) {
  if (isActive && !isActive(raw.status)) return false;
  if (!isSubmissionOpen(summary.deadline)) return false;

  if (!matchesRegionFilter(summary, region)) return false;
  if (minBudget != null && summary.budget != null && summary.budget < minBudget) return false;
  if (maxBudget != null && summary.budget != null && summary.budget > maxBudget) return false;

  if (nicheOnly) {
    const kw = query ? keywords : defaultKeywords;
    const hay = `${summary.title} ${summary.description}`;
    const nicheMatch =
      fromCpvSearch
      || textMatchesNiche(hay, kw)
      || cpvMatchesNiche(summary.cpvCodes, cpvPrefixes)
      || cpvInText(hay, cpvPrefixes);
    if (!nicheMatch) return false;
  }

  if (category) {
    const cat = detectCategory(`${summary.title} ${summary.description}`);
    if (cat !== category && cat !== 'mixed') return false;
  }

  return true;
}

/** Розпізнати UA-номер, DZO/Prozorro URL або internal ID. */
function parseTenderQuery(input) {
  const s = String(input || '').trim();
  if (!s) return null;

  const dzoUuid = s.match(/dzo\.com\.ua\/tenders?\/([a-f0-9]{32})/i);
  if (dzoUuid) return { type: 'dzo_id', id: dzoUuid[1], source: 'dzo' };

  const prozorroUrl = s.match(/prozorro\.gov\.ua\/tender\/(UA-[^\s/?#]+)/i);
  if (prozorroUrl) return { type: 'ua', id: prozorroUrl[1], source: 'auto' };

  const dzoUaUrl = s.match(/dzo\.com\.ua\/tender\/(UA-[^\s/?#]+)/i);
  if (dzoUaUrl) return { type: 'ua', id: dzoUaUrl[1], source: 'auto' };

  if (/^UA-\d{4}-\d{2}-\d{2}-\d{6}-[a-z]$/i.test(s)) {
    return { type: 'ua', id: s, source: 'auto' };
  }

  if (/^[a-f0-9]{32}$/i.test(s)) {
    return { type: 'dzo_id', id: s, source: 'dzo' };
  }

  return null;
}

module.exports = {
  isVagueRegion,
  regionFromTitleText,
  resolveTenderRegion,
  textMatchesNiche,
  cpvMatchesNiche,
  cpvInText,
  matchesRegionFilter,
  isSubmissionOpen,
  passesTenderFilters,
  parseTenderQuery,
};
