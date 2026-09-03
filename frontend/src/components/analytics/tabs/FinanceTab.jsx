/**
 * Бухгалтерія та фінанси.
 *
 * Тут вперше зведена реальна юніт-економіка: раніше «витратами» вважались лише
 * матеріали, тому транспорт, добові, проживання і премія інженерам не впливали
 * на маржу взагалі — і маржа виглядала завищеною.
 */
import React from 'react';
import {
  Badge, BarList, DataTable, Donut, Grid, Kpi, Panel, StatList, TrendChart, colorAt,
} from '../primitives';
import { days, int, money, moneyFull, num, pct } from '../format';
import { useAnalytics } from '../useAnalytics';
import { Section, TabShell } from './TabShell';

const AGING_TONE = { d0_30: '#22c55e', d31_60: '#f59e0b', d61_90: '#f97316', d90_plus: '#ef4444' };

export default function FinanceTab({ filters, reloadToken }) {
  const { data, loading, error, reload } = useAnalytics('finance', filters, { reloadToken });
  const f = data?.finance;
  const cost = f?.costSummary || {};
  const rec = f?.receivables || {};
  const sla = f?.approvalSla || {};

  return (
    <TabShell loading={loading} error={error} reload={reload} meta={data?.meta} skeletonPanels={6}>
      {f && (
        <>
          <div className="an-kpi-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(158px, 1fr))' }}>
            <Kpi label="Дохід" value={f.revenue} format="money" tone="good" />
            <Kpi
              label="Собівартість"
              value={cost.total}
              format="money"
              tone="warn"
              note={`матеріали ${money(cost.materials)}`}
              hint="Матеріали плюс супутні витрати: транспорт, добові, проживання, інші витрати, премія інженерам."
            />
            <Kpi
              label="Маржа"
              value={cost.margin}
              format="money"
              tone={cost.margin >= 0 ? 'info' : 'bad'}
              note={pct(cost.marginRate)}
            />
            <Kpi
              label="Дебіторка"
              value={rec.total?.amount}
              format="money"
              tone={rec.total?.amount > 0 ? 'bad' : 'good'}
              note={`${int(rec.total?.count)} заявок`}
              hint="Виконані заявки з сумою, де не заповнена дата оплати. Стан на сьогодні, без фільтра періоду."
            />
            <Kpi
              label="Найстаріший борг"
              value={rec.total?.maxAgeDays}
              format="days"
              tone={rec.total?.maxAgeDays > 90 ? 'bad' : 'muted'}
              note={rec.total?.avgAgeDays != null ? `сер. ${num(rec.total.avgAgeDays)} дн` : null}
            />
            <Kpi
              label="Збиткові заявки"
              value={f.losses?.tasks}
              tone={f.losses?.tasks > 0 ? 'bad' : 'good'}
              note={f.losses?.margin ? money(f.losses.margin) : null}
              hint="Виконані заявки, де сума послуги вказана, але матеріали й витрати її перевищили."
            />
            <Kpi
              label="Виконано без суми"
              value={f.unbilled?.tasks}
              tone={f.unbilled?.tasks > 0 ? 'warn' : 'good'}
              note={f.unbilled?.withCost ? `${int(f.unbilled.withCost)} з витратами` : null}
              hint="Заявка закрита, а поле суми послуги порожнє. Це не збиток, а незаповнені дані — але дохід періоду через це занижений."
            />
            <Kpi
              label="Рахунки в черзі"
              value={f.invoices?.open}
              tone={f.invoices?.staleOpen > 0 ? 'warn' : 'muted'}
              note={f.invoices?.staleOpen ? `${int(f.invoices.staleOpen)} прострочено` : null}
            />
            <Kpi
              label="Оборот рахунку"
              value={f.invoices?.avgTurnaroundDays}
              format="days"
              tone="muted"
              hint="Від створення запиту на рахунок до завантаження файлу."
            />
          </div>

          <Grid min={340}>
            <Panel
              title="Надходження по місяцях"
              icon="💵"
              span={2}
              hint="Дохід розділений на оплачений і неоплачений: висота стовпчика — виставлено, зелена частина — фактично отримано."
            >
              <TrendChart
                data={f.cashflow}
                bars={[
                  { key: 'paid', label: 'Оплачено', format: 'money', color: '#22c55e' },
                  { key: 'unpaid', label: 'Не оплачено', format: 'money', color: '#ef4444' },
                ]}
                line={{ key: 'margin', label: 'Маржа', format: 'money', color: '#4f8ef7' }}
                height={210}
              />
            </Panel>

            <Panel
              title="Структура собівартості"
              icon="🧮"
              hint="Кожен рядок — окреме поле заявки. Показані лише ті, де є суми."
            >
              <BarList
                items={(f.costStructure || []).map((c) => ({
                  label: c.label,
                  value: c.amount,
                  color: c.group === 'materials' ? '#f59e0b' : '#a855f7',
                  badge: c.group === 'materials' ? 'матеріали' : 'витрати',
                  badgeTone: c.group === 'materials' ? 'warn' : 'accent',
                  note: `${pct(c.share)} доходу`,
                  hideShare: true,
                }))}
                valueFormat="money"
                limit={10}
                emptyText="Витрати не заповнені жодного разу"
              />
            </Panel>

            <Panel
              title="Дебіторка за строком"
              icon="📅"
              tone={rec.buckets?.some((b) => b.id === 'd90_plus' && b.count > 0) ? 'bad' : undefined}
              hint="Вік боргу рахується від дати виконання заявки."
            >
              <Donut
                items={(rec.buckets || []).map((b) => ({
                  label: b.label,
                  value: b.amount,
                  color: AGING_TONE[b.id],
                }))}
                valueFormat="money"
                centerLabel="боргу"
              />
              {rec.total?.approvedAmount > 0 && (
                <p className="an-note">
                  З цієї суми {money(rec.total.approvedAmount)} уже підтверджено складом і бухгалтерією —
                  тобто заявки готові до оплати і чекають лише грошей.
                </p>
              )}
            </Panel>

            <Panel title="Маржа по регіонах" icon="🌍">
              <BarList
                items={(f.marginByRegion || []).map((r, i) => ({
                  label: r.name,
                  value: r.margin,
                  secondary: r.marginRate,
                  color: r.margin >= 0 ? colorAt(i) : '#ef4444',
                  note: `дохід ${money(r.revenue)} · ${int(r.tasks)} заявок`,
                  hideShare: true,
                }))}
                valueFormat="money"
                secondaryFormat="pct"
                limit={8}
              />
            </Panel>

            <Panel
              title="Маржа по типах робіт"
              icon="🛠"
              hint="Показані лише типи робіт із трьома і більше заявками — на меншій вибірці маржинальність нічого не означає."
            >
              <DataTable
                columns={[
                  { key: 'name', label: 'Тип робіт', render: (r) => <span className="an-cell-main">{r.name}</span> },
                  { key: 'tasks', label: 'Заявок', format: 'int', align: 'right' },
                  { key: 'avgTicket', label: 'Сер. чек', format: 'money', align: 'right' },
                  { key: 'margin', label: 'Маржа', format: 'money', align: 'right' },
                  {
                    key: 'marginRate',
                    label: '%',
                    align: 'right',
                    render: (r) => (
                      <Badge tone={r.marginRate >= 30 ? 'good' : r.marginRate >= 10 ? 'warn' : 'bad'}>
                        {pct(r.marginRate)}
                      </Badge>
                    ),
                  },
                ]}
                rows={f.marginByWorkType}
                rowKey="name"
                limit={10}
                initialSort={{ key: 'margin', dir: 'desc' }}
              />
            </Panel>

            <Panel
              title="Швидкість узгоджень"
              icon="✍"
              hint="Норматив — 7 днів на кожне узгодження і 30 днів до оплати."
            >
              <StatList
                items={[
                  {
                    label: 'Виконано → склад підтвердив',
                    value: sla.warehouse?.avgDays,
                    format: 'days',
                    tone: sla.warehouse?.avgDays > 7 ? 'bad' : 'good',
                    hint: `${int(sla.warehouse?.samples)} заявок, з них ${int(sla.warehouse?.overSla)} понад норматив`,
                  },
                  {
                    label: 'Склад → бухгалтерія затвердила',
                    value: sla.accountant?.avgDays,
                    format: 'days',
                    tone: sla.accountant?.avgDays > 7 ? 'bad' : 'good',
                    hint: `${int(sla.accountant?.samples)} заявок, з них ${int(sla.accountant?.overSla)} понад норматив`,
                  },
                  {
                    label: 'Виконано → оплачено',
                    value: sla.cash?.avgDays,
                    format: 'days',
                    tone: sla.cash?.avgDays > 30 ? 'warn' : 'good',
                    hint: `${int(sla.cash?.samples)} оплачених заявок`,
                  },
                  {
                    label: 'Максимум очікування складу',
                    value: sla.warehouse?.maxDays,
                    format: 'days',
                    tone: 'warn',
                  },
                  {
                    label: 'Затверджено регіональним керівником',
                    value: sla.regionalApproved,
                    format: 'int',
                  },
                ]}
              />
            </Panel>
          </Grid>

          <Section title="Борги та проблемні заявки">
            <Grid min={430}>
              <Panel title="Найбільші боржники" icon="🧾" tone={rec.topDebtors?.length ? 'warn' : undefined}>
                <BarList
                  items={(rec.topDebtors || []).map((r) => ({
                    label: r.name,
                    value: r.amount,
                    secondary: r.tasks,
                    color: r.oldestDays > 90 ? '#ef4444' : r.oldestDays > 60 ? '#f97316' : '#f59e0b',
                    note: r.oldestDays != null ? `найстаріший борг ${num(r.oldestDays)} дн` : null,
                    hideShare: true,
                  }))}
                  valueFormat="money"
                  secondaryFormat="int"
                  limit={10}
                  emptyText="Немає неоплачених виконаних заявок"
                />
              </Panel>

              <Panel
                title="Найстаріші неоплачені заявки"
                icon="⌛"
                hint="Позначка «готова» означає, що заявка вже пройшла всі узгодження — питання лише в оплаті."
              >
                <DataTable
                  columns={[
                    { key: 'number', label: '№', render: (r) => <span className="an-cell-main">{r.number}</span> },
                    {
                      key: 'client',
                      label: 'Клієнт',
                      render: (r) => (
                        <span>
                          <span className="an-cell-main">{r.client}</span>
                          <span className="an-cell-sub">{r.region} · {r.paymentType}</span>
                        </span>
                      ),
                    },
                    { key: 'days', label: 'Днів', align: 'right', render: (r) => days(r.days) },
                    { key: 'amount', label: 'Сума', format: 'money', align: 'right' },
                    {
                      key: 'approved',
                      label: 'Стан',
                      render: (r) => <Badge tone={r.approved ? 'good' : 'muted'}>{r.approved ? 'готова' : 'узгоджується'}</Badge>,
                    },
                  ]}
                  rows={rec.oldest}
                  rowKey="id"
                  limit={15}
                  initialSort={{ key: 'days', dir: 'desc' }}
                  emptyText="Дебіторки немає"
                />
              </Panel>

              <Panel
                title="Заявки зі збитком"
                icon="⚠"
                tone={f.losses?.tasks ? 'bad' : undefined}
                full
                hint="Сума послуги вказана, але матеріали й витрати її перевищили. Заявки з порожньою сумою тут не показані — вони в панелі нижче."
              >
                <DataTable
                  columns={[
                    { key: 'number', label: '№', render: (r) => <span className="an-cell-main">{r.number}</span> },
                    { key: 'client', label: 'Клієнт' },
                    { key: 'region', label: 'Регіон' },
                    { key: 'work', label: 'Роботи' },
                    { key: 'revenue', label: 'Дохід', align: 'right', render: (r) => moneyFull(r.revenue) },
                    { key: 'materials', label: 'Матеріали', format: 'money', align: 'right' },
                    { key: 'expenses', label: 'Витрати', format: 'money', align: 'right' },
                    {
                      key: 'margin',
                      label: 'Результат',
                      align: 'right',
                      render: (r) => <span style={{ color: '#fca5a5', fontWeight: 650 }}>{moneyFull(r.margin)}</span>,
                    },
                  ]}
                  rows={f.losses?.list}
                  rowKey="id"
                  limit={12}
                  initialSort={{ key: 'margin', dir: 'asc' }}
                  emptyText="Збиткових заявок немає"
                />
              </Panel>

              {/* Окремо від збитків: тут проблема не в ціні, а в незаповненому полі. */}
              <Panel
                title="Виконано без суми послуги"
                icon="🧮"
                tone={f.unbilled?.tasks ? 'warn' : undefined}
                full
                hint="Заявка закрита, а сума послуги порожня. Витрати по ній уже враховані в собівартості, тому маржа періоду занижена."
                actions={f.unbilled?.cost
                  ? <span className="an-panel__note">витрат без доходу: {money(f.unbilled.cost)}</span>
                  : null}
              >
                <DataTable
                  columns={[
                    { key: 'number', label: '№', render: (r) => <span className="an-cell-main">{r.number}</span> },
                    { key: 'client', label: 'Клієнт' },
                    { key: 'region', label: 'Регіон' },
                    { key: 'work', label: 'Роботи' },
                    { key: 'materials', label: 'Матеріали', format: 'money', align: 'right' },
                    { key: 'expenses', label: 'Витрати', format: 'money', align: 'right' },
                    {
                      key: 'cost',
                      label: 'Разом витрат',
                      align: 'right',
                      render: (r) => <span style={{ fontWeight: 650 }}>{moneyFull(r.cost)}</span>,
                    },
                  ]}
                  rows={f.unbilled?.list}
                  rowKey="id"
                  limit={12}
                  initialSort={{ key: 'cost', dir: 'desc' }}
                  emptyText="Усі виконані заявки мають суму"
                />
              </Panel>
            </Grid>
          </Section>

          <Section title="Запити на рахунки та акти">
            <Grid min={340}>
              <Panel title="Статуси запитів" icon="📄">
                <BarList
                  items={(f.invoices?.byStatus || []).map((r, i) => ({
                    label: r.label,
                    value: r.count,
                    color: colorAt(i),
                  }))}
                  valueFormat="int"
                  emptyText="Запитів на рахунки за період немає"
                />
              </Panel>

              <Panel title="Показники обробки" icon="⏳">
                <StatList
                  items={[
                    { label: 'Усього запитів', value: f.invoices?.total, format: 'int' },
                    { label: 'Відкриті', value: f.invoices?.open, format: 'int', tone: f.invoices?.open > 0 ? 'warn' : undefined },
                    {
                      label: 'Відкриті понад 7 днів',
                      value: f.invoices?.staleOpen,
                      format: 'int',
                      tone: f.invoices?.staleOpen > 0 ? 'bad' : 'good',
                    },
                    { label: 'Потрібен рахунок', value: f.invoices?.needInvoice, format: 'int' },
                    { label: 'Потрібен акт', value: f.invoices?.needAct, format: 'int' },
                    { label: 'Найдовший відкритий', value: f.invoices?.maxOpenAgeDays, format: 'days', tone: 'warn' },
                  ]}
                />
              </Panel>

              <Panel title="Позначки боргу в заявках" icon="🏷" hint="Поле «Статус боргу» заповнюється вручну, тому тут видно і те, наскільки ним взагалі користуються.">
                <BarList
                  items={(f.debtStatus || []).map((r, i) => ({
                    label: r.name,
                    value: r.tasks,
                    secondary: r.amount,
                    color: colorAt(i + 4),
                  }))}
                  valueFormat="int"
                  secondaryFormat="money"
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
