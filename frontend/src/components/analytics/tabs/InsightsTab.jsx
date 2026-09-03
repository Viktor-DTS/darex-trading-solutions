/**
 * Рекомендації.
 *
 * Раніше тут був список фраз без цифр і без адресата. Тепер кожен пункт
 * розкривається у чотири речі: що показують дані, чому так могло стати,
 * що конкретно зробити і хто це робить. Поруч завжди видно розмір вибірки —
 * висновок на п'яти заявках не має виглядати як закономірність.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Grid, Kpi, Panel } from '../primitives';
import { formatBy, int, money } from '../format';
import { useAnalytics } from '../useAnalytics';
import { Section, TabShell } from './TabShell';

const SEVERITY = {
  critical: { icon: '🔴', label: 'Критично', tone: 'bad', order: 0 },
  high: { icon: '🟠', label: 'Високий', tone: 'bad', order: 1 },
  medium: { icon: '🟡', label: 'Середній', tone: 'warn', order: 2 },
  low: { icon: '🔵', label: 'Низький', tone: 'info', order: 3 },
};

const CONFIDENCE = {
  high: { label: 'висока впевненість', tone: 'good' },
  medium: { label: 'середня впевненість', tone: 'warn' },
  low: { label: 'мала вибірка', tone: 'muted' },
};

export default function InsightsTab({ filters, reloadToken, navigate, drill }) {
  const { data, loading, error, reload } = useAnalytics('insights', filters, { reloadToken });
  const ins = data?.insights;
  const [dept, setDept] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [owner, setOwner] = useState('all');
  const [openId, setOpenId] = useState(null);
  const autoOpened = useRef(false);

  useEffect(() => {
    if (drill?.focus) setDept(drill.focus);
  }, [drill]);

  useEffect(() => {
    if (autoOpened.current || !ins?.recommendations?.length) return;
    const first = ins.recommendations.find((r) => r.severity === 'critical' || r.severity === 'high');
    if (first) {
      setOpenId(first.id);
      autoOpened.current = true;
    }
  }, [ins]);

  const list = useMemo(() => {
    let rows = ins?.recommendations || [];
    if (dept !== 'all') rows = rows.filter((r) => r.dept === dept);
    if (severity !== 'all') rows = rows.filter((r) => r.severity === severity);
    if (owner !== 'all') {
      rows = rows.filter((r) => (r.actions || []).some((a) => a.owner === owner));
    }
    return rows;
  }, [ins, dept, severity, owner]);

  const sev = ins?.summary?.bySeverity || {};

  return (
    <TabShell loading={loading} error={error} reload={reload} meta={data?.meta} skeletonPanels={3}>
      {ins && (
        <>
          <div className="an-kpi-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(158px, 1fr))' }}>
            <Kpi
              label="Оцінка стану"
              value={ins.healthScore}
              format="int"
              tone={ins.healthScore >= 80 ? 'good' : ins.healthScore >= 55 ? 'warn' : 'bad'}
              note="зі 100"
              hint="100 балів мінус штрафи за важливістю знайдених проблем, з поправкою на впевненість кожного висновку."
            />
            <Kpi label="Усього знахідок" value={ins.summary?.total} />
            <Kpi label="Критичних" value={sev.critical} tone={sev.critical > 0 ? 'bad' : 'good'} />
            <Kpi label="Високої важливості" value={sev.high} tone={sev.high > 0 ? 'bad' : 'good'} />
            <Kpi
              label="Під питанням грошей"
              value={ins.summary?.moneyAtStake}
              format="money"
              tone="warn"
              hint="Сума впливів усіх рекомендацій, де вплив вимірюється в грошах: заморожені в чергах суми, дебіторка, недоотримана маржа."
            />
            <Kpi label="Сильні сторони" value={(ins.strengths || []).length} tone="good" />
          </div>

          {ins.briefing && (
            <Panel title={ins.briefing.headline} icon="🧭" hint="Короткий висновок з найгострішої знахідки: що відбувається і який перший крок.">
              <p className="an-note" style={{ margin: 0 }}>{ins.briefing.text}</p>
            </Panel>
          )}

          {(ins.todayActions || []).length > 0 && (
            <Section title="Що зробити зараз">
              <div className="an-today">
                {ins.todayActions.map((a, i) => (
                  <button
                    key={a.recId}
                    type="button"
                    className={`an-today__item an-top-rec--${a.severity}`}
                    onClick={() => {
                      setOpenId(a.recId);
                      if (a.dept) setDept(a.dept);
                    }}
                  >
                    <span className="an-rec__action-num">{i + 1}</span>
                    <span className="an-today__text">{a.text}</span>
                    <span className="an-today__owner">{a.owner}</span>
                  </button>
                ))}
              </div>
            </Section>
          )}

          <div className="an-rec-filters">
            <div className="an-chips">
              <Chip active={dept === 'all'} onClick={() => setDept('all')}>
                Усі відділи <b>{ins.summary?.total || 0}</b>
              </Chip>
              {(ins.departments || []).filter((d) => d.count > 0).map((d) => (
                <Chip key={d.id} active={dept === d.id} onClick={() => setDept(d.id)}>
                  <span aria-hidden="true">{d.icon}</span> {d.label} <b>{d.count}</b>
                </Chip>
              ))}
            </div>

            <div className="an-chips">
              <Chip active={severity === 'all'} onClick={() => setSeverity('all')}>Будь-яка важливість</Chip>
              {Object.entries(SEVERITY)
                .filter(([id]) => (sev[id] || 0) > 0)
                .sort((a, b) => a[1].order - b[1].order)
                .map(([id, meta]) => (
                  <Chip key={id} active={severity === id} onClick={() => setSeverity(id)}>
                    <span aria-hidden="true">{meta.icon}</span> {meta.label} <b>{sev[id]}</b>
                  </Chip>
                ))}
            </div>

            {(ins.ownerBoard || []).length > 0 && (
              <div className="an-chips">
                <Chip active={owner === 'all'} onClick={() => setOwner('all')}>Будь-хто відповідальний</Chip>
                {ins.ownerBoard.map((o) => (
                  <Chip key={o.owner} active={owner === o.owner} onClick={() => setOwner(o.owner)}>
                    {o.owner} <b>{o.count}</b>
                  </Chip>
                ))}
              </div>
            )}
          </div>

          {list.length === 0 ? (
            <Panel>
              <p className="an-note">
                За вибраним фільтром рекомендацій немає. Це або добрий знак, або надто вузький фільтр.
              </p>
            </Panel>
          ) : (
            <div className="an-recs">
              {list.map((r) => (
                <Recommendation
                  key={r.id}
                  rec={r}
                  open={openId === r.id}
                  onToggle={() => setOpenId((cur) => (cur === r.id ? null : r.id))}
                  navigate={navigate}
                />
              ))}
            </div>
          )}

          {(ins.strengths || []).length > 0 && (
            <Section title="Що працює добре">
              <Grid min={300}>
                {ins.strengths.map((s) => (
                  <div className="an-rec an-rec--strength" key={s.id}>
                    <div className="an-rec__head" style={{ cursor: 'default' }}>
                      <span className="an-rec__sev" aria-hidden="true">✅</span>
                      <div className="an-rec__main">
                        <div className="an-rec__title">{s.title}</div>
                        <div className="an-rec__impact">{s.detail}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </Grid>
            </Section>
          )}
        </>
      )}
    </TabShell>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button type="button" className={`an-chip ${active ? 'is-active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

function Recommendation({ rec, open, onToggle, navigate }) {
  const meta = SEVERITY[rec.severity] || SEVERITY.medium;
  const conf = CONFIDENCE[rec.confidence] || CONFIDENCE.medium;

  return (
    <article className={`an-rec an-rec--${rec.severity} ${open ? 'is-open' : ''}`}>
      <button type="button" className="an-rec__head" onClick={onToggle} aria-expanded={open}>
        <span className="an-rec__sev" aria-hidden="true">{meta.icon}</span>

        <div className="an-rec__main">
          <div className="an-rec__title">{rec.title}</div>
          <div className="an-rec__tags">
            <Badge tone="accent">{rec.deptIcon} {rec.deptLabel}</Badge>
            {rec.category && <Badge>{rec.category}</Badge>}
            <Badge tone={conf.tone}>{conf.label}</Badge>
            {rec.sampleSize > 0 && <Badge>вибірка {int(rec.sampleSize)}</Badge>}
          </div>
          {rec.impact?.text && (
            <div className="an-rec__impact">
              {rec.impact.type === 'money' && rec.impact.value > 0 && <strong>{money(rec.impact.value)} · </strong>}
              {rec.impact.text}
            </div>
          )}
          {!open && rec.actions?.[0] && (
            <div className="an-rec__next">
              Далі: {rec.actions[0].text}
              <span>{rec.actions[0].owner}</span>
            </div>
          )}
        </div>

        <span className="an-rec__chev" aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div className="an-rec__body">
          <div className="an-rec__block">
            <span className="an-rec__label">Що показують дані</span>
            <span className="an-rec__text">{rec.finding}</span>
          </div>

          {rec.rootCause && (
            <div className="an-rec__block">
              <span className="an-rec__label">Найімовірніша причина</span>
              <span className="an-rec__text">{rec.rootCause}</span>
            </div>
          )}

          {rec.caveat && (
            <div className="an-rec__block">
              <span className="an-rec__label">Обмеження висновку</span>
              <span className="an-rec__text">{rec.caveat}</span>
            </div>
          )}

          {rec.metric && (
            <div className="an-rec__metric">
              <span>{rec.metric.label}:</span>
              <b>{rec.metric.current}{rec.metric.unit === '%' ? '' : ''}</b>
              {rec.metric.target && (
                <>
                  <span className="an-rec__metric-arrow">→</span>
                  <span className="an-rec__metric-target">ціль {rec.metric.target}</span>
                </>
              )}
            </div>
          )}

          {(rec.actions || []).length > 0 && (
            <div className="an-rec__block">
              <span className="an-rec__label">Що зробити</span>
              <ol className="an-rec__actions">
                {rec.actions.map((a, i) => (
                  <li className="an-rec__action" key={a.text}>
                    <span className="an-rec__action-num">{i + 1}</span>
                    <span className="an-rec__action-text">{a.text}</span>
                    <span className="an-rec__action-owner">{a.owner}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {rec.evidence?.items?.length > 0 && <Evidence evidence={rec.evidence} />}

          <div className="an-rec__foot">
            {rec.link && (
              <button
                type="button"
                className="an-btn an-btn--sm"
                onClick={() => navigate(rec.link)}
              >
                Показати дані
              </button>
            )}
            <span style={{ fontSize: 10.5, color: 'var(--an-text-mute)' }}>
              Пріоритет розрахований як важливість × впевненість × масштаб впливу ({rec.score})
            </span>
          </div>
        </div>
      )}
    </article>
  );
}

/** Формат клітинки визначається за назвою поля, бо самі дані — просто числа. */
const EVIDENCE_FORMAT = {
  revenue: 'money',
  amount: 'money',
  margin: 'money',
  value: 'money',
  days: 'days',
  daysLeft: 'days',
  count: 'int',
  tasks: 'int',
};

/**
 * Докази — це конкретні заявки чи позиції, на яких побудований висновок.
 * Без них рекомендацію неможливо перевірити, а отже і виконати.
 */
function Evidence({ evidence }) {
  const items = evidence.items || [];
  const keys = Object.keys(items[0] || {});
  const labels = evidence.columns || keys;

  return (
    <div className="an-rec__block">
      <span className="an-rec__label">
        Конкретні записи
        {evidence.count > items.length && ` (перші ${items.length} з ${evidence.count})`}
      </span>
      <div className="an-table-wrap">
        <table className="an-table an-table--compact">
          <thead>
            <tr>
              {keys.map((k, i) => (
                <th key={k} style={{ textAlign: EVIDENCE_FORMAT[k] ? 'right' : 'left' }}>{labels[i] || k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.number || item.name || idx}>
                {keys.map((k) => (
                  <td key={k} style={{ textAlign: EVIDENCE_FORMAT[k] ? 'right' : 'left' }}>
                    {EVIDENCE_FORMAT[k] ? formatBy(EVIDENCE_FORMAT[k], item[k]) : (item[k] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
