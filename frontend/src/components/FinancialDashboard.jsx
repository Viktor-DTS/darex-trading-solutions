import React, { useState } from 'react';
import GlobalCalculationCoefficientsEditor from './GlobalCalculationCoefficientsEditor';
import './FinancialDashboard.css';

function FinancialDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('coefficients');

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
            <GlobalCalculationCoefficientsEditor
              user={user}
              title="Коефіцієнти розрахунку"
              description="Глобальні коефіцієнти для подальших фінансових та сервісних розрахунків. Ті самі дані доступні у відділі продажів у вкладці для сервісного відділу."
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default FinancialDashboard;
