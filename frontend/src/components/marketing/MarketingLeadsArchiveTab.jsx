import React from 'react';
import MarketingLeadsTab from './MarketingLeadsTab';

function MarketingLeadsArchiveTab({ user, onArchiveChange }) {
  return <MarketingLeadsTab user={user} mode="archive" onArchiveChange={onArchiveChange} />;
}

export default MarketingLeadsArchiveTab;
