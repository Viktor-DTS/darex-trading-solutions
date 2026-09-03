import React from 'react';

const ADMIN_ROLES = ['admin', 'administrator'];

function isMarketingAdminUser(user) {
  return ADMIN_ROLES.includes(String(user?.role || '').toLowerCase());
}

/** Чи значення виглядає як технічний ID / fallback, а не людська назва. */
function looksTechnical(value) {
  const s = String(value || '').trim();
  if (!s) return true;
  if (/^\d{8,}$/.test(s)) return true;
  if (/^campaign_\d+$/i.test(s)) return true;
  return false;
}

/** Блок атрибуції: для менеджерів — лише людські назви; технічні ID/UTM — лише адміну. */
function MarketingLeadAttribution({ lead, interactionLabels = {}, user = null, isAdmin: isAdminProp }) {
  if (!lead) return null;

  const isAdmin = typeof isAdminProp === 'boolean' ? isAdminProp : isMarketingAdminUser(user);

  const campaignName = !looksTechnical(lead.metaCampaignName) ? lead.metaCampaignName : '';
  const adsetName = !looksTechnical(lead.metaAdsetName) ? lead.metaAdsetName : '';
  const adName = !looksTechnical(lead.metaAdName) ? lead.metaAdName : '';
  const formName = lead.metaFormName || '';
  const platform = lead.metaPlatform || '';
  const sourceDetail = lead.sourceDetail && !looksTechnical(lead.sourceDetail) ? lead.sourceDetail : '';

  const humanItems = [
    lead.interactionType && {
      label: 'Тип',
      value: `${interactionLabels[lead.interactionType] || lead.interactionType}${lead.metaIgUsername ? ` · @${lead.metaIgUsername}` : ''}`,
    },
    platform && { label: 'Платформа', value: platform },
    formName && { label: 'Форма', value: formName },
    campaignName && { label: 'Кампанія', value: campaignName },
    adsetName && { label: 'Група оголошень', value: adsetName },
    adName && { label: 'Оголошення', value: adName },
    !campaignName && !adName && sourceDetail && { label: 'Деталі', value: sourceDetail },
    lead.landingPage && { label: 'Сторінка', value: lead.landingPage },
  ].filter(Boolean);

  if (!isAdmin) {
    if (!humanItems.length) return null;
    return (
      <div className="marketing-utm-block marketing-attribution-block">
        <strong style={{ display: 'block', marginBottom: 8 }}>Джерело реклами</strong>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
          {humanItems.map((item) => (
            <li key={item.label}>
              {item.label}: {item.value}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const hasUtm = lead.utmSource || lead.utmMedium || lead.utmCampaign || lead.utmContent || lead.utmTerm;
  const hasMeta = lead.metaCampaignId || lead.metaCampaignName || lead.metaAdName || lead.metaCommentId || lead.metaFormName;
  const hasSocial = lead.metaIgUsername || lead.metaPsid || lead.interactionType;
  const hasVisit = lead.landingPage || lead.trafficSource || lead.referrer;

  if (!hasUtm && !hasMeta && !hasVisit && !hasSocial) return null;

  return (
    <div className="marketing-utm-block marketing-attribution-block">
      <strong style={{ display: 'block', marginBottom: 8 }}>Атрибуція / UTM</strong>
      {lead.interactionType && (
        <p style={{ margin: '0 0 8px', fontSize: 12 }}>
          Тип: <strong>{interactionLabels[lead.interactionType] || lead.interactionType}</strong>
          {lead.metaIgUsername && ` · @${lead.metaIgUsername}`}
        </p>
      )}
      {hasUtm && (
        <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 12 }}>
          {lead.utmSource && <li>utm_source: {lead.utmSource}</li>}
          {lead.utmMedium && <li>utm_medium: {lead.utmMedium}</li>}
          {lead.utmCampaign && <li>utm_campaign: {lead.utmCampaign}</li>}
          {lead.utmContent && <li>utm_content: {lead.utmContent}</li>}
          {lead.utmTerm && <li>utm_term: {lead.utmTerm}</li>}
        </ul>
      )}
      {hasMeta && (
        <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 12 }}>
          {lead.metaPlatform && <li>Платформа: {lead.metaPlatform}</li>}
          {lead.metaCampaignName && <li>Кампанія: {lead.metaCampaignName}</li>}
          {lead.metaAdsetName && <li>Ad set: {lead.metaAdsetName}</li>}
          {lead.metaAdName && <li>Оголошення: {lead.metaAdName}</li>}
          {lead.metaFormName && <li>Форма: {lead.metaFormName}</li>}
          {lead.metaCampaignId && <li>Campaign ID: {lead.metaCampaignId}</li>}
          {lead.metaAdsetId && <li>Ad set ID: {lead.metaAdsetId}</li>}
          {lead.metaAdId && <li>Ad ID: {lead.metaAdId}</li>}
          {lead.metaFormId && <li>Form ID: {lead.metaFormId}</li>}
          {lead.metaLeadId && <li>Lead ID: {lead.metaLeadId}</li>}
          {lead.metaCommentId && <li>Comment ID: {lead.metaCommentId}</li>}
          {lead.metaPostId && <li>Post ID: {lead.metaPostId}</li>}
          {lead.metaMediaId && <li>Media ID: {lead.metaMediaId}</li>}
        </ul>
      )}
      {hasVisit && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
          {lead.trafficSource && <li>Traffic source: {lead.trafficSource}</li>}
          {lead.landingPage && <li>Landing: {lead.landingPage}</li>}
          {lead.referrer && <li>Referrer: {lead.referrer}</li>}
        </ul>
      )}
    </div>
  );
}

export default MarketingLeadAttribution;
