/**
 * Процеси та узгодження.
 *
 * Ключова відмінність від старої воронки: тут розділені два питання.
 * «Скільки заявок періоду дійшло до закриття» — це історія вибраного періоду.
 * «Що зависло» — це завжди стан на сьогодні, і фільтр року до нього не застосовується,
 * інакше при виборі минулого року панель показувала б, що черги порожні.
 */
import React, { useEffect, useState } from 'react';
import { Badge, DataTable, Grid, Kpi, Panel, StatList } from '../primitives';
import { days, int, money, num, pct } from '../format';
import { useAnalytics } from '../useAnalytics';
import { Section, TabShell } from './TabShell';

export default function ProcessTab({ filters, reloadToken, drill }) {
  const { data, loading, error, reload } = useAnalytics('process', filters, { reloadToken });
  const p = data?.process;
  const [openStage, setOpenStage] = useState(null);

  useEffect(() => {
    if (drill?.stage) setOpenStage(drill.stage);
  }, [drill]);

  const live = p?.live || {};
  const cohort = p?.cohort || {};
  const th = p?.thresholds || {};

  return (
    <TabShell loading={loading} error={error} reload={reload} meta={data?.meta} skeletonPanels={5}>
      {p && (
        <>
          <div className="an-kpi-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(158px, 1fr))' }}>
            <Kpi
              label="У чергах зараз"
              value={live.active}
              hint="Стан на цю мить, без фільтра періоду: заявки в оператора, сервісу, складу і бухгалтерії."
            />
            <Kpi
              label="Зависло"
              value={live.stuckTotal}
              tone={live.stuckTotal > 0 ? 'bad' : 'good'}
              note={`понад ${th.stuckActiveDays} дн у роботі / ${th.stuckApprovalDays} дн на узгодженні`}
            />
            <Kpi
              label="Заморожено грошей"
              value={live.stuckRevenue}
              format="money"
              tone={live.stuckRevenue > 0 ? 'warn' : 'muted'}
              hint="Сума заявок, які зависли в чергах: ці гроші не дійдуть до оплати, поки заявки не рушать."
            />
            <Kpi
              label="Закрито заявок періоду"
              value={cohort.closeRate}
              format="pct"
              tone={cohort.closeRate >= 85 ? 'good' : 'warn'}
              note={`${int(cohort.closed)} з ${int(cohort.total)}`}
            />
            <Kpi
              label="Очікують рахунок"
              value={p.invoices?.pending}
              tone={p.invoices?.pending > 0 ? 'warn' : 'muted'}
              hint="Заявки, де рахунок потрібен або запитаний, але файл рахунку ще не завантажено."
            />
            {live.bottleneck?.stuck > 0 && (
              <Kpi
                label="Вузьке місце"
                value={live.bottleneck.stuck}
                tone="bad"
                note={live.bottleneck.label}
                hint="Етап із найбільшою кількістю зависших заявок."
              />
            )}
          </div>

          <Grid min={430}>
            <Panel
              title="Черги зараз"
              icon="⏱"
              span={2}
              hint="Заштрихована частина смуги — заявки, що перевищили норматив свого етапу. Клацніть на етап, щоб побачити конкретні заявки. Закриті заявки сюди не входять — лише живі черги."
            >
              <Funnel
                stages={(live.stages || []).filter((s) => s.id !== 'closed' || s.count > 0)}
                total={live.active || live.total}
                openStage={openStage}
                onToggle={(id) => setOpenStage((cur) => (cur === id ? null : id))}
                stuckByStage={p.stuckByStage}
                sideStages={live.sideStages}
              />
            </Panel>

            <Panel
              title="Де стоять заявки періоду"
              icon="🎯"
              hint="Кохорта вибраного періоду: скільки заявок дійшло до кожного етапу. Показує наскрізну проходимість, а не поточні черги."
            >
              <StatList
                items={[
                  ...(cohort.stages || []).map((st) => ({
                    label: `${st.icon} ${st.label}`,
                    value: st.count,
                    format: 'int',
                  })),
                  ...(cohort.sideStages || []).filter((st) => st.count > 0).map((st) => ({
                    label: `${st.icon} ${st.label}`,
                    value: st.count,
                    format: 'int',
                    tone: st.id === 'blocked' || st.id === 'rejected' ? 'bad' : undefined,
                  })),
                ]}
              />
            </Panel>

            <Panel
              title="Час на переходах"
              icon="🔀"
              full
              hint="Середній час між подіями життєвого циклу. Ціль — внутрішній норматив; перевищення підсвічене."
            >
              <div className="an-transitions">
                {(p.transitions || []).map((t) => (
                  <div className={`an-transition ${t.overTarget ? 'is-over' : ''}`} key={t.id}>
                    <div className="an-transition__head">
                      <span>{t.label}</span>
                      <b>{days(t.days)}</b>
                    </div>
                    <div className="an-transition__bar">
                      <div
                        className="an-transition__fill"
                        style={{
                          width: `${Math.min((Number(t.days) || 0) / Math.max(t.target * 2, 1) * 100, 100)}%`,
                        }}
                      />
                      <div className="an-transition__target" style={{ left: '50%' }} title={`Ціль: ${t.target} дн`} />
                    </div>
                    <div className="an-transition__foot">
                      <span>ціль {t.target} дн</span>
                      <span>{t.samples ? `по ${int(t.samples)} заявках` : 'немає даних'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </Grid>

          {openStage && (
            <Section title={`Завислі заявки: ${(live.stages || []).find((s) => s.id === openStage)?.label || ''}`}>
              <Panel
                title={`${int((p.stuckByStage?.[openStage] || []).length)} заявок`}
                icon="🚨"
                tone="bad"
                actions={
                  <button type="button" className="an-btn an-btn--sm an-btn--ghost" onClick={() => setOpenStage(null)}>
                    Закрити
                  </button>
                }
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
                          <span className="an-cell-sub">{r.region}</span>
                        </span>
                      ),
                    },
                    { key: 'reason', label: 'Причина', render: (r) => <Badge tone="bad">{r.reason}</Badge> },
                    { key: 'days', label: 'Днів', align: 'right', render: (r) => days(r.days) },
                    { key: 'revenue', label: 'Сума', format: 'money', align: 'right' },
                    { key: 'author', label: 'Автор' },
                  ]}
                  rows={p.stuckByStage?.[openStage]}
                  rowKey="id"
                  limit={20}
                  initialSort={{ key: 'days', dir: 'desc' }}
                  emptyText="На цьому етапі немає зависших заявок"
                />
              </Panel>
            </Section>
          )}
        </>
      )}
    </TabShell>
  );
}

