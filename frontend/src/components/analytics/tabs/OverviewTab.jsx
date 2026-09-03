/**
 * Огляд: одна екранна сторінка на весь бізнес.
 *
 * Логіка вкладки: спершу оцінка стану і найгостріші проблеми, потім по одній
 * картці на відділ (щоб зрозуміти, куди йти далі), і лише потім динаміка.
 */
import React from 'react';
import {
  BarList, Donut, Grid, Kpi, Panel, TrendChart, colorAt,
} from '../primitives';
import { formatBy, int, money, pct } from '../format';
import { useAnalytics } from '../useAnalytics';
import { Section, TabShell } from './TabShell';

const SEVERITY_ICON = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' };

const STATUS_COLORS = {
  'Заявка': '#4f8ef7',
  'В роботі': '#f59e0b',
  'Виконано': '#22c55e',
  'Заблоковано': '#ef4444',
};

export default function OverviewTab({ filters, reloadToken, navigate }) {
  const { data, loading, error, reload } = useAnalytics('overview', filters, { reloadToken });
  const overview = data?.overview;
  const insights = data?.insights;
  const head = overview?.headline || {};
  const deltas = head.deltas || {};

  return (
    <TabShell loading={loading} error={error} reload={reload} meta={data?.meta} skeletonPanels={6}>
      {overview && (
        <>
          <div className="an-kpi-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <Kpi
              label="Заявок у періоді"
              value={head.tasks}
              format="int"
              delta={deltas.tasks?.changePct}
              note={`виконано ${int(head.completed)}`}
            />
            <Kpi
              label="Дохід"
              value={head.revenue}
              format="money"
              tone="good"
              delta={deltas.revenue?.changePct}
              hint="Сума «Загальна сума послуги» лише по виконаних заявках. Текстові суми («12 524,40») розбираються коректно."
            />
            <Kpi
              label="Маржа"
              value={head.margin}
              format="money"
              tone="info"
              delta={deltas.margin?.changePct}
              note={pct(head.marginRate)}
              hint="Дохід мінус матеріали і супутні витрати: транспорт, добові, проживання, премія інженерам."
            />
            <Kpi
              label="Середній чек"
              value={head.avgTicket}
              format="money"
              delta={deltas.avgTicket?.changePct}
              hint="Дохід виконаних / кількість виконаних. Заявки без суми занижують чек — їх видно у «Якість даних»."
            />
            <Kpi
              label="Конверсія"
              value={head.conversionRate}
              format="pct"
              delta={deltas.conversionRate?.changePct}
              hint="Частка заявок періоду зі статусом «Виконано». Для поточного року незакриті заявки знижують конверсію — це когорта, а не «успішність історичних»."
            />
            <Kpi
              label="Час виконання"
              value={head.avgLeadDays}
              format="days"
              delta={deltas.avgLeadDays?.changePct}
              deltaInvert
              hint="Від створення до «виконано». Рахується лише там, де обидві дати заповнені."
            />
            <Kpi
              label="Узгоджено"
              value={head.approvedFull}
              format="int"
              tone="info"
              hint="Виконані заявки, підтверджені і складом, і бухгалтерією."
            />
            {head.runRateRevenue != null && (
              <Kpi
                label="Прогноз доходу"
                value={head.runRateRevenue}
                format="money"
                tone="muted"
                note="за темпом періоду"
                hint="Екстраполяція фактичного темпу на весь період. Показується, лише коли період ще не завершився."
              />
            )}
          </div>

          {(overview.queues || []).length > 0 && (
            <div className="an-queues" role="list">
              {overview.queues.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  className={`an-queue ${q.stuck > 0 ? 'is-stuck' : ''}`}
                  onClick={() => navigate({ tab: q.tab, stage: q.stage })}
                  role="listitem"
                >
                  <span className="an-queue__dot" style={{ background: q.color }} aria-hidden="true" />
                  <span className="an-queue__label">{q.icon} {q.label}</span>
                  <b>{int(q.count)}</b>
                  {q.stuck > 0 && <em>зависло {int(q.stuck)}</em>}
                </button>
              ))}
            </div>
          )}

          {insights && <HealthPanel insights={insights} navigate={navigate} />}

          <Section title="Відділи">
            <Grid min={252}>
              {(overview.departments || []).map((dept) => (
                <DeptCard key={dept.id} dept={dept} onOpen={() => navigate({ tab: dept.tab })} />
              ))}
            </Grid>
          </Section>

          <Section title="Динаміка та розподіл">
            <Grid min={340}>
              <Panel
                title="Дохід по місяцях"
                icon="📈"
                span={2}
                hint="Стовпчики — вибраний період, пунктир — той самий місяць попереднього року."
              >
                <TrendChart
                  data={mergePrevious(overview.monthly, overview.monthlyPrevious)}
                  bars={[{ key: 'revenue', label: 'Дохід', format: 'money', color: '#4f8ef7' }]}
                  line={{ key: 'prevRevenue', label: 'Минулий рік', format: 'money', color: '#94a3b8' }}
                  height={210}
                />
              </Panel>

              <Panel title="Статуси заявок" icon="🔖">
                <Donut
                  items={(overview.byStatus || []).map((s) => ({
                    label: s.name,
                    value: s.tasks,
                    color: STATUS_COLORS[s.name],
                  }))}
                  centerLabel="заявок"
                />
              </Panel>

              <Panel
                title="Види оплати"
                icon="💳"
                hint="Сума виконаних заявок. Центр — гривні, не кількість: раніше тут помилково ставили «грн» на кількість заявок."
              >
                <Donut
                  items={(overview.byPaymentType || []).map((s, i) => ({
                    label: s.name,
                    value: s.revenue,
                    color: colorAt(i + 3),
                  }))}
                  valueFormat="money"
                  centerLabel="дохід"
                />
              </Panel>

              <Panel title="Регіони" icon="🌍" hint="Дохід виконаних заявок; у дужках — кількість заявок.">
                <BarList
                  items={(overview.byRegion || []).map((r, i) => ({
                    label: r.name,
                    value: r.revenue,
                    secondary: r.tasks,
                    color: colorAt(i),
                    note: r.avgLeadDays != null ? `сер. ${r.avgLeadDays} дн` : null,
                  }))}
                  valueFormat="money"
                  secondaryFormat="int"
                  limit={8}
                />
              </Panel>
            </Grid>
          </Section>
        </>
      )}
    </TabShell>
  );
}

