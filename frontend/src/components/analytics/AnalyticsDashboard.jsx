/**
 * Аналітика: оболонка.
 *
 * Сама оболонка не рахує нічого. Вона тримає фільтри періоду, перелік вкладок і
 * лениво підгружає код та дані відділу, який реально відкрили. Раніше тут
 * вантажилась уся колекція заявок і всі 11 вкладок рахувались у браузері
 * одночасно — саме через це панель відкривалась десятки секунд.
 */
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBox, Skeleton } from './primitives';
import { clearAnalyticsCache, useAnalyticsOptions } from './useAnalytics';
import './analytics.css';

const OverviewTab = lazy(() => import('./tabs/OverviewTab'));
const ServiceTab = lazy(() => import('./tabs/ServiceTab'));
const ProcessTab = lazy(() => import('./tabs/ProcessTab'));
const FinanceTab = lazy(() => import('./tabs/FinanceTab'));
const SalesTab = lazy(() => import('./tabs/SalesTab'));
const SupplyTab = lazy(() => import('./tabs/SupplyTab'));
const InsightsTab = lazy(() => import('./tabs/InsightsTab'));
const QualityTab = lazy(() => import('./tabs/QualityTab'));

const TABS = [
  { id: 'overview', label: 'Огляд', icon: '◫', Component: OverviewTab },
  { id: 'service', label: 'Сервіс', icon: '🔧', Component: ServiceTab },
  { id: 'process', label: 'Черги', icon: '🔄', Component: ProcessTab },
  { id: 'finance', label: 'Бухгалтерія', icon: '💰', Component: FinanceTab },
  { id: 'sales', label: 'Продажі', icon: '🤝', Component: SalesTab },
  { id: 'supply', label: 'Склад / ЗЕД', icon: '📦', Component: SupplyTab },
  { id: 'insights', label: 'Рекомендації', icon: '💡', Component: InsightsTab },
  { id: 'quality', label: 'Якість даних', icon: '🧾', Component: QualityTab },
];

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const CURRENT_QUARTER = Math.floor((CURRENT_MONTH - 1) / 3) + 1;

const PERIODS = [
  { id: 'year', label: 'Рік' },
  { id: 'quarter', label: 'Квартал' },
  { id: 'month', label: 'Місяць' },
];

