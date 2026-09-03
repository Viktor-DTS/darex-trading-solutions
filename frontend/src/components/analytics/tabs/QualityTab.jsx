/**
 * Якість даних.
 *
 * Ця вкладка існує, щоб пояснювати розбіжності в інших вкладках. Наприклад,
 * «середній час виконання» рахується не по всіх виконаних заявках, а лише по
 * тих, де заповнена дата виконання — і саме тут видно, скільких заявок бракує.
 */
import React from 'react';
import { Badge, Grid, Kpi, Panel } from '../primitives';
import { int, pct } from '../format';
import { useAnalytics } from '../useAnalytics';
import { Section, TabShell } from './TabShell';

/** Кожен рядок пояснює не лише «не заповнено», а що саме через це ламається. */
const FIELDS = [
  {
    key: 'missingWork',
    base: 'completed',
    label: 'Найменування робіт',
    breaks: 'Аналітика та маржа за типами робіт: такі заявки збираються в «Не вказано».',
  },
  {
    key: 'missingAuthor',
    base: 'total',
    label: 'Автор заявки',
    breaks: 'Звіт «Робота операторів» — заявку не видно ні в кого в рейтингу.',
  },
  {
    key: 'missingEquipment',
    base: 'completed',
    label: 'Тип обладнання',
    breaks: 'Розріз за обладнанням: неможливо порівняти обслуговування різних моделей.',
  },
  {
    key: 'missingEngineer',
    base: 'completed',
    label: 'Сервісний інженер',
    breaks: 'Рейтинг команди: робота виконана, але не зарахована жодному інженеру.',
  },
  {
    key: 'missingPaymentType',
    base: 'completed',
    label: 'Вид оплати',
    breaks: 'Структура надходжень: сума потрапляє в «Інше».',
  },
  {
    key: 'missingCompletedAt',
    base: 'completed',
    label: 'Дата виконання (авт.)',
    breaks: 'Час виконання і час до узгодження — заявка просто виключається з розрахунку.',
  },
  {
    key: 'missingCreatedAt',
    base: 'total',
    label: 'Дата створення (авт.)',
    breaks: 'Виявлення зависань: без дати створення неможливо порахувати вік заявки.',
  },
  {
    key: 'missingClient',
    base: 'total',
    label: 'Клієнт',
    breaks: 'Рейтинг клієнтів і дебіторка по контрагентах.',
  },
  {
    key: 'missingRegion',
    base: 'total',
    label: 'Регіон',
    breaks: 'Регіональні зрізи і розмежування доступу: заявка не належить жодному регіону.',
  },
];

export default function QualityTab({ filters, reloadToken }) {
  const { data, loading, error, reload } = useAnalytics('service', filters, { reloadToken });
  const dq = data?.service?.dataQuality;

  const rows = (dq ? FIELDS : []).map((f) => {
    const base = f.base === 'completed' ? dq.completed : dq.total;
    const count = dq[f.key] || 0;
    return { ...f, count, base, share: base > 0 ? (count / base) * 100 : 0 };
  }).filter((r) => r.count > 0).sort((a, b) => b.share - a.share);

  return (
    <TabShell loading={loading} error={error} reload={reload} meta={data?.meta} skeletonPanels={3}>
      {dq && (
        <>
          <div className="an-kpi-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <Kpi label="Заявок у періоді" value={dq.total} />
            <Kpi label="З них виконано" value={dq.completed} tone="good" />
            <Kpi
              label="Поза періодами"
              value={dq.undatedTasks}
              tone={dq.undatedTasks > 0 ? 'bad' : 'good'}
              hint="Жодне поле дати не читається як дата. Ці заявки не входять ні в один період і не видні у звітах за роками."
            />
            <Kpi
              label="Нестандартний формат дати"
              value={dq.nonIsoDateTasks}
              tone={dq.nonIsoDateTasks > 0 ? 'warn' : 'good'}
              hint="Дата збережена рядком не в ISO-форматі, наприклад «15.01.2026». Аналітика їх розпізнає, але сортування і фільтри в інших модулях працюють з ними непередбачувано."
            />
            <Kpi
              label="Виконано з нульовою сумою"
              value={dq.zeroRevenueCompleted}
              tone={dq.zeroRevenueCompleted > 0 ? 'warn' : 'good'}
              hint="Заявка закрита, але «Загальна сума послуги» порожня або нульова. Такі заявки занижують дохід і середній чек."
            />
            <Kpi
              label="Суми як текст"
              value={dq.revenueAsString}
              tone="muted"
              hint="Сума збережена рядком, наприклад «12 524,40». Аналітика розбирає такі значення коректно, але для інших модулів це джерело помилок."
            />
          </div>

          <Section title="Незаповнені поля">
            {rows.length === 0 ? (
              <Panel><p className="an-note">Усі ключові поля заповнені. Розрахунки в інших вкладках повні.</p></Panel>
            ) : (
              <Panel
                title="Що саме ламається через прогалини"
                icon="🧾"
                hint="Частка вважається від відповідної бази: для полів, які заповнюються при закритті, — від виконаних заявок."
              >
                <div className="an-quality">
                  {rows.map((r) => (
                    <div className="an-quality__row" key={r.key}>
                      <div className="an-quality__head">
                        <span className="an-quality__name">{r.label}</span>
                        <Badge tone={r.share >= 30 ? 'bad' : r.share >= 10 ? 'warn' : 'muted'}>
                          {int(r.count)} з {int(r.base)} · {pct(r.share)}
                        </Badge>
                      </div>
                      <div className="an-quality__track">
                        <div
                          className="an-quality__fill"
                          style={{
                            width: `${Math.min(r.share, 100)}%`,
                            background: r.share >= 30 ? '#ef4444' : r.share >= 10 ? '#f59e0b' : '#4f8ef7',
                          }}
                        />
                      </div>
                      <p className="an-quality__breaks">{r.breaks}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </Section>

          <Section title="Як це впливає на цифри">
            <Grid min={330}>
              <Panel title="Час виконання" icon="⏱">
                <p className="an-note">
                  Середній час рахується по {int(data.service.kpi.leadSamples)} заявках
                  {dq.completed > 0 && ` з ${int(dq.completed)} виконаних`}
                  {dq.missingCompletedAt > 0
                    ? `. ${int(dq.missingCompletedAt)} заявок не мають дати виконання, тому в розрахунок не входять — фактичний середній час може відрізнятися.`
                    : '. Усі виконані заявки мають дату виконання, тому показник повний.'}
                </p>
              </Panel>

              <Panel title="Дохід і середній чек" icon="💰">
                <p className="an-note">
                  {dq.zeroRevenueCompleted > 0
                    ? `${int(dq.zeroRevenueCompleted)} виконаних заявок мають нульову суму. Вони входять у кількість виконаних, але не додають доходу, тому середній чек занижений.`
                    : 'Усі виконані заявки мають заповнену суму — дохід і середній чек рахуються по повній вибірці.'}
                </p>
              </Panel>

              <Panel title="Періоди" icon="📅">
                <p className="an-note">
                  {dq.undatedTasks > 0
                    ? `${int(dq.undatedTasks)} заявок неможливо віднести до жодного періоду. Їх не буде видно ні за який рік — сума за всі роки не збігатиметься з загальною кількістю заявок у базі.`
                    : 'Кожна заявка має щонайменше одну читабельну дату, тому періоди покривають усю базу.'}
                </p>
              </Panel>
            </Grid>
          </Section>
        </>
      )}
    </TabShell>
  );
}
