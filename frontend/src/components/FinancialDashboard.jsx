import React, { useState } from 'react';
import GlobalCalculationCoefficientsEditor from './GlobalCalculationCoefficientsEditor';
import './FinancialDashboard.css';

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
  const [coeffScope, setCoeffScope] = useState('sales');

  return (
    <div className="finance-dashboard">
      <div className="finance-dashboard-main">
        <aside className="finance-sidebar">
          <div className="finance-sidebar-inner">
            <nav className="finance-sidebar-nav">
              <div className="finance-sidebar-section-title">Фінансовий відділ</div>
              <button
                type="button"
                className={`finance-sidebar-tab ${activeTab === 'coefficients' ? 'active' : ''}`}
                onClick={() => setActiveTab('coefficients')}
              >
                <span className="tab-icon">📐</span>
                <span className="tab-label">Коефіцієнти розрахунку</span>
              </button>
            </nav>
          </div>
        </aside>
        <main className="finance-main-content">
          {activeTab === 'coefficients' && (
            <div className="finance-coefficients-wrap">
              <h1 className="finance-coefficients-main-title">Коефіцієнти розрахунку</h1>
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
              <div className="finance-subtab-panel" role="tabpanel">
                <GlobalCalculationCoefficientsEditor
                  key={coeffScope}
                  user={user}
                  scope={coeffScope}
                  description={COEFF_SCOPE_COPY[coeffScope].description}
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
