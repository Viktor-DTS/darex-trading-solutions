/**
 * Meta Graph API — збагачення лідів: назви кампаній, UTM-мапінг, платформа.
 */

const GRAPH_VERSION = 'v21.0';

async function metaGraphGet(objectId, fields, token) {
  if (!objectId || !token) return null;
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(objectId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[META GRAPH]', objectId, data.error?.message || res.status);
      return null;
    }
    return data;
  } catch (e) {
    console.warn('[META GRAPH]', objectId, e.message);
    return null;
  }
}

/**
 * Підтягує назви кампанії / adset / ad / form та формує UTM-поля для DTS.
 */
async function enrichMetaLeadAttribution(changeValue = {}) {
  const token = process.env.META_PAGE_ACCESS_TOKEN || '';
  if (!token) {
    return buildUtmFromIds(changeValue, {});
  }

  const adId = changeValue.ad_id ? String(changeValue.ad_id) : '';
  const adsetId = changeValue.adset_id || changeValue.adgroup_id
    ? String(changeValue.adset_id || changeValue.adgroup_id)
    : '';
  const campaignId = changeValue.campaign_id ? String(changeValue.campaign_id) : '';
  const formId = changeValue.form_id ? String(changeValue.form_id) : '';

  const names = {
    metaCampaignId: campaignId,
    metaAdsetId: adsetId,
    metaAdId: adId,
    metaFormId: formId,
    metaCampaignName: '',
    metaAdsetName: '',
    metaAdName: '',
    metaFormName: '',
    metaPlatform: 'unknown',
  };

  const tasks = [];

  if (adId) {
    tasks.push(
      metaGraphGet(
        adId,
        'name,campaign{id,name},adset{id,name}',
        token
      ).then((ad) => {
        if (!ad) return;
        names.metaAdName = ad.name || '';
        if (ad.campaign?.id) {
          names.metaCampaignId = String(ad.campaign.id);
          names.metaCampaignName = ad.campaign.name || names.metaCampaignName;
        }
        if (ad.adset?.id) {
          names.metaAdsetId = String(ad.adset.id);
          names.metaAdsetName = ad.adset.name || names.metaAdsetName;
        }
      })
    );
  } else {
    if (campaignId) {
      tasks.push(
        metaGraphGet(campaignId, 'name,objective', token).then((c) => {
          if (c?.name) names.metaCampaignName = c.name;
        })
      );
    }
    if (adsetId) {
      tasks.push(
        metaGraphGet(adsetId, 'name', token).then((a) => {
          if (a?.name) names.metaAdsetName = a.name;
        })
      );
    }
  }

  if (formId) {
    tasks.push(
      metaGraphGet(formId, 'name', token).then((f) => {
        if (f?.name) names.metaFormName = f.name;
      })
    );
  }

  await Promise.all(tasks);

  // Instagram vs Facebook — евристика з назви кампанії/adset або env
  const hint = `${names.metaCampaignName} ${names.metaAdsetName} ${names.metaAdName}`.toLowerCase();
  if (hint.includes('instagram') || hint.includes('insta ') || hint.includes(' ig ')) {
    names.metaPlatform = 'instagram';
  } else if (hint.includes('facebook') || hint.includes(' fb ')) {
    names.metaPlatform = 'facebook';
  } else if (process.env.META_DEFAULT_PLATFORM === 'instagram') {
    names.metaPlatform = 'instagram';
  } else {
    names.metaPlatform = 'facebook';
  }

  return buildUtmFromIds(changeValue, names);
}

function buildUtmFromIds(changeValue, names) {
  const platform = names.metaPlatform || 'facebook';
  const isInstagram = platform === 'instagram';

  return {
    ...names,
    source: isInstagram ? 'instagram' : 'facebook',
    sourceDetail: [
      names.metaCampaignName,
      names.metaAdsetName,
      names.metaAdName,
    ].filter(Boolean).join(' → ') || (isInstagram ? 'Instagram Lead Ads' : 'Facebook Lead Ads'),
    trafficSource: isInstagram ? 'instagram.com' : 'facebook.com',
    utmSource: 'meta',
    utmMedium: 'paid_social',
    utmCampaign: names.metaCampaignName || (names.metaCampaignId ? `campaign_${names.metaCampaignId}` : ''),
    utmContent: names.metaAdName || names.metaAdsetName || names.metaAdId || '',
    utmTerm: names.metaAdId || names.metaFormName || String(changeValue.leadgen_id || ''),
    referrer: isInstagram ? 'https://instagram.com/' : 'https://facebook.com/',
  };
}

/**
 * Розбирає custom fields форми Meta, включно з UTM якщо додані в питання форми.
 */
function mapMetaFieldDataExtended(fieldData) {
  const map = {};
  (fieldData || []).forEach((row) => {
    const key = String(row.name || '').toLowerCase().replace(/\s+/g, '_');
    const val = Array.isArray(row.values) ? row.values[0] : row.values;
    if (key) map[key] = val != null ? String(val).trim() : '';
  });

  const pick = (...keys) => {
    for (const k of keys) {
      const norm = k.toLowerCase().replace(/\s+/g, '_');
      if (map[norm]) return map[norm];
    }
    return '';
  };

  const knownKeys = new Set([
    'full_name', 'first_name', 'last_name', 'phone_number', 'phone', 'email', 'city',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'traffic_source', 'landing_page', 'referrer', 'message', 'comments', 'comment',
    'product', 'product_interest', 'which_product_are_you_interested_in?',
  ]);

  const extras = Object.entries(map)
    .filter(([k]) => !knownKeys.has(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');

  const utmFromForm = {
    utmSource: pick('utm_source', 'utm source'),
    utmMedium: pick('utm_medium', 'utm medium'),
    utmCampaign: pick('utm_campaign', 'utm campaign'),
    utmContent: pick('utm_content', 'utm content'),
    utmTerm: pick('utm_term', 'utm term'),
  };

  return {
    clientName: pick('full_name') || [pick('first_name'), pick('last_name')].filter(Boolean).join(' '),
    contactPhone: pick('phone_number', 'phone', 'telefon', 'tel'),
    contactEmail: pick('email', 'e-mail'),
    city: pick('city', 'misto', 'місто'),
    productInterest: pick(
      'product',
      'product_interest',
      'which_product_are_you_interested_in?',
      'продукт',
      'interes'
    ),
    comment: pick('message', 'comments', 'comment', 'komentar') || extras,
    trafficSource: pick('traffic_source', 'traffic source'),
    landingPage: pick('landing_page', 'landing page', 'landing'),
    referrer: pick('referrer'),
    utmFromForm,
    customFieldsRaw: map,
  };
}

/** UTM з форми мають пріоритет над автоматичним мапінгом з Graph API. */
function mergeUtm(graphUtm, formUtm) {
  return {
    utmSource: formUtm.utmSource || graphUtm.utmSource,
    utmMedium: formUtm.utmMedium || graphUtm.utmMedium,
    utmCampaign: formUtm.utmCampaign || graphUtm.utmCampaign,
    utmContent: formUtm.utmContent || graphUtm.utmContent,
    utmTerm: formUtm.utmTerm || graphUtm.utmTerm,
  };
}

module.exports = {
  enrichMetaLeadAttribution,
  mapMetaFieldDataExtended,
  mergeUtm,
  metaGraphGet,
};
