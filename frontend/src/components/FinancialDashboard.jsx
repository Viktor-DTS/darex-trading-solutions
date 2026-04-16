import React, { useMemo, useState } from 'react';
import GlobalCalculationCoefficientsEditor from './GlobalCalculationCoefficientsEditor';
import './FinancialDashboard.css';

/** Бічне меню фінвідділу: для ролі gistov показуємо лише whitelisted пункти (нові пункти за замовчуванням приховані). */
const FINANCE_SIDEBAR_ITEMS = [
  {
    id: 'coefficients',
    label: 'Коефіцієнти розрахунку',
    icon: '📐',
    tab: 'coefficients'
  }
];

const GISTOV_ALLOWED_FINANCE_SIDEBAR_IDS = new Set(['coefficients']);

const COEFF_SCOPE_COPY = {
  sales: {
    description:
      'Склад коефіцієнтів задається в системі; тут вносяться лише числові значення для розрахунків відділу продажів.'
  },
  service: {
    description:
      'Склад коефіцієнтів задається в системі; тут вносяться лише числові значення для розрахунків сервісного відділу.'
  }
};

function FinancialDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('coefficients');
  const isGistov = String(user?.role || '').toLowerCase() === 'gistov';
  const [coeffScope, setCoeffScope] = useState(() => (isGistov ? 'service' : 'sales'));

  const sidebarItems = useMemo(() => {
    if (isGistov) {
      return FINANCE_SIDEBAR_ITEMS.filter((it) => GISTOV_ALLOWED_FINANCE_SIDEBAR_IDS.has(it.id));
    }
    return FINANCE_SIDEBAR_ITEMS;
  }, [isGistov]);

  const effectiveCoeffScope = isGistov ? 'service' : coeffScope;

  return (
    <div className="finance-dashboard">
      <div className="finance-dashboard-main">
        <aside className="finance-sidebar">
          <div className="finance-sidebar-inner">
            <nav className="finance-sidebar-nav">
              <div className="finance-sidebar-section-title">Фінансовий відділ</div>
              {sidebarItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`finance-sidebar-tab ${activeTab === item.tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(item.tab)}
                >
                  <span className="tab-icon">{item.icon}</span>
                  <span className="tab-label">{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </aside>
        <main className="finance-main-content">
          {activeTab === 'coefficients' && (
            <div className="finance-coefficients-wrap">
              <h1 className="finance-coefficients-main-title">Коефіцієнти розрахунку</h1>
              {!isGistov && (
                <div className="finance-subtabs" role="tablist" aria-label="Напрямок коефіцієнтів">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={coeffScope === 'sales'}
                    className={`finance-subtab ${coeffScope === 'sales' ? 'active' : ''}`}
                    onClick={() => setCoeffScope('sales')}
                  >
                    Для відділу продажів
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={coeffScope === 'service'}
                    className={`finance-subtab ${coeffScope === 'service' ? 'active' : ''}`}
                    onClick={() => setCoeffScope('service')}
                  >
                    Для сервісного відділу
                  </button>
                </div>
              )}
              <div className="finance-subtab-panel" role="tabpanel">
                <GlobalCalculationCoefficientsEditor
                  key={effectiveCoeffScope}
                  user={user}
                  scope={effectiveCoeffScope}
                  description={COEFF_SCOPE_COPY[effectiveCoeffScope].description}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default FinancialDashboard;
