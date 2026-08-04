import React from 'react';

/** Блок атрибуції: UTM, Meta, landing — для картки ліда. */
function MarketingLeadAttribution({ lead }) {
  if (!lead) return null;

  const hasUtm = lead.utmSource || lead.utmMedium || lead.utmCampaign || lead.utmContent || lead.utmTerm;
  const hasMeta = lead.metaCampaignId || lead.metaCampaignName || lead.metaAdName;
  const hasVisit = lead.landingPage || lead.trafficSource || lead.referrer;

  if (!hasUtm && !hasMeta && !hasVisit) return null;

  return (
    <div className="marketing-utm-block marketing-attribution-block">
      <strong style={{ display: 'block', marginBottom: 8 }}>Атрибуція / UTM</strong>
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
          {lead.metaCampaignId && !lead.metaCampaignName && <li>Campaign ID: {lead.metaCampaignId}</li>}
          {lead.metaAdId && <li>Ad ID: {lead.metaAdId}</li>}
          {lead.metaLeadId && <li>Lead ID: {lead.metaLeadId}</li>}
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
