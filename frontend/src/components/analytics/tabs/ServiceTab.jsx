/**
 * Сервісна служба: обсяг робіт, команда, клієнти, обладнання.
 */
import React from 'react';
import {
  BarList, DataTable, Donut, Grid, Kpi, Panel, TrendChart, colorAt,
} from '../primitives';
import { days, int, money, num, pct } from '../format';
import { useAnalytics } from '../useAnalytics';
import { Section, TabShell } from './TabShell';

const STATUS_COLORS = {
  'Заявка': '#4f8ef7',
  'В роботі': '#f59e0b',
  'Виконано': '#22c55e',
  'Заблоковано': '#ef4444',
};

const PAYMENT_COLORS = ['#4f8ef7', '#22c55e', '#f59e0b', '#a855f7', '#14b8a6'];

export default function ServiceTab({ filters, reloadToken }) {
  const { data, loading, error, reload } = useAnalytics('service', filters, { reloadToken });
  const s = data?.service;
  const kpi = s?.kpi || {};
  const d = s?.deltas || {};

  return (
    <TabShell loading={loading} error={error} reload={reload} meta={data?.meta} skeletonPanels={6}>
      {s && (
        <>
          <div className="an-kpi-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(152px, 1fr))' }}>
            <Kpi label="Заявок" value={kpi.tasks} delta={d.tasks?.changePct} />
            <Kpi label="Виконано" value={kpi.completed} tone="good" delta={d.completed?.changePct} note={pct(kpi.conversionRate)} />
            <Kpi label="У процесі" value={kpi.active} tone="warn" hint="Статуси «Заявка» і «В роботі» серед заявок періоду." />
            <Kpi label="Заблоковано" value={kpi.blocked} tone={kpi.blocked > 0 ? 'bad' : 'muted'} />
            <Kpi
              label="Відмови"
              value={kpi.rejected}
              tone={kpi.rejected > 0 ? 'bad' : 'muted'}
              note={pct(kpi.rejectionRate)}
              hint="Заявки, де склад або бухгалтерія поставили «Відмова»."
            />
            <Kpi label="Дохід" value={kpi.revenue} format="money" tone="good" delta={d.revenue?.changePct} />
            <Kpi label="Середній чек" value={kpi.avgTicket} format="money" delta={d.avgTicket?.changePct} />
            <Kpi
              label="Час виконання"
              value={kpi.avgLeadDays}
              format="days"
              delta={d.avgLeadDays?.changePct}
              deltaInvert
              note={kpi.leadSamples ? `по ${int(kpi.leadSamples)} заявках` : 'немає дат'}
              hint="Заявки без «Авт. виконано» не потрапляють у розрахунок — тому вибірка менша за кількість виконаних."
            />
            <Kpi
              label="Повністю узгоджено"
              value={kpi.approvedFull}
              tone="info"
              note={pct(kpi.closeRate)}
              hint="Підтверджено і складом, і бухгалтерією. Підтвердження може бути записане як «Підтверджено» або як true — враховуються обидва варіанти."
            />
            <Kpi
              label="Максимальний час"
              value={kpi.maxLeadDays}
              format="days"
              tone="muted"
              hint="Найдовша заявка періоду — швидкий спосіб побачити викид у даних."
            />
          </div>

          <Grid min={340}>
            <Panel
              title="Заявки та дохід по місяцях"
              icon="📈"
              span={2}
              hint="Дохід і кількість заявок в одному масштабі часу: видно, коли зростає обсяг, а коли лише ціна."
            >
              <TrendChart
                data={s.monthly}
                bars={[
                  { key: 'revenue', label: 'Дохід', format: 'money', color: '#4f8ef7' },
                  { key: 'margin', label: 'Маржа', format: 'money', color: '#22c55e' },
                ]}
                line={{ key: 'tasks', label: 'Заявок', format: 'int', color: '#f59e0b' }}
                height={215}
              />
            </Panel>

            <Panel title="Розподіл по статусах" icon="🔖">
              <Donut
                items={(s.byStatus || []).map((r) => ({
                  label: r.name,
                  value: r.tasks,
                  color: STATUS_COLORS[r.name],
                }))}
                centerLabel="заявок"
              />
            </Panel>

            <Panel
              title="Види оплати"
              icon="💳"
              hint="Тільки виконані заявки — незакриті заявки ще не мають надходження."
            >
              <Donut
                items={(s.byPaymentType || []).map((r, i) => ({
                  label: r.name,
                  value: r.revenue,
                  color: PAYMENT_COLORS[i % PAYMENT_COLORS.length],
                }))}
                valueFormat="money"
                centerLabel="дохід"
              />
            </Panel>

            <Panel title="Регіони" icon="🌍">
              <BarList
                items={(s.byRegion || []).map((r, i) => ({
                  label: r.name,
                  value: r.revenue,
                  secondary: r.tasks,
                  color: colorAt(i),
                  note: r.avgLeadDays != null ? `сер. час ${num(r.avgLeadDays)} дн` : null,
                }))}
                valueFormat="money"
                secondaryFormat="int"
                limit={8}
              />
            </Panel>

            <Panel title="Компанії-виконавці" icon="🏢">
              <BarList
                items={(s.byCompany || []).map((r, i) => ({
                  label: r.name,
                  value: r.revenue,
                  secondary: r.tasks,
                  color: colorAt(i + 3),
                }))}
                valueFormat="money"
                secondaryFormat="int"
                limit={6}
              />
            </Panel>

            <Panel title="Завантаження по днях тижня" icon="🗓" hint="Допомагає побачити перекоси у плануванні виїздів.">
              <BarList
                items={(s.byWeekday || []).map((r) => ({
                  label: r.name,
                  value: r.tasks,
                  secondary: r.revenue,
                  hideShare: true,
                }))}
                valueFormat="int"
                secondaryFormat="money"
              />
            </Panel>
          </Grid>

          <Section title="Команда">
            <Grid min={430}>
              <Panel
                title="Сервісні інженери"
                icon="👷"
                hint="Заявка з двома інженерами дає кожному по 0.5 заявки і половину доходу — інакше спільні виїзди подвоювали б показники."
              >
                <DataTable
                  columns={[
                    { key: 'name', label: 'Інженер', render: (r) => <span className="an-cell-main">{r.name}</span> },
                    { key: 'participations', label: 'Виїздів', format: 'int', align: 'right' },
                    { key: 'taskShare', label: 'Заявок за вкладом', align: 'right', render: (r) => num(r.taskShare, 1) },
                    { key: 'revenue', label: 'Дохід за вкладом', format: 'money', align: 'right' },
                    { key: 'margin', label: 'Маржа', format: 'money', align: 'right' },
                    { key: 'avgLeadDays', label: 'Сер. час', align: 'right', render: (r) => days(r.avgLeadDays) },
                  ]}
                  rows={s.byEngineer}
                  rowKey="name"
                  limit={12}
                  initialSort={{ key: 'revenue', dir: 'desc' }}
                  emptyText="Інженери не вказані в жодній заявці періоду"
                />
              </Panel>

              <Panel
                title="Робота операторів"
                icon="📞"
                hint="За полем «Автор заявки». Заявки без автора зібрані в окремий рядок — це видно у вкладці «Якість даних»."
              >
                <DataTable
                  columns={[
                    { key: 'name', label: 'Оператор', render: (r) => <span className="an-cell-main">{r.name}</span> },
                    { key: 'tasks', label: 'Заявок', format: 'int', align: 'right' },
                    { key: 'completed', label: 'Виконано', format: 'int', align: 'right' },
                    {
                      key: 'conversionRate',
                      label: 'Конверсія',
                      align: 'right',
                      render: (r) => pct(r.tasks > 0 ? (r.completed / r.tasks) * 100 : 0),
                    },
                    { key: 'uniqueClients', label: 'Клієнтів', format: 'int', align: 'right' },
                    { key: 'revenue', label: 'Дохід', format: 'money', align: 'right' },
                  ]}
                  rows={s.byOperator}
                  rowKey="name"
                  limit={12}
                  initialSort={{ key: 'tasks', dir: 'desc' }}
                />
              </Panel>
            </Grid>
          </Section>

          <Section title="Клієнти, роботи, обладнання">
            <Grid min={340}>
              <Panel title="Топ клієнтів за доходом" icon="🏆">
                <BarList
                  items={(s.byClient || []).map((r, i) => ({
                    label: r.name,
                    value: r.revenue,
                    secondary: r.tasks,
                    color: colorAt(i),
                    note: r.avgTicket ? `чек ${money(r.avgTicket)}` : null,
                  }))}
                  valueFormat="money"
                  secondaryFormat="int"
                  limit={10}
                />
              </Panel>

              <Panel title="Типи робіт" icon="🛠" hint="Сортування за кількістю: видно, що робимо найчастіше, а не лише що найдорожче.">
                <BarList
                  items={(s.byWorkType || []).map((r, i) => ({
                    label: r.name,
                    value: r.tasks,
                    secondary: r.revenue,
                    color: colorAt(i + 2),
                    note: r.avgTicket ? `чек ${money(r.avgTicket)}` : null,
                  }))}
                  valueFormat="int"
                  secondaryFormat="money"
                  limit={10}
                />
              </Panel>

              <Panel title="Обладнання" icon="⚙">
                <BarList
                  items={(s.byEquipment || []).map((r, i) => ({
                    label: r.name,
                    value: r.tasks,
                    secondary: r.revenue,
                    color: colorAt(i + 5),
                  }))}
                  valueFormat="int"
                  secondaryFormat="money"
                  limit={10}
                />
              </Panel>
            </Grid>
          </Section>
        </>
      )}
    </TabShell>
  );
}
