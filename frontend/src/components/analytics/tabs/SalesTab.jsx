/**
 * Відділ продажів: угоди, менеджери, ліди, клієнтська база.
 * Дані, яких в аналітиці не було зовсім — раніше панель бачила тільки заявки сервісу.
 */
import React from 'react';
import {
  Badge, BarList, DataTable, Grid, Kpi, Panel, StatList, TrendChart, colorAt,
} from '../primitives';
import { dateShort, days, int, money, pct } from '../format';
import { useAnalytics } from '../useAnalytics';
import { Section, TabShell } from './TabShell';

export default function SalesTab({ filters, reloadToken }) {
  const { data, loading, error, reload } = useAnalytics('sales', filters, { reloadToken });
  const s = data?.sales;
  const kpi = s?.kpi || {};
  const prev = s?.previous || {};
  const leads = s?.leads || {};

  const change = (cur, before) => (before > 0 ? ((cur - before) / before) * 100 : null);

  return (
    <TabShell loading={loading} error={error} reload={reload} meta={data?.meta} skeletonPanels={6}>
      {s && (
        <>
          <div className="an-kpi-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(158px, 1fr))' }}>
            <Kpi label="Угод у періоді" value={kpi.deals} delta={change(kpi.deals, prev.deals)} />
            <Kpi
              label="Закрито успішно"
              value={kpi.won}
              tone="good"
              delta={change(kpi.won, prev.won)}
              note={pct(kpi.winRate)}
            />
            <Kpi label="Сума успішних" value={kpi.wonAmount} format="money" tone="good" delta={change(kpi.wonAmount, prev.wonAmount)} />
            <Kpi
              label="У воронці"
              value={kpi.openAmount}
              format="money"
              tone="info"
              hint="Сума угод, які ще не закриті ні успішно, ні з втратою."
            />
            <Kpi label="Середня угода" value={kpi.avgDeal} format="money" />
            <Kpi
              label="Отримано коштів"
              value={kpi.paid}
              format="money"
              note={pct(kpi.collectedRate)}
              hint="Частка від суми успішних угод, яка фактично надійшла."
            />
            <Kpi
              label="Премія в черзі"
              value={kpi.premiumPending}
              format="money"
              tone={kpi.premiumPending > 0 ? 'warn' : 'muted'}
              hint="Премія за успішними угодами, яку ще не нарахували менеджерам."
            />
            <Kpi label="Цикл угоди" value={kpi.avgCycleDays} format="days" tone="muted" />
            <Kpi label="Одиниць обладнання" value={kpi.equipmentUnits} tone="muted" />
          </div>

          <Grid min={340}>
            <Panel
              title="Воронка продажів"
              icon="🎯"
              hint="Порядок етапів відповідає життєвому циклу угоди; закриті успішно та втрачені показані окремо."
            >
              <BarList
                items={(s.pipeline || []).map((st) => ({
                  label: st.label,
                  value: st.deals,
                  secondary: st.amount,
                  color: st.isWon ? '#22c55e' : st.isLost ? '#ef4444' : '#4f8ef7',
                  hideShare: true,
                }))}
                valueFormat="int"
                secondaryFormat="money"
                emptyText="Угод за період немає"
              />
            </Panel>

            <Panel title="Динаміка угод" icon="📈" span={2}>
              <TrendChart
                data={s.monthly}
                bars={[
                  { key: 'wonAmount', label: 'Успішні', format: 'money', color: '#22c55e' },
                  { key: 'amount', label: 'Усі угоди', format: 'money', color: '#31415f' },
                ]}
                line={{ key: 'deals', label: 'Кількість', format: 'int', color: '#f59e0b' }}
                height={205}
              />
            </Panel>

            <Panel title="Менеджери" icon="👤" span={2}>
              <DataTable
                columns={[
                  { key: 'login', label: 'Менеджер', render: (r) => <span className="an-cell-main">{r.login}</span> },
                  { key: 'deals', label: 'Угод', format: 'int', align: 'right' },
                  { key: 'won', label: 'Успішних', format: 'int', align: 'right' },
                  {
                    key: 'winRate',
                    label: 'Win rate',
                    align: 'right',
                    render: (r) => (
                      <Badge tone={r.winRate >= 50 ? 'good' : r.winRate >= 25 ? 'warn' : 'bad'}>{pct(r.winRate)}</Badge>
                    ),
                  },
                  { key: 'wonAmount', label: 'Сума успішних', format: 'money', align: 'right' },
                  { key: 'premium', label: 'Премія', format: 'money', align: 'right' },
                  { key: 'avgCycleDays', label: 'Цикл', align: 'right', render: (r) => days(r.avgCycleDays) },
                ]}
                rows={s.byManager}
                rowKey="login"
                limit={12}
                initialSort={{ key: 'wonAmount', dir: 'desc' }}
                emptyText="Менеджери не вказані в угодах періоду"
              />
            </Panel>

            <Panel title="Продажі по регіонах" icon="🌍" hint="Регіон визначається за клієнтом угоди.">
              <BarList
                items={(s.byRegion || []).map((r, i) => ({
                  label: r.name,
                  value: r.wonAmount,
                  secondary: r.won,
                  color: colorAt(i),
                  note: `${int(r.deals)} угод усього`,
                }))}
                valueFormat="money"
                secondaryFormat="int"
                limit={8}
              />
            </Panel>

            <Panel title="Топ клієнтів" icon="🏆">
              <BarList
                items={(s.topClients || []).map((r, i) => ({
                  label: r.name,
                  value: r.amount,
                  secondary: r.deals,
                  color: colorAt(i + 2),
                }))}
                valueFormat="money"
                secondaryFormat="int"
                limit={10}
              />
            </Panel>
          </Grid>

          <Section title="Що потребує уваги">
            <Grid min={430}>
              <Panel
                title="Угоди без руху понад 30 днів"
                icon="🕸"
                tone={(s.stalled || []).length ? 'warn' : undefined}
                hint="Активні угоди, які не оновлювались більше місяця: або їх забули, або їх варто закрити як втрачені."
              >
                <DataTable
                  columns={[
                    { key: 'number', label: '№', render: (r) => <span className="an-cell-main">{r.number}</span> },
                    { key: 'client', label: 'Клієнт' },
                    { key: 'manager', label: 'Менеджер' },
                    { key: 'amount', label: 'Сума', format: 'money', align: 'right' },
                    { key: 'days', label: 'Без руху', align: 'right', render: (r) => days(r.days) },
                  ]}
                  rows={s.stalled}
                  rowKey="id"
                  limit={12}
                  initialSort={{ key: 'days', dir: 'desc' }}
                  emptyText="Усі активні угоди в роботі"
                />
              </Panel>

              <Panel
                title="Премії до нарахування"
                icon="🎁"
                tone={(s.premiumQueue || []).length ? 'warn' : undefined}
              >
                <DataTable
                  columns={[
                    { key: 'number', label: '№', render: (r) => <span className="an-cell-main">{r.number}</span> },
                    { key: 'client', label: 'Клієнт' },
                    { key: 'manager', label: 'Менеджер' },
                    { key: 'saleDate', label: 'Дата', render: (r) => dateShort(r.saleDate) },
                    { key: 'premium', label: 'Премія', format: 'money', align: 'right' },
                  ]}
                  rows={s.premiumQueue}
                  rowKey="id"
                  limit={12}
                  initialSort={{ key: 'premium', dir: 'desc' }}
                  emptyText="Усі премії нараховані"
                />
              </Panel>
            </Grid>
          </Section>

          <Section title="Маркетинг і клієнтська база">
            <Grid min={330}>
              <Panel title="Ліди" icon="📥">
                <StatList
                  items={[
                    { label: 'Усього лідів', value: leads.total, format: 'int' },
                    { label: 'Конвертовано', value: leads.converted, format: 'int', tone: 'good' },
                    { label: 'Конверсія', value: leads.conversionRate, format: 'pct' },
                    { label: 'Відмови', value: leads.rejected, format: 'int' },
                    {
                      label: 'Без менеджера',
                      value: leads.unassigned,
                      format: 'int',
                      tone: leads.unassigned > 0 ? 'bad' : 'good',
                      hint: 'Ліди, яких ніхто не взяв у роботу — вони просто лежать у системі.',
                    },
                    {
                      label: 'Час до призначення',
                      value: leads.avgAssignDays,
                      format: 'days',
                      hint: 'Від появи ліда до моменту, коли його взяв менеджер.',
                    },
                  ]}
                />
              </Panel>

              <Panel title="Джерела лідів" icon="🌐" hint="Поруч із кількістю — конверсія кожного джерела, щоб було видно не тільки обсяг, а і якість.">
                <BarList
                  items={(leads.bySource || []).map((r, i) => ({
                    label: r.label,
                    value: r.count,
                    secondary: r.converted,
                    color: colorAt(i),
                    note: `конверсія ${pct(r.conversionRate)}`,
                  }))}
                  valueFormat="int"
                  secondaryFormat="int"
                  limit={8}
                  emptyText="Лідів за період немає"
                />
              </Panel>

              <Panel title="Статуси лідів" icon="🔖">
                <BarList
                  items={(leads.byStatus || []).map((r, i) => ({
                    label: r.label,
                    value: r.count,
                    color: colorAt(i + 3),
                  }))}
                  valueFormat="int"
                  emptyText="Лідів за період немає"
                />
              </Panel>

              <Panel title="Клієнтська база" icon="🏢">
                <StatList
                  items={[
                    { label: 'Клієнтів усього', value: s.clients?.total, format: 'int' },
                    { label: 'Нових за період', value: s.clients?.newInPeriod, format: 'int', tone: 'good' },
                  ]}
                />
                <div style={{ marginTop: 10 }}>
                  <BarList
                    items={(s.clients?.byRegion || []).map((r, i) => ({
                      label: r.name,
                      value: r.clients,
                      color: colorAt(i + 5),
                    }))}
                    valueFormat="int"
                    limit={8}
                  />
                </div>
              </Panel>

              {(leads.byCampaign || []).length > 0 && (
                <Panel title="Кампанії" icon="📣">
                  <BarList
                    items={leads.byCampaign.map((r, i) => ({
                      label: r.campaign || r.name || 'Без назви',
                      value: r.count,
                      secondary: r.converted,
                      color: colorAt(i + 7),
                      note: `конверсія ${pct(r.conversionRate)}`,
                    }))}
                    valueFormat="int"
                    secondaryFormat="int"
                    limit={8}
                  />
                </Panel>
              )}
            </Grid>
          </Section>
        </>
      )}
    </TabShell>
  );
}
