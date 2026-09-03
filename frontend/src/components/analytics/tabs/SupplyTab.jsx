/**
 * Склад і закупівлі: обладнання, закупівлі, ВЕД, переміщення.
 * Ці чотири колекції раніше не потрапляли в аналітику взагалі.
 */
import React from 'react';
import {
  Badge, BarList, DataTable, Donut, Grid, Kpi, Panel, StatList, colorAt,
} from '../primitives';
import { days, int, money, num, pct } from '../format';
import { useAnalytics } from '../useAnalytics';
import { Section, TabShell } from './TabShell';

export default function SupplyTab({ filters, reloadToken }) {
  const { data, loading, error, reload } = useAnalytics('supply', filters, { reloadToken });
  const eq = data?.supply?.equipment;
  const proc = data?.supply?.procurement;
  const ved = data?.supply?.ved;
  const tr = data?.supply?.transfers;

  return (
    <TabShell loading={loading} error={error} reload={reload} meta={data?.meta} skeletonPanels={6}>
      {data?.supply && (
        <>
          <div className="an-kpi-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(158px, 1fr))' }}>
            <Kpi
              label="Вартість складу"
              value={eq?.totals?.value}
              format="money"
              tone="info"
              hint="Ціна × кількість по кожній позиції. Партії з кількістю більше одиниці враховуються повністю."
            />
            <Kpi label="Позицій" value={eq?.totals?.positions} note={`${num(eq?.totals?.units)} од.`} />
            <Kpi label="У наявності" value={eq?.totals?.inStock} tone="good" />
            <Kpi label="Зарезервовано" value={eq?.totals?.reserved} tone="warn" />
            <Kpi label="У дорозі" value={eq?.totals?.inTransit} tone="muted" />
            <Kpi
              label="Без ціни"
              value={eq?.totals?.noPrice}
              tone={eq?.totals?.noPrice > 0 ? 'bad' : 'good'}
              hint="Позиції без ціни не входять у вартість складу — саме тому вона може виглядати заниженою."
            />
            <Kpi label="Заявок на закупівлю" value={proc?.totals?.requests} />
            <Kpi
              label="Закупівлі прострочені"
              value={proc?.totals?.staleOpen}
              tone={proc?.totals?.staleOpen > 0 ? 'bad' : 'good'}
              hint="Відкриті заявки на закупівлю віком понад 14 днів."
            />
          </div>

          <Grid min={340}>
            <Panel title="Склад за статусами" icon="📦">
              <Donut
                items={(eq?.byStatus || []).map((r, i) => ({
                  label: r.label,
                  value: r.positions,
                  color: colorAt(i),
                }))}
                centerLabel="позицій"
              />
            </Panel>

            <Panel title="Розподіл по складах" icon="🏬" hint="Вартість запасів у кожному місці зберігання.">
              <BarList
                items={(eq?.byWarehouse || []).map((r, i) => ({
                  label: r.name,
                  value: r.value,
                  secondary: r.positions,
                  color: colorAt(i + 2),
                }))}
                valueFormat="money"
                secondaryFormat="int"
                limit={10}
                emptyText="Склад порожній"
              />
            </Panel>

            <Panel title="Обладнання та деталі" icon="🔩">
              <BarList
                items={(eq?.byKind || []).map((r, i) => ({
                  label: r.label,
                  value: r.value,
                  secondary: r.positions,
                  color: colorAt(i + 4),
                }))}
                valueFormat="money"
                secondaryFormat="int"
              />
            </Panel>

            <Panel
              title="Резерви, що завершуються"
              icon="⏰"
              span={2}
              tone={(eq?.expiringReservations || []).some((r) => r.expired) ? 'bad' : undefined}
              hint="Резерв із датою завершення в межах двох тижнів. Прострочені резерви блокують обладнання, яке фактично вільне."
            >
              <DataTable
                columns={[
                  { key: 'name', label: 'Позиція', render: (r) => (
                    <span>
                      <span className="an-cell-main">{r.name}</span>
                      {r.serialNumber && <span className="an-cell-sub">№ {r.serialNumber}</span>}
                    </span>
                  ) },
                  { key: 'client', label: 'Клієнт' },
                  { key: 'manager', label: 'Хто зарезервував' },
                  { key: 'warehouse', label: 'Склад' },
                  {
                    key: 'daysLeft',
                    label: 'Залишилось',
                    align: 'right',
                    render: (r) => (
                      <Badge tone={r.expired ? 'bad' : r.daysLeft <= 3 ? 'warn' : 'muted'}>
                        {r.expired ? `прострочено на ${num(Math.abs(r.daysLeft))} дн` : days(r.daysLeft)}
                      </Badge>
                    ),
                  },
                ]}
                rows={eq?.expiringReservations}
                rowKey="id"
                limit={12}
                emptyText="Немає резервів, що завершуються"
              />
            </Panel>
          </Grid>

          {(eq?.testing || []).length > 0 && (
            <Section title="Відділ тестування">
              <Panel title="Тестування обладнання" icon="🧪">
                <DataTable
                  columns={[
                    { key: 'label', label: 'Стан' },
                    { key: 'count', label: 'Позицій', format: 'int', align: 'right' },
                    { key: 'avgDays', label: 'Сер. тривалість', align: 'right', render: (r) => days(r.avgDays) },
                    { key: 'maxOpenDays', label: 'Найдовше в роботі', align: 'right', render: (r) => days(r.maxOpenDays) },
                  ]}
                  rows={eq.testing}
                  rowKey="status"
                />
              </Panel>
            </Section>
          )}

          <Section title="Закупівлі">
            {proc ? (
              <Grid min={340}>
                <Panel title="Показники закупівель" icon="🛒">
                  <StatList
                    items={[
                      { label: 'Заявок за період', value: proc.totals.requests, format: 'int' },
                      { label: 'Позицій у заявках', value: proc.totals.lines, format: 'int' },
                      { label: 'Завершено', value: proc.totals.completed, format: 'int', tone: 'good' },
                      { label: 'Частка завершених', value: proc.totals.completionRate, format: 'pct' },
                      {
                        label: 'Заблоковано',
                        value: proc.totals.blocked,
                        format: 'int',
                        tone: proc.totals.blocked > 0 ? 'bad' : undefined,
                      },
                      {
                        label: 'Отримано частково',
                        value: proc.totals.partial,
                        format: 'int',
                        tone: proc.totals.partial > 0 ? 'warn' : undefined,
                        hint: 'Заявки, де склад прийняв не все замовлене.',
                      },
                      {
                        label: 'Цикл до отримання',
                        value: proc.totals.avgCycleDays,
                        format: 'days',
                        hint: 'Від створення заявки до фактичного приходу на склад.',
                      },
                      { label: 'Робота виконавця', value: proc.totals.avgExecutorDays, format: 'days' },
                    ]}
                  />
                </Panel>

                <Panel title="Статуси закупівель" icon="🔖">
                  <BarList
                    items={(proc.byStatus || []).map((r, i) => ({
                      label: r.label,
                      value: r.count,
                      color: colorAt(i),
                    }))}
                    valueFormat="int"
                  />
                </Panel>

                <Panel title="Пріоритети" icon="🚩">
                  <BarList
                    items={(proc.byPriority || []).map((r, i) => ({
                      label: r.label,
                      value: r.count,
                      color: colorAt(i + 4),
                    }))}
                    valueFormat="int"
                  />
                </Panel>

                <Panel
                  title="Найстаріші відкриті закупівлі"
                  icon="⌛"
                  span={2}
                  tone={proc.totals.staleOpen > 0 ? 'warn' : undefined}
                >
                  <DataTable
                    columns={[
                      { key: 'number', label: '№', render: (r) => <span className="an-cell-main">{r.number || r.id}</span> },
                      { key: 'requester', label: 'Замовник' },
                      { key: 'statusLabel', label: 'Статус' },
                      { key: 'priorityLabel', label: 'Пріоритет' },
                      { key: 'lines', label: 'Позицій', format: 'int', align: 'right' },
                      { key: 'days', label: 'Відкрита', align: 'right', render: (r) => days(r.days) },
                    ]}
                    rows={proc.oldestOpen}
                    rowKey="id"
                    limit={12}
                    initialSort={{ key: 'days', dir: 'desc' }}
                    emptyText="Немає відкритих закупівель"
                  />
                </Panel>

                <Panel title="Хто замовляє" icon="👤">
                  <BarList
                    items={(proc.byRequester || []).map((r, i) => ({
                      label: r.name || '—',
                      value: r.count,
                      secondary: r.lines,
                      color: colorAt(i + 6),
                    }))}
                    valueFormat="int"
                    secondaryFormat="int"
                    limit={10}
                  />
                </Panel>
              </Grid>
            ) : (
              <Panel><p className="an-note">Модуль закупівель у цій системі не підключений.</p></Panel>
            )}
          </Section>

          <Section title="ВЕД та переміщення">
            <Grid min={340}>
              {ved ? (
                <>
                  <Panel title="Імпортні запити ВЕД" icon="🌍">
                    <StatList
                      items={[
                        { label: 'Запитів за період', value: ved.totals.requests, format: 'int' },
                        { label: 'Завершено', value: ved.totals.completed, format: 'int', tone: 'good' },
                        { label: 'Відхилено', value: ved.totals.rejected, format: 'int' },
                        { label: 'Відкриті', value: ved.totals.open, format: 'int', tone: ved.totals.open > 0 ? 'warn' : undefined },
                        {
                          label: 'Пропозицій на запит',
                          value: ved.totals.avgProposals,
                          format: 'num',
                          hint: 'Скільки варіантів від постачальників у середньому збирається на один запит.',
                        },
                        {
                          label: 'Без жодної пропозиції',
                          value: ved.totals.withoutProposals,
                          format: 'int',
                          tone: ved.totals.withoutProposals > 0 ? 'bad' : 'good',
                        },
                        { label: 'Цикл запиту', value: ved.totals.avgCycleDays, format: 'days' },
                        { label: 'Найдовший відкритий', value: ved.totals.maxOpenDays, format: 'days', tone: 'warn' },
                      ]}
                    />
                  </Panel>

                  <Panel title="Статуси ВЕД" icon="🔖">
                    <BarList
                      items={(ved.byStatus || []).map((r, i) => ({
                        label: r.label,
                        value: r.count,
                        color: colorAt(i + 2),
                      }))}
                      valueFormat="int"
                    />
                  </Panel>

                  {(ved.byEquipmentType || []).length > 0 && (
                    <Panel title="Що замовляють" icon="⚙">
                      <BarList
                        items={ved.byEquipmentType.map((r, i) => ({
                          label: r.name || '—',
                          value: r.count,
                          secondary: r.quantity,
                          color: colorAt(i + 5),
                        }))}
                        valueFormat="int"
                        secondaryFormat="int"
                        limit={10}
                      />
                    </Panel>
                  )}
                </>
              ) : (
                <Panel><p className="an-note">Модуль ВЕД у цій системі не підключений.</p></Panel>
              )}

              {tr && (
                <Panel title="Переміщення між складами" icon="🚚">
                  <StatList
                    items={[
                      { label: 'Запитів', value: tr.totals.requests, format: 'int' },
                      { label: 'Погоджено', value: tr.totals.approved, format: 'int', tone: 'good' },
                      { label: 'Відхилено', value: tr.totals.rejected, format: 'int' },
                      {
                        label: 'Очікують рішення',
                        value: tr.totals.pending,
                        format: 'int',
                        tone: tr.totals.pending > 0 ? 'warn' : undefined,
                      },
                      { label: 'Час до рішення', value: tr.totals.avgDecisionDays, format: 'days' },
                    ]}
                  />
                  {(tr.byRoute || []).length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <BarList
                        items={tr.byRoute.map((r, i) => ({
                          label: `${r.from || '?'} → ${r.to || '?'}`,
                          value: r.count,
                          color: colorAt(i + 3),
                        }))}
                        valueFormat="int"
                        limit={8}
                      />
                    </div>
                  )}
                </Panel>
              )}
            </Grid>
          </Section>
        </>
      )}
    </TabShell>
  );
}