export default function AnalyticsDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [reloadToken, setReloadToken] = useState(0);
  const [reloading, setReloading] = useState(false);
  const [drill, setDrill] = useState(null);

  const [filters, setFilters] = useState({
    year: CURRENT_YEAR,
    period: 'year',
    month: CURRENT_MONTH,
    quarter: CURRENT_QUARTER,
    region: '',
    company: '',
    basis: 'request',
  });

  const { options, error: optionsError } = useAnalyticsOptions();

  // Регіональний користувач бачить лише свій регіон — сервер це й так нав'язує,
  // але показувати йому вибір регіонів немає сенсу.
  const canChooseRegion = !user?.region || user.region === 'Україна';

  const years = useMemo(() => {
    const list = (options?.years || []).map((y) => y.year).filter((y) => y >= 2015 && y <= CURRENT_YEAR + 1);
    return list.includes(CURRENT_YEAR) ? list : [CURRENT_YEAR, ...list];
  }, [options]);

  const setFilter = useCallback((patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const refresh = useCallback(() => {
    clearAnalyticsCache();
    setReloading(true);
    setReloadToken((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!reloading) return undefined;
    const timer = setTimeout(() => setReloading(false), 1200);
    return () => clearTimeout(timer);
  }, [reloading]);

  /** Переходи з рекомендацій та зведення: «показати, звідки ця цифра». */
  const navigate = useCallback((link) => {
    if (!link) return;
    if (link.tab && TABS.some((t) => t.id === link.tab)) setActiveTab(link.tab);
    setDrill(link.stage || link.focus ? link : null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const active = TABS.find((t) => t.id === activeTab) || TABS[0];
  const ActiveComponent = active.Component;

  return (
    <div className="an">
      {/* Шапка і вкладки — один липкий блок: інакше, прокрутивши довгу вкладку,
          користувач мусив би повертатись нагору, щоб перейти на іншу. */}
      <div className="an-head">
        <Filters
          filters={filters}
          setFilter={setFilter}
          options={options}
          years={years}
          canChooseRegion={canChooseRegion}
          userRegion={user?.region}
          onRefresh={refresh}
          reloading={reloading}
        />

        <nav className="an-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`an-tab ${tab.id === activeTab ? 'is-active' : ''}`}
              onClick={() => { setActiveTab(tab.id); setDrill(null); }}
            >
              <span aria-hidden="true">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {optionsError && <ErrorBox message={`Довідники фільтрів: ${optionsError}`} />}

      <Suspense fallback={<TabFallback />}>
        <ActiveComponent
          filters={filters}
          reloadToken={reloadToken}
          user={user}
          navigate={navigate}
          drill={drill}
        />
      </Suspense>
    </div>
  );
}

function Filters({
  filters, setFilter, options, years, canChooseRegion, userRegion, onRefresh, reloading,
}) {
  return (
    <div className="an-top">
      <div className="an-top__title">
        <h2>Аналітика</h2>
        <span className="an-top__ctx">
          {options
            ? `${filters.year} · ${filters.region || (canChooseRegion ? 'усі регіони' : userRegion)}`
            : 'завантаження…'}
        </span>
      </div>

      <div className="an-filters">
        <select
          className="an-select"
          value={filters.period}
          onChange={(e) => setFilter({ period: e.target.value })}
          aria-label="Тип періоду"
        >
          {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>

        <select
          className="an-select"
          value={filters.year}
          onChange={(e) => setFilter({ year: Number(e.target.value) })}
          aria-label="Рік"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        {filters.period === 'month' && (
          <select
            className="an-select"
            value={filters.month}
            onChange={(e) => setFilter({ month: Number(e.target.value) })}
            aria-label="Місяць"
          >
            {(options?.months || []).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        )}

        {filters.period === 'quarter' && (
          <select
            className="an-select"
            value={filters.quarter}
            onChange={(e) => setFilter({ quarter: Number(e.target.value) })}
            aria-label="Квартал"
          >
            {(options?.quarters || []).map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
          </select>
        )}

        {canChooseRegion && (
          <select
            className="an-select"
            value={filters.region}
            onChange={(e) => setFilter({ region: e.target.value })}
            aria-label="Регіон"
          >
            <option value="">Усі регіони</option>
            {(options?.regions || []).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}

        <select
          className="an-select"
          value={filters.company}
          onChange={(e) => setFilter({ company: e.target.value })}
          aria-label="Компанія-виконавець"
        >
          <option value="">Усі компанії</option>
          {(options?.companies || []).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>

        {/* Дата заявки чи дата робіт — від цього залежить, у який місяць впаде заявка. */}
        <div className="an-toggle" role="group" aria-label="База дати">
          <button
            type="button"
            className={filters.basis === 'request' ? 'is-on' : ''}
            onClick={() => setFilter({ basis: 'request' })}
            title="Заявка враховується в місяці, коли її створили"
          >
            За заявкою
          </button>
          <button
            type="button"
            className={filters.basis === 'work' ? 'is-on' : ''}
            onClick={() => setFilter({ basis: 'work' })}
            title="Заявка враховується в місяці, коли виконувались роботи"
          >
            За роботами
          </button>
        </div>

        <button type="button" className="an-btn an-btn--primary" onClick={onRefresh} disabled={reloading}>
          {reloading ? 'Оновлення…' : 'Оновити'}
        </button>
      </div>
    </div>
  );
}

function TabFallback() {
  return (
    <div className="an-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="an-panel"><div className="an-panel__body"><Skeleton rows={4} /></div></div>
      ))}
    </div>
  );
}