function Funnel({ stages, total, openStage, onToggle, stuckByStage, sideStages }) {
  const list = stages || [];
  const max = Math.max(...list.map((s) => s.count), 1);

  return (
    <div className="an-funnel">
      {list.map((stage, idx) => {
        const width = (stage.count / max) * 100;
        const stuckShare = stage.count > 0 ? (stage.stuck / stage.count) * 100 : 0;
        const clickable = stage.tracksStuck && (stuckByStage?.[stage.id] || []).length > 0;
        return (
          <React.Fragment key={stage.id}>
            <div
              className={`an-funnel__row ${clickable ? 'is-clickable' : ''}`}
              onClick={clickable ? () => onToggle(stage.id) : undefined}
              onKeyDown={clickable ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(stage.id); }
              } : undefined}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              aria-expanded={clickable ? openStage === stage.id : undefined}
              title={clickable ? 'Показати завислі заявки' : stage.description}
            >
              <div className="an-funnel__name">
                <span aria-hidden="true">{stage.icon}</span>
                <b>{stage.label}</b>
                {stage.stuck > 0 && <Badge tone="bad">{stage.stuck}</Badge>}
              </div>

              <div className="an-funnel__track">
                <div className="an-funnel__fill" style={{ width: `${width}%`, background: stage.color }} />
                {stage.stuck > 0 && (
                  <div
                    className="an-funnel__stuck"
                    style={{ width: `${(width * stuckShare) / 100}%`, right: `${100 - width}%` }}
                    title={`Зависло: ${stage.stuck} на ${money(stage.stuckRevenue)}`}
                  />
                )}
              </div>

              {/* Число окремою колонкою, а не поверх смуги: на коротких смугах
                  воно накладалось на штрихування і не читалось. */}
              <div className="an-funnel__count">
                <b>{int(stage.count)}</b>
                {total > 0 && <span>{pct(stage.percent)}</span>}
              </div>

              <div className="an-funnel__side">
                {stage.avgStageDays != null ? `сер. ${num(stage.avgStageDays)} дн` : '—'}
              </div>
            </div>

            {idx < list.length - 1 && (
              <div className="an-funnel__arrow">
                <i aria-hidden="true">↓</i>
                {stage.maxStageDays != null && <span>найдовша на етапі: {days(stage.maxStageDays)}</span>}
              </div>
            )}
          </React.Fragment>
        );
      })}

      {(sideStages || []).some((s) => s.count > 0) && (
        <div className="an-funnel__side-row">
          {(sideStages || []).filter((s) => s.count > 0).map((s) => (
            <span key={s.id} className="an-funnel__side-item">
              <i aria-hidden="true">{s.icon}</i>
              {s.label}: <b>{int(s.count)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