/** Об'єднує дві серії в один набір рядків для графіка. */
function mergePrevious(current, previous) {
  const prev = new Map((previous || []).map((r) => [r.month, r]));
  return (current || []).map((row) => ({
    ...row,
    prevRevenue: prev.get(row.month)?.revenue || 0,
  }));
}

function HealthPanel({ insights, navigate }) {
  const score = insights.healthScore ?? 0;
  const tone = score >= 80 ? 'good' : score >= 55 ? 'warn' : 'bad';
  const color = tone === 'good' ? '#22c55e' : tone === 'warn' ? '#f59e0b' : '#ef4444';
  const sev = insights.summary?.bySeverity || {};

  return (
    <Panel
      title={insights.briefing?.headline || 'Стан системи'}
      icon="🩺"
      hint="100 балів мінус штрафи за знайдені проблеми, з поправкою на впевненість кожного висновку."
      actions={
        <button type="button" className="an-btn an-btn--sm" onClick={() => navigate({ tab: 'insights' })}>
          Усі рекомендації
        </button>
      }
      tone={tone}
    >
      <div className="an-health">
        <div className="an-health__score">
          <Gauge value={score} color={color} />
          <div className="an-health__num">
            <b style={{ color }}>{score}</b>
            <small>зі 100</small>
          </div>
        </div>

        <div className="an-health__body">
          <p className="an-health__summary">
            {insights.briefing?.text
              || (insights.summary?.total
                ? `Знайдено ${insights.summary.total} ${plural(insights.summary.total)}: критичних — ${sev.critical || 0}, високої важливості — ${sev.high || 0}.`
                : 'Правила не знайшли проблем у вибраному періоді.')}
            {insights.summary?.moneyAtStake > 0 && ` Під питанням ${money(insights.summary.moneyAtStake)}.`}
          </p>

          <div className="an-health__depts">
            {(insights.departments || []).filter((d) => d.count > 0).map((d) => (
              <button
                key={d.id}
                type="button"
                className={`an-health__dept an-health__dept--${d.count >= 4 ? 'bad' : d.count >= 2 ? 'warn' : 'good'}`}
                onClick={() => navigate({ tab: 'insights', focus: d.id })}
              >
                <span aria-hidden="true">{d.icon}</span>
                {d.label}
                <b>{d.count}</b>
              </button>
            ))}
          </div>
        </div>
      </div>

      {(insights.todayActions || insights.top || []).length > 0 && (
        <div className="an-top-recs">
          {(insights.todayActions?.length ? insights.todayActions : insights.top).slice(0, 4).map((r) => (
            <button
              key={r.recId || r.id}
              type="button"
              className={`an-top-rec an-top-rec--${r.severity}`}
              onClick={() => navigate(r.link ? { ...r.link, tab: r.link.tab || 'insights' } : { tab: 'insights' })}
            >
              <span aria-hidden="true">{SEVERITY_ICON[r.severity]}</span>
              <span className="an-top-rec__title">{r.text || r.title}</span>
              {r.owner && <span className="an-top-rec__owner">{r.owner}</span>}
              {r.impact?.type === 'money' && r.impact.value > 0 && (
                <span className="an-top-rec__impact">{money(r.impact.value)}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

function plural(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'проблема';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'проблеми';
  return 'проблем';
}

function Gauge({ value, color, size = 92 }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2b3a5c" strokeWidth="9" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
        />
      </g>
    </svg>
  );
}

function DeptCard({ dept, onOpen }) {
  return (
    <button type="button" className="an-dept" onClick={onOpen}>
      <div className="an-dept__head">
        <span className="an-dept__icon" aria-hidden="true">{dept.icon}</span>
        <span className="an-dept__name">{dept.label}</span>
        <span className="an-dept__go" aria-hidden="true">›</span>
      </div>

      <div className="an-dept__primary">
        <b>{formatBy(dept.primary.format, dept.primary.value)}</b>
        <span>{dept.primary.label}</span>
      </div>

      <div className="an-dept__metrics">
        {(dept.metrics || []).map((m) => (
          <div className="an-dept__metric" key={m.label}>
            <span>{m.label}</span>
            <b className={m.danger ? 'is-danger' : ''}>{formatBy(m.format, m.value)}</b>
          </div>
        ))}
      </div>

      {dept.alert && <div className="an-dept__alert">⚠ {dept.alert}</div>}
    </button>
  );
}
