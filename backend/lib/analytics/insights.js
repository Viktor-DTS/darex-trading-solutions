/**
 * Механізм рекомендацій.
 *
 * Кожна рекомендація зобов'язана відповісти на чотири питання, інакше вона не має сенсу:
 *   що саме показують дані (finding), чому так могло стати (rootCause),
 *   що конкретно зробити і хто це робить (actions), і на які цифри це вплине (impact).
 * Додатково кожне правило несе розмір вибірки та впевненість — щоб на 5 заявках
 * не з'являлись висновки з виглядом статистичної істини.
 */

const DEPARTMENTS = {
  service: { label: 'Сервісна служба', icon: '🔧' },
  process: { label: 'Черги відділів', icon: '🔄' },
  finance: { label: 'Бухгалтерія', icon: '💰' },
  sales: { label: 'Відділ продажів', icon: '🤝' },
  supply: { label: 'Склад, ЗЕД, закупівлі', icon: '📦' },
  data: { label: 'Якість даних', icon: '🧾' },
};

const SEVERITY_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 };

/** Мінімальні вибірки, за яких висновок ще має сенс. */
const MIN_SAMPLES = {
  conversion: 20,
  leadTime: 15,
  workType: 8,
  client: 5,
  engineer: 10,
  region: 2,
  operator: 15,
  margin: 15,
  sales: 8,
  leads: 20,
};

function confidenceFor(sampleSize, thresholds = {}) {
  const { high = 30, medium = 10 } = thresholds;
  if (sampleSize >= high) return 'high';
  if (sampleSize >= medium) return 'medium';
  return 'low';
}

const pct = (v, digits = 1) => `${Number(v || 0).toFixed(digits)}%`;
const days = (v, digits = 1) => `${Number(v || 0).toFixed(digits)} дн`;
const money = (v) => `${Math.round(Number(v || 0)).toLocaleString('uk-UA')} ₴`;
const count = (v, word = 'заявок') => `${Number(v || 0)} ${word}`;

/**
 * Оцінка для сортування: важливість × (вплив у грошах, нормалізований) × впевненість.
 * Гроші зводяться до логарифмічної шкали, щоб одна велика сума не витісняла все інше.
 */
function scoreOf(rec) {
  const sev = SEVERITY_WEIGHT[rec.severity] || 1;
  const conf = rec.confidence === 'high' ? 1 : rec.confidence === 'medium' ? 0.75 : 0.45;
  const moneyImpact = rec.impact?.type === 'money' ? Math.max(0, Number(rec.impact.value) || 0) : 0;
  const moneyFactor = moneyImpact > 0 ? 1 + Math.log10(1 + moneyImpact / 1000) : 1;
  const countImpact = rec.impact?.type === 'count' ? Math.max(0, Number(rec.impact.value) || 0) : 0;
  const countFactor = countImpact > 0 ? 1 + Math.log10(1 + countImpact) : 1;
  return Math.round(sev * conf * moneyFactor * countFactor * 100) / 100;
}

function rec(input) {
  const dept = DEPARTMENTS[input.dept] || DEPARTMENTS.service;
  const built = {
    confidence: 'medium',
    actions: [],
    evidence: null,
    impact: null,
    metric: null,
    rootCause: '',
    ...input,
    deptLabel: dept.label,
    deptIcon: dept.icon,
  };
  built.score = scoreOf(built);
  return built;
}

/* ─────────────────────────── Правила: якість даних ─────────────────────────── */

function dataQualityRules({ service }) {
  const out = [];
  const dq = service?.dataQuality || {};
  const total = dq.total || 0;
  const completed = dq.completed || 0;

  const share = (n, base) => (base > 0 ? (n / base) * 100 : 0);

  const gaps = [
    { key: 'missingWork', base: completed, label: 'тип робіт', field: '«Найменування робіт»', breaks: 'аналітику продуктивності та маржі за типами робіт', threshold: 10 },
    { key: 'missingAuthor', base: total, label: 'автор заявки', field: '«Автор заявки»', breaks: 'звіт «Робота операторів»', threshold: 10 },
    { key: 'missingEquipment', base: completed, label: 'тип обладнання', field: '«Тип обладнання»', breaks: 'аналітику за обладнанням', threshold: 15 },
    { key: 'missingEngineer', base: completed, label: 'інженер', field: '«Сервісний інженер»', breaks: 'рейтинг команди — заявки без інженера не потрапляють у продуктивність', threshold: 5 },
    { key: 'missingPaymentType', base: completed, label: 'вид оплати', field: '«Вид оплати»', breaks: 'структуру надходжень', threshold: 15 },
    { key: 'missingCompletedAt', base: completed, label: 'дата виконання', field: '«Авт. виконано»', breaks: 'розрахунок часу виконання — саме через це середній час рахується не по всіх заявках', threshold: 10 },
  ];

  for (const gap of gaps) {
    const n = dq[gap.key] || 0;
    const p = share(n, gap.base);
    if (n < 3 || p < gap.threshold) continue;
    out.push(rec({
      id: `data.${gap.key}`,
      dept: 'data',
      category: 'Повнота даних',
      severity: p >= 30 ? 'high' : 'medium',
      title: `Не заповнено ${gap.label}: ${n} з ${gap.base}`,
      finding: `${n} заявок (${pct(p)}) не мають значення в полі ${gap.field}.`,
      rootCause: `Поле не є обов'язковим на формі, тому його пропускають при швидкому закритті заявки.`,
      actions: [
        { text: `Зробити ${gap.field} обов'язковим при переведенні заявки у «Виконано»`, owner: 'Адміністратор' },
        { text: 'Донести до операторів і сервісу, що поле впливає на звітність', owner: 'Регіональний керівник' },
      ],
      metric: { label: 'Незаповнено', current: pct(p), target: `< ${gap.threshold}%`, unit: '%' },
      impact: { type: 'count', value: n, text: `${gap.breaks} — викривлено на ${pct(p)} вибірки` },
      confidence: 'high',
      sampleSize: gap.base,
      link: { tab: 'quality' },
    }));
  }

  if (dq.undatedTasks > 0) {
    out.push(rec({
      id: 'data.undated',
      dept: 'data',
      category: 'Цілісність даних',
      severity: dq.undatedTasks > 20 ? 'high' : 'medium',
      title: `${dq.undatedTasks} заявок без розпізнаваної дати`,
      finding: `У ${dq.undatedTasks} заявок жодне з полів дати (дата заявки, дата робіт, авт. створення) не читається як дата. Такі заявки не входять ні в один період і не видні в жодному звіті за роками.`,
      rootCause: 'Історичний імпорт або ручне введення дати в непідтримуваному форматі.',
      actions: [
        { text: 'Вивантажити ці заявки та привести дати до формату YYYY-MM-DD', owner: 'Адміністратор' },
      ],
      metric: { label: 'Заявок поза періодами', current: String(dq.undatedTasks), target: '0', unit: 'шт' },
      impact: { type: 'count', value: dq.undatedTasks, text: 'заявки повністю відсутні у звітності' },
      // Це не статистичний висновок, а факт по всій колекції: вибірка — усі заявки.
      confidence: 'high',
      sampleSize: total,
      link: { tab: 'quality' },
    }));
  }

  if ((dq.nonIsoDateTasks || 0) > 0) {
    out.push(rec({
      id: 'data.non_iso_dates',
      dept: 'data',
      category: 'Цілісність даних',
      severity: 'low',
      title: `${dq.nonIsoDateTasks} заявок із датою в форматі «15.01.2026»`,
      finding: `Дата збережена рядком не в ISO-форматі. Аналітика такі значення розпізнає, але будь-яка фільтрація або сортування за датою в інших звітах працює з ними непередбачувано.`,
      rootCause: 'Ручне введення або імпорт без нормалізації формату дати.',
      actions: [
        { text: 'Привести дати цих заявок до формату YYYY-MM-DD', owner: 'Адміністратор' },
      ],
      metric: { label: 'Заявок із нестандартною датою', current: String(dq.nonIsoDateTasks), target: '0', unit: 'шт' },
      impact: { type: 'count', value: dq.nonIsoDateTasks, text: 'ризик неправильного потрапляння в періоди звітів' },
      confidence: 'high',
      sampleSize: total,
      link: { tab: 'quality' },
    }));
  }

  if ((dq.zeroRevenueCompleted || 0) >= 3) {
    const p = share(dq.zeroRevenueCompleted, completed);
    out.push(rec({
      id: 'data.zero_revenue',
      dept: 'data',
      category: 'Фінансові дані',
      severity: p >= 15 ? 'high' : 'medium',
      title: `${dq.zeroRevenueCompleted} виконаних заявок із нульовою сумою`,
      finding: `${dq.zeroRevenueCompleted} заявок (${pct(p)}) мають статус «Виконано», але сума послуги 0 або відсутня. Вони знижують середній чек і конверсію в гроші.`,
      rootCause: 'Внутрішні/гарантійні роботи не відділені від комерційних, або суму не внесли після закриття.',
      actions: [
        { text: 'Перевірити, чи це гарантійні та внутрішні роботи — і позначати їх окремим типом робіт', owner: 'Бух. рахунки' },
        { text: 'Внести суми там, де роботи були платні', owner: 'Бух. рахунки' },
      ],
      metric: { label: 'Заявок без суми', current: pct(p), target: '< 5%', unit: '%' },
      impact: { type: 'count', value: dq.zeroRevenueCompleted, text: 'середній чек занижений' },
      confidence: 'high',
      sampleSize: completed,
      link: { tab: 'quality' },
    }));
  }

  if ((dq.revenueAsString || 0) > 0) {
    out.push(rec({
      id: 'data.revenue_as_string',
      dept: 'data',
      category: 'Технічний борг',
      severity: 'low',
      title: `Суми як текст у ${dq.revenueAsString} заявках`,
      finding: `У ${dq.revenueAsString} заявок поле «Загальна сума послуги» зберігається рядком (напр. «12 524,40»), а не числом. Аналітика це коректно розбирає, але будь-який новий звіт, що читає поле напряму, отримає неправильне значення.`,
      rootCause: 'Історичний імпорт та форми, що зберігають введений текст без нормалізації.',
      actions: [
        { text: 'Одноразово нормалізувати числові поля заявок у БД до типу number', owner: 'Адміністратор' },
      ],
      metric: { label: 'Записів текстом', current: String(dq.revenueAsString), target: '0', unit: 'шт' },
      impact: { type: 'count', value: dq.revenueAsString, text: 'ризик неправильних сум у нових звітах' },
      confidence: 'high',
      sampleSize: total,
      link: { tab: 'quality' },
    }));
  }

  return out;
}

/* ───────────────────────── Правила: процеси та черги ───────────────────────── */

function processRules({ process: proc }) {
  const out = [];
  if (!proc) return out;
  const { thresholds } = proc;

  for (const stage of proc.live?.stages || []) {
    if (!stage.tracksStuck || stage.stuck < 3) continue;
    const stuckList = proc.stuckByStage?.[stage.id] || [];
    const severity = stage.stuck >= 25 ? 'critical' : stage.stuck >= 10 ? 'high' : 'medium';
    const owners = {
      operator: 'Оператор', service: 'Сервісна служба',
      warehouse: 'Зав. склад', accountant: 'Бух на затвердженні',
    };
    out.push(rec({
      id: `process.stuck.${stage.id}`,
      dept: 'process',
      category: 'Черги та вузькі місця',
      severity,
      title: `${stage.label}: зависло ${stage.stuck} заявок`,
      finding: `На етапі «${stage.label}» ${stage.stuck} заявок стоять довше ${stage.stuckAfterDays} дн`
        + `${stage.maxStageDays != null ? `, найдовша — ${days(stage.maxStageDays)}` : ''}`
        + `${stage.stuckRevenue > 0 ? `. У них заморожено ${money(stage.stuckRevenue)}` : ''}.`,
      rootCause: stage.id === 'operator'
        ? 'Заявки приймаються, але не розподіляються між інженерами — немає власника черги.'
        : stage.id === 'service'
          ? 'Заявка взята в роботу, але не закривається: очікування запчастин, доступу на об\'єкт або просто не переведений статус.'
          : 'Підтвердження виконується вручну і не має дедлайну — черга накопичується без сигналу.',
      actions: [
        { text: `Розібрати чергу етапу «${stage.label}» починаючи з найстаріших заявок`, owner: owners[stage.id] || stage.panel },
        { text: `Увести правило: заявка не стоїть на етапі довше ${stage.stuckAfterDays} дн без коментаря про причину`, owner: 'Регіональний керівник' },
        ...(stage.id === 'accountant' || stage.id === 'warehouse'
          ? [{ text: 'Увімкнути щоденне нагадування по чергах підтвердження', owner: 'Адміністратор' }]
          : []),
      ],
      metric: {
        label: 'Зависло',
        current: count(stage.stuck),
        target: '0',
        unit: 'шт',
      },
      impact: stage.stuckRevenue > 0
        ? { type: 'money', value: stage.stuckRevenue, text: `${money(stage.stuckRevenue)} не доходять до закриття періоду` }
        : { type: 'count', value: stage.stuck, text: 'заявки не рухаються по процесу' },
      evidence: {
        count: stuckList.length,
        columns: ['№ заявки', 'Клієнт', 'Регіон', 'Днів'],
        items: stuckList.slice(0, 10).map((t) => ({
          number: t.number, client: t.client, region: t.region, days: t.days,
        })),
      },
      confidence: 'high',
      sampleSize: stage.count,
      link: { tab: 'process', stage: stage.id },
    }));
  }

  for (const tr of proc.transitions || []) {
    if (!tr.overTarget || tr.samples < MIN_SAMPLES.leadTime) continue;
    const gap = tr.days - tr.target;
    out.push(rec({
      id: `process.transition.${tr.id}`,
      dept: 'process',
      category: 'Швидкість процесу',
      severity: tr.days > tr.target * 2 ? 'high' : 'medium',
      title: `Довгий перехід «${tr.label}»: ${days(tr.days)}`,
      finding: `Середній час переходу ${days(tr.days)} проти цільових ${days(tr.target)} (вибірка ${tr.samples} заявок).`,
      rootCause: 'Між етапами немає автоматичної передачі — заявка чекає, поки хтось відкриє свою панель.',
      actions: [
        { text: `Скоротити крок «${tr.label}» до ${days(tr.target)}: визначити відповідального та дедлайн`, owner: 'Регіональний керівник' },
        { text: 'Налаштувати сповіщення в момент появи заявки на наступному етапі', owner: 'Адміністратор' },
      ],
      metric: { label: 'Середній час', current: days(tr.days), target: `< ${days(tr.target)}`, unit: 'дн' },
      impact: { type: 'days', value: Math.round(gap * 10) / 10, text: `кожна заявка втрачає ${days(gap)} даремно` },
      confidence: confidenceFor(tr.samples),
      sampleSize: tr.samples,
      link: { tab: 'process' },
    }));
  }

  const inv = proc.invoices || {};
  if ((inv.pending || 0) >= 5) {
    out.push(rec({
      id: 'process.invoice_pending',
      dept: 'finance',
      category: 'Документообіг',
      severity: inv.pending >= 20 ? 'high' : 'medium',
      title: `${inv.pending} заявок очікують рахунок`,
      finding: `${inv.pending} заявок потребують рахунку, але файл рахунку ще не завантажено.`,
      rootCause: 'Запит на рахунок створюється в заявці, але не має власного дедлайну і губиться серед інших задач бухгалтерії.',
      actions: [
        { text: 'Опрацювати чергу запитів на рахунки в панелі «Бух. рахунки»', owner: 'Бух. рахунки' },
        { text: 'Розділити чергу за терміном очікування, щоб найстаріші не тонули', owner: 'Бух. рахунки' },
      ],
      metric: { label: 'Без рахунку', current: count(inv.pending), target: '< 5', unit: 'шт' },
      impact: { type: 'count', value: inv.pending, text: 'без рахунку клієнт не може оплатити' },
      confidence: 'high',
      sampleSize: inv.needInvoice || inv.pending,
      link: { tab: 'finance' },
    }));
  }

  return out;
}

/* ──────────────────────── Правила: сервісна служба ──────────────────────── */

function serviceRules({ service }) {
  const out = [];
  if (!service) return out;
  const kpi = service.kpi || {};
  const dq = service.dataQuality || {};

  if (kpi.tasks >= MIN_SAMPLES.conversion && kpi.conversionRate < 70) {
    const target = 70;
    const extraTasks = Math.round((target - kpi.conversionRate) / 100 * kpi.tasks);
    const potential = extraTasks * (kpi.avgTicket || 0);
    out.push(rec({
      id: 'service.conversion',
      dept: 'service',
      category: 'Результативність',
      severity: kpi.conversionRate < 50 ? 'high' : 'medium',
      title: `Конверсія заявок ${pct(kpi.conversionRate)}`,
      finding: `З ${kpi.tasks} заявок періоду виконано ${kpi.completed}. У процесі досі ${kpi.active}, заблоковано ${kpi.blocked}, відмов ${kpi.rejected}.`,
      rootCause: kpi.active > kpi.completed * 0.3
        ? 'Основна причина — не відмови, а незакриті заявки: черга росте швидше, ніж її розбирають.'
        : 'Заявки втрачаються на етапі узгодження або дублюються при створенні.',
      actions: [
        { text: `Розібрати ${kpi.active} заявок у роботі — визначити, які реально виконуються, а які варто закрити`, owner: 'Сервісна служба' },
        { text: 'Перевірити заблоковані заявки: чи є там ті, що можна розблокувати', owner: 'Регіональний керівник' },
      ],
      metric: { label: 'Конверсія', current: pct(kpi.conversionRate), target: `${target}%`, unit: '%' },
      impact: potential > 0
        ? { type: 'money', value: potential, text: `${extraTasks} закритих заявок ≈ ${money(potential)} за середнім чеком` }
        : { type: 'count', value: extraTasks, text: 'заявок треба довести до закриття' },
      confidence: confidenceFor(kpi.tasks, { high: 100, medium: 30 }),
      sampleSize: kpi.tasks,
      link: { tab: 'service' },
    }));
  }

  if (kpi.avgLeadDays != null && kpi.avgLeadDays > 7 && kpi.leadSamples >= MIN_SAMPLES.leadTime) {
    const coverage = kpi.completed > 0 ? (kpi.leadSamples / kpi.completed) * 100 : 0;
    out.push(rec({
      id: 'service.lead_time',
      dept: 'service',
      category: 'Швидкість',
      severity: kpi.avgLeadDays > 14 ? 'high' : 'medium',
      title: `Середній час виконання ${days(kpi.avgLeadDays)}`,
      finding: `Від створення до виконання проходить ${days(kpi.avgLeadDays)}`
        + `${kpi.maxLeadDays != null ? `, максимум ${days(kpi.maxLeadDays)}` : ''}.`
        + ` Розрахунок по ${kpi.leadSamples} з ${kpi.completed} виконаних заявок (${pct(coverage)} покриття).`,
      rootCause: 'Немає пріоритезації: термінові й планові заявки йдуть однією чергою.',
      actions: [
        { text: 'Виділити планові ТО в окремий графік, щоб вони не займали чергу аварійних робіт', owner: 'Сервісна служба' },
        { text: 'Перевірити типи робіт із найдовшим циклом на вкладці «Сервіс»', owner: 'Регіональний керівник' },
      ],
      metric: { label: 'Час виконання', current: days(kpi.avgLeadDays), target: '< 7 дн', unit: 'дн' },
      impact: { type: 'days', value: Math.round((kpi.avgLeadDays - 7) * 10) / 10, text: `скорочення до 7 дн звільнить ресурс на додаткові заявки` },
      confidence: coverage < 60 ? 'low' : confidenceFor(kpi.leadSamples),
      sampleSize: kpi.leadSamples,
      caveat: coverage < 60
        ? `Обережно: дата виконання відсутня у ${100 - Math.round(coverage)}% виконаних заявок, тому середнє може бути зсунуте.`
        : null,
      link: { tab: 'service' },
    }));
  }

  if (kpi.tasks >= MIN_SAMPLES.conversion && kpi.rejectionRate > 5) {
    out.push(rec({
      id: 'service.rejections',
      dept: 'service',
      category: 'Якість',
      severity: kpi.rejectionRate > 12 ? 'high' : 'medium',
      title: `Відмов при узгодженні ${pct(kpi.rejectionRate)}`,
      finding: `${kpi.rejected} заявок отримали відмову складу або бухгалтерії — це ${pct(kpi.rejectionRate)} усіх заявок періоду.`,
      rootCause: 'Заявка йде на узгодження з неповними даними: немає підтверджуючих документів, розбіжність по матеріалах або сумі.',
      actions: [
        { text: 'Зібрати причини відмов з полів «Опис відмови» та скласти чек-лист перед відправкою на узгодження', owner: 'Сервісна служба' },
        { text: 'Додати обов\'язкову перевірку матеріалів і суми перед переведенням у «Виконано»', owner: 'Адміністратор' },
      ],
      metric: { label: 'Частка відмов', current: pct(kpi.rejectionRate), target: '< 3%', unit: '%' },
      impact: { type: 'count', value: kpi.rejected, text: 'кожна відмова = повторний цикл узгодження' },
      confidence: confidenceFor(kpi.tasks, { high: 100, medium: 30 }),
      sampleSize: kpi.tasks,
      link: { tab: 'process' },
    }));
  }

  // Регіони: порівнюємо лише за середнім чеком і маржинальністю, а не за абсолютним
  // доходом — інакше маленький регіон завжди «найгірший» просто через розмір.
  const regions = (service.byRegion || []).filter((r) => r.completed >= MIN_SAMPLES.region);
  if (regions.length >= 3) {
    const avgTicket = regions.reduce((s, r) => s + r.avgTicket, 0) / regions.length;
    const weakest = [...regions].sort((a, b) => a.avgTicket - b.avgTicket)[0];
    if (weakest && avgTicket > 0 && weakest.avgTicket < avgTicket * 0.6) {
      const uplift = (avgTicket - weakest.avgTicket) * weakest.completed;
      out.push(rec({
        id: 'service.region_ticket',
        dept: 'service',
        category: 'Регіони',
        severity: 'medium',
        title: `Низький середній чек у регіоні ${weakest.name}`,
        finding: `Середній чек ${money(weakest.avgTicket)} проти ${money(avgTicket)} по інших регіонах (${weakest.completed} виконаних заявок).`,
        rootCause: 'Інша структура робіт: переважають дрібні виїзди без матеріалів, або занижені прайси на місці.',
        actions: [
          { text: `Порівняти структуру типів робіт у ${weakest.name} з найсильнішим регіоном`, owner: 'Регіональний керівник' },
          { text: 'Перевірити, чи всі матеріали та транспорт включаються в суму послуги', owner: 'Бух. рахунки' },
        ],
        metric: { label: 'Середній чек', current: money(weakest.avgTicket), target: money(avgTicket), unit: '₴' },
        impact: { type: 'money', value: uplift, text: `вирівнювання до середнього ≈ ${money(uplift)} за період` },
        confidence: confidenceFor(weakest.completed),
        sampleSize: weakest.completed,
        link: { tab: 'service' },
      }));
    }
  }

  // Типи робіт із найдовшим циклом — лише там, де вибірка дозволяє висновок.
  const slowWork = (service.byWorkType || [])
    .filter((w) => w.completed >= MIN_SAMPLES.workType && w.avgLeadDays != null && w.avgLeadDays > 10 && w.name !== 'Не вказано')
    .sort((a, b) => b.avgLeadDays - a.avgLeadDays)[0];
  if (slowWork) {
    out.push(rec({
      id: 'service.slow_work_type',
      dept: 'service',
      category: 'Продуктивність',
      severity: 'medium',
      title: `Тип робіт «${slowWork.name}» виконується ${days(slowWork.avgLeadDays)}`,
      finding: `${slowWork.completed} заявок цього типу, середній цикл ${days(slowWork.avgLeadDays)}, середній чек ${money(slowWork.avgTicket)}.`,
      rootCause: 'Такі роботи вимагають запчастин або узгодження з клієнтом, чого немає в стандартному процесі.',
      actions: [
        { text: `Розкласти цикл «${slowWork.name}» на кроки і знайти, де саме втрачається час`, owner: 'Сервісна служба' },
        { text: 'Якщо причина — запчастини, завести їх у мінімальний складський запас', owner: 'Відділ закупівель' },
      ],
      metric: { label: 'Цикл', current: days(slowWork.avgLeadDays), target: '< 10 дн', unit: 'дн' },
      impact: { type: 'count', value: slowWork.completed, text: 'заявок на рік проходять через цей цикл' },
      confidence: confidenceFor(slowWork.completed, { high: 25, medium: 8 }),
      sampleSize: slowWork.completed,
      link: { tab: 'service' },
    }));
  }

  // Навантаження інженерів: рахуємо по частках заявок, а не по «участях».
  const engineers = (service.byEngineer || []).filter((e) => e.completed > 0);
  if (engineers.length >= 4) {
    const shares = engineers.map((e) => e.taskShare);
    const avgShare = shares.reduce((a, b) => a + b, 0) / shares.length;
    const top = engineers[0];
    const topShareOfTotal = avgShare > 0 ? top.taskShare / (avgShare * engineers.length) : 0;
    if (topShareOfTotal > 0.35 && engineers.length >= 5) {
      out.push(rec({
        id: 'service.engineer_load',
        dept: 'service',
        category: 'Команда',
        severity: 'medium',
        title: `Навантаження зосереджене на одному інженері`,
        finding: `${top.name} закриває ${pct(topShareOfTotal * 100)} усіх заявок (${top.completed} заявок) при ${engineers.length} активних інженерах.`,
        rootCause: 'Складні заявки за звичкою призначають одному спеціалісту — решта команди не набирає досвіду.',
        actions: [
          { text: 'Ввести парне призначення: досвідчений інженер + той, хто набирає практику', owner: 'Регіональний керівник' },
          { text: `Перевірити ризик: під час відсутності ${top.name} черга зупиниться`, owner: 'Сервісна служба' },
        ],
        metric: { label: 'Частка одного інженера', current: pct(topShareOfTotal * 100), target: '< 30%', unit: '%' },
        impact: { type: 'count', value: top.completed, text: 'заявок залежать від однієї людини' },
        confidence: confidenceFor(kpi.completed, { high: 60, medium: 20 }),
        sampleSize: kpi.completed,
        link: { tab: 'service' },
      }));
    }
  }

  // Оператори: нерівномірність приймання заявок.
  const operators = (service.byOperator || []).filter((o) => o.name !== 'Без автора');
  const operatorTotal = operators.reduce((s, o) => s + o.tasks, 0);
  if (operators.length >= 2 && operatorTotal >= MIN_SAMPLES.operator) {
    const top = operators[0];
    const shareOfTop = (top.tasks / operatorTotal) * 100;
    if (shareOfTop > 70) {
      out.push(rec({
        id: 'service.operator_load',
        dept: 'service',
        category: 'Команда',
        severity: 'medium',
        title: `Заявки приймає переважно ${top.name}`,
        finding: `${top.name} створив ${top.tasks} з ${operatorTotal} заявок (${pct(shareOfTop)}) при ${operators.length} активних авторах.`,
        rootCause: 'Немає графіка чергування або решта операторів не мають доступу/навички приймати заявки.',
        actions: [
          { text: 'Скласти графік чергування прийому заявок', owner: 'Регіональний керівник' },
          { text: 'Перевірити, чи в усіх операторів є доступ до створення заявки', owner: 'Адміністратор' },
        ],
        metric: { label: 'Частка одного оператора', current: pct(shareOfTop), target: '< 60%', unit: '%' },
        impact: { type: 'count', value: top.tasks, text: 'заявок залежать від одного оператора' },
        confidence: confidenceFor(operatorTotal),
        sampleSize: operatorTotal,
        caveat: (dq.missingAuthor || 0) > 0
          ? `У ${dq.missingAuthor} заявок автор не вказаний — вони не враховані в розподілі.`
          : null,
        link: { tab: 'service' },
      }));
    }
  }

  return out;
}

/* ─────────────────────── Правила: фінанси та маржа ─────────────────────── */

function financeRules({ service, finance }) {
  const out = [];
  if (!finance) return out;
  const kpi = service?.kpi || {};
  const cost = finance.costSummary || {};

  if (kpi.completed >= MIN_SAMPLES.margin && cost.marginRate < 30 && finance.revenue > 0) {
    const target = 30;
    const gapMoney = ((target - cost.marginRate) / 100) * finance.revenue;
    out.push(rec({
      id: 'finance.margin',
      dept: 'finance',
      category: 'Юніт-економіка',
      severity: cost.marginRate < 15 ? 'high' : 'medium',
      title: `Маржа сервісу ${pct(cost.marginRate)}`,
      finding: `Дохід ${money(finance.revenue)}, матеріали ${money(cost.materials)}, супутні витрати ${money(cost.expenses)} → маржа ${money(cost.margin)} (${pct(cost.marginRate)}).`,
      rootCause: 'Прайс на роботи не перекриває транспорт, добові та премії — вони не входять у розрахунок ціни виїзду.',
      actions: [
        { text: 'Перевірити найдорожчі складові в структурі витрат на вкладці «Фінанси»', owner: 'Фінансовий відділ' },
        { text: 'Переглянути коефіцієнти розрахунку послуги з урахуванням транспорту й добових', owner: 'Фінансовий відділ' },
      ],
      metric: { label: 'Маржинальність', current: pct(cost.marginRate), target: `> ${target}%`, unit: '%' },
      impact: { type: 'money', value: gapMoney, text: `вихід на ${target}% маржі ≈ ${money(gapMoney)} за період` },
      confidence: confidenceFor(kpi.completed, { high: 50, medium: 15 }),
      sampleSize: kpi.completed,
      link: { tab: 'finance' },
    }));
  }

  const topCost = (finance.costStructure || [])
    .filter((c) => c.share > 0)
    .sort((a, b) => b.share - a.share)[0];
  if (topCost && topCost.share > 25) {
    out.push(rec({
      id: 'finance.cost_concentration',
      dept: 'finance',
      category: 'Витрати',
      severity: topCost.share > 40 ? 'high' : 'medium',
      title: `${topCost.label} — ${pct(topCost.share)} доходу`,
      finding: `Найбільша складова собівартості: ${topCost.label}, ${money(topCost.amount)} або ${pct(topCost.share)} від доходу.`,
      rootCause: topCost.group === 'materials'
        ? 'Закупівля дрібними партіями під конкретну заявку замість планового поповнення складу.'
        : 'Логістика та виїзди не оптимізовані: кілька заявок в одному регіоні обслуговуються окремими виїздами.',
      actions: topCost.group === 'materials'
        ? [
          { text: `Вивести ${topCost.label.toLowerCase()} в плановий складський запас і закуповувати партіями`, owner: 'Відділ закупівель' },
          { text: 'Порівняти ціни постачальників по цій позиції', owner: 'Відділ закупівель' },
        ]
        : [
          { text: 'Групувати заявки одного регіону в один виїзд', owner: 'Сервісна служба' },
          { text: 'Перевірити, чи транспортні витрати перевиставляються клієнту', owner: 'Бух. рахунки' },
        ],
      metric: { label: 'Частка доходу', current: pct(topCost.share), target: '< 25%', unit: '%' },
      impact: { type: 'money', value: topCost.amount * 0.1, text: `економія 10% на цій статті ≈ ${money(topCost.amount * 0.1)}` },
      confidence: confidenceFor(kpi.completed, { high: 50, medium: 15 }),
      sampleSize: kpi.completed,
      link: { tab: 'finance' },
    }));
  }

  const losses = finance.losses?.list || [];
  const lossCount = finance.losses?.tasks || losses.length;
  if (lossCount >= 3) {
    const lossSum = Math.abs(finance.losses?.margin || losses.reduce((s, t) => s + Math.abs(t.margin), 0));
    out.push(rec({
      id: 'finance.loss_makers',
      dept: 'finance',
      category: 'Збиткові заявки',
      severity: 'high',
      title: `${lossCount} заявок виконані у збиток`,
      finding: `Витрати перевищують суму послуги. Сумарний збиток ${money(lossSum)}${losses[0] ? `, найгірша заявка — ${losses[0].number} (${money(losses[0].margin)})` : ''}.`,
      rootCause: 'Ціна узгоджена до того, як стало відомо обсяг матеріалів і транспорту, і не переглядалась після виконання.',
      actions: [
        { text: 'Розібрати список збиткових заявок і виявити спільну ознаку: клієнт, регіон, тип робіт', owner: 'Фінансовий відділ' },
        { text: 'Для повторюваних випадків переглянути прайс або умови договору', owner: 'Фінансовий відділ' },
      ],
      metric: { label: 'Збиткових заявок', current: String(lossCount), target: '0', unit: 'шт' },
      impact: { type: 'money', value: lossSum, text: `прямий збиток ${money(lossSum)}` },
      evidence: losses.length
        ? {
          count: lossCount,
          columns: ['№ заявки', 'Клієнт', 'Дохід', 'Маржа'],
          items: losses.slice(0, 10).map((t) => ({
            number: t.number, client: t.client, revenue: t.revenue, margin: t.margin,
          })),
        }
        : null,
      confidence: 'high',
      sampleSize: kpi.completed,
      link: { tab: 'finance' },
    }));
  }

  /**
   * Закрито без суми — це не збиток, а незаповнена оплата. Окреме правило:
   * інакше такі заявки або тонули в «збитках», або взагалі не помічались,
   * хоча саме вони спотворюють усю фінансову картину.
   */
  const unbilled = finance.unbilled || {};
  if (unbilled.tasks >= 3 && kpi.completed > 0) {
    const share = (unbilled.tasks / kpi.completed) * 100;
    out.push(rec({
      id: 'finance.unbilled_closed',
      dept: 'finance',
      category: 'Заповнення сум',
      severity: share >= 15 ? 'critical' : share >= 5 ? 'high' : 'medium',
      title: `${unbilled.tasks} виконаних заявок без суми послуги`,
      finding: `Це ${pct(share)} виконаних заявок періоду. У ${unbilled.withCost} з них уже списані матеріали та витрати на ${money(unbilled.cost)}, тобто витрати проведені, а дохід — ні.`,
      rootCause: 'Поле загальної суми не обов’язкове при закритті заявки, тому заявку можна завершити, не вписавши, скільки вона коштувала клієнту.',
      actions: [
        { text: 'Пройти список і вписати суми — це напряму збільшить видимий дохід періоду', owner: 'Бухгалтерія' },
        { text: 'Зробити суму послуги обов’язковою при переведенні заявки у «Виконано»', owner: 'Адміністратор' },
      ],
      metric: { label: 'Частка виконаних без суми', current: pct(share), target: '0%', unit: '' },
      impact: {
        type: 'money',
        value: unbilled.cost,
        text: `витрати ${money(unbilled.cost)} без відповідного доходу`,
      },
      evidence: {
        count: unbilled.tasks,
        columns: ['№ заявки', 'Клієнт', 'Матеріали', 'Витрати'],
        items: (unbilled.list || []).slice(0, 10).map((t) => ({
          number: t.number, client: t.client, materials: t.materials, expenses: t.expenses,
        })),
      },
      confidence: 'high',
      sampleSize: kpi.completed,
      link: { tab: 'finance' },
    }));
  }

  const recv = finance.receivables || {};
  const overdue = (recv.buckets || []).filter((b) => b.from >= 60).reduce((s, b) => s + b.amount, 0);
  if (overdue > 0 && recv.total?.amount > 0) {
    const shareOverdue = (overdue / recv.total.amount) * 100;
    out.push(rec({
      id: 'finance.receivables_aging',
      dept: 'finance',
      category: 'Дебіторка',
      severity: shareOverdue > 40 ? 'critical' : shareOverdue > 20 ? 'high' : 'medium',
      title: `Дебіторка понад 60 днів: ${money(overdue)}`,
      finding: `Разом не оплачено ${money(recv.total.amount)} по ${recv.total.count} виконаних заявках. З них ${money(overdue)} (${pct(shareOverdue)}) старші 60 днів`
        + `${recv.total.maxAgeDays != null ? `, найстаріша — ${days(recv.total.maxAgeDays)}` : ''}.`,
      rootCause: 'Немає регулярного контролю віку заборгованості: оплата відслідковується по факту надходження, а не за строком.',
      actions: [
        { text: 'Опрацювати список найбільших боржників на вкладці «Фінанси»', owner: 'Бух. рахунки' },
        { text: 'Ввести щотижневий перегляд дебіторки за віковими кошиками', owner: 'Фінансовий відділ' },
        { text: 'Для боргів понад 90 днів — рішення про претензійну роботу', owner: 'Фінансовий відділ' },
      ],
      metric: { label: 'Прострочено 60+ дн', current: money(overdue), target: money(0), unit: '₴' },
      impact: { type: 'money', value: overdue, text: `${money(overdue)} виведено з обігу` },
      evidence: recv.topDebtors?.length
        ? {
          count: recv.topDebtors.length,
          columns: ['Клієнт', 'Сума', 'Заявок', 'Найстаріша'],
          items: recv.topDebtors.slice(0, 10).map((d) => ({
            client: d.name, amount: d.amount, tasks: d.tasks, days: d.oldestDays,
          })),
        }
        : null,
      confidence: 'high',
      sampleSize: recv.total.count,
      link: { tab: 'finance' },
    }));
  }

  const invoices = finance.invoices || {};
  if ((invoices.staleOpen || 0) >= 3) {
    out.push(rec({
      id: 'finance.invoice_stale',
      dept: 'finance',
      category: 'Документообіг',
      severity: invoices.staleOpen >= 15 ? 'high' : 'medium',
      title: `${invoices.staleOpen} запитів на рахунок старші 7 днів`,
      finding: `Відкритих запитів ${invoices.open}, з них ${invoices.staleOpen} чекають довше тижня`
        + `${invoices.maxOpenAgeDays != null ? `, найстаріший — ${days(invoices.maxOpenAgeDays)}` : ''}.`
        + `${invoices.avgTurnaroundDays != null ? ` Середній час опрацювання закритих запитів — ${days(invoices.avgTurnaroundDays)}.` : ''}`,
      rootCause: 'Запити обробляються не за чергою надходження, а за зручністю — старі зависають.',
      actions: [
        { text: 'Сортувати чергу рахунків за датою створення та закрити найстаріші', owner: 'Бух. рахунки' },
      ],
      metric: { label: 'Прострочених запитів', current: String(invoices.staleOpen), target: '0', unit: 'шт' },
      impact: { type: 'count', value: invoices.staleOpen, text: 'затримка виставлення рахунків клієнтам' },
      confidence: 'high',
      sampleSize: invoices.total || invoices.open,
      link: { tab: 'finance' },
    }));
  }

  if (kpi.completed >= MIN_SAMPLES.margin && kpi.collectedRate < 60 && kpi.revenue > 0) {
    out.push(rec({
      id: 'finance.collection',
      dept: 'finance',
      category: 'Збір коштів',
      severity: kpi.collectedRate < 35 ? 'high' : 'medium',
      title: `Оплачено лише ${pct(kpi.collectedRate)} виконаних робіт`,
      finding: `З ${money(kpi.revenue)} виконаних робіт періоду відмічено оплату на ${money(kpi.paidRevenue)}; без дати оплати — ${money(kpi.unpaidRevenue)}.`,
      rootCause: 'Дата оплати заповнюється не завжди — частина цих робіт може бути оплачена, але не відмічена в системі.',
      actions: [
        { text: 'Звірити банківські надходження та заповнити «Дата оплати» в заявках', owner: 'Бух. рахунки' },
        { text: 'Зробити заповнення дати оплати частиною закриття місяця', owner: 'Фінансовий відділ' },
      ],
      metric: { label: 'Зібрано', current: pct(kpi.collectedRate), target: '> 80%', unit: '%' },
      impact: { type: 'money', value: kpi.unpaidRevenue, text: `${money(kpi.unpaidRevenue)} без підтвердженої оплати` },
      confidence: 'medium',
      sampleSize: kpi.completed,
      caveat: 'Показник залежить від дисципліни заповнення поля «Дата оплати», а не лише від реального збору коштів.',
      link: { tab: 'finance' },
    }));
  }

  return out;
}

/* ──────────────────────── Правила: відділ продажів ──────────────────────── */

function salesRules({ sales }) {
  const out = [];
  if (!sales) return out;
  const kpi = sales.kpi || {};
  const leads = sales.leads || {};

  if (kpi.deals >= MIN_SAMPLES.sales && kpi.winRate < 40) {
    out.push(rec({
      id: 'sales.win_rate',
      dept: 'sales',
      category: 'Воронка продажів',
      severity: kpi.winRate < 20 ? 'high' : 'medium',
      title: `Конверсія угод ${pct(kpi.winRate)}`,
      finding: `З ${kpi.deals} угод періоду закрито успішно ${kpi.won}, скасовано ${kpi.lost}. В роботі залишається ${money(kpi.openAmount)}.`,
      rootCause: 'Угоди довго висять на етапі переговорів без наступного кроку.',
      actions: [
        { text: 'Розібрати угоди без руху понад 30 днів (вкладка «Продажі»)', owner: 'Менеджери' },
        { text: 'Для кожної відкритої угоди зафіксувати дату наступного контакту', owner: 'Менеджери' },
      ],
      metric: { label: 'Win rate', current: pct(kpi.winRate), target: '> 40%', unit: '%' },
      impact: { type: 'money', value: kpi.openAmount, text: `${money(kpi.openAmount)} у незакритих угодах` },
      confidence: confidenceFor(kpi.deals, { high: 40, medium: 10 }),
      sampleSize: kpi.deals,
      link: { tab: 'sales' },
    }));
  }

  if ((sales.stalled || []).length >= 3) {
    const stalledSum = sales.stalled.reduce((s, d) => s + (d.amount || 0), 0);
    out.push(rec({
      id: 'sales.stalled',
      dept: 'sales',
      category: 'Воронка продажів',
      severity: 'medium',
      title: `${sales.stalled.length} угод без руху понад 30 днів`,
      finding: `Угоди на етапах первинного контакту, КП та переговорів не оновлювались більше місяця. Сумарно ${money(stalledSum)}.`,
      rootCause: 'Немає нагадувань про наступний контакт — угода залишається в статусі, поки менеджер сам про неї не згадає.',
      actions: [
        { text: 'Пройтись по списку і або рухати угоду далі, або переводити в «Скасовано»', owner: 'Менеджери' },
        { text: 'Ввести правило: угода без активності 21 день піднімається керівнику', owner: 'Відділ продаж — бухгалтерія' },
      ],
      metric: { label: 'Застиглих угод', current: String(sales.stalled.length), target: '0', unit: 'шт' },
      impact: { type: 'money', value: stalledSum, text: `${money(stalledSum)} у застиглій воронці` },
      evidence: {
        count: sales.stalled.length,
        columns: ['№ угоди', 'Клієнт', 'Сума', 'Днів'],
        items: sales.stalled.slice(0, 10).map((d) => ({
          number: d.number, client: d.client, amount: d.amount, days: d.days,
        })),
      },
      confidence: 'high',
      sampleSize: kpi.deals,
      link: { tab: 'sales' },
    }));
  }

  if ((sales.premiumQueue || []).length >= 3) {
    const premiumSum = sales.premiumQueue.reduce((s, d) => s + (d.premium || 0), 0);
    out.push(rec({
      id: 'sales.premium_queue',
      dept: 'sales',
      category: 'Мотивація',
      severity: 'medium',
      title: `${sales.premiumQueue.length} премій менеджерам не нараховано`,
      finding: `Угоди закриті успішно, але премія ще не затверджена бухгалтерією відділу продажів. Сумарно ${money(premiumSum)}.`,
      rootCause: 'Затвердження премії — окремий ручний крок після закриття угоди, і він не має строку.',
      actions: [
        { text: 'Опрацювати чергу затвердження премій', owner: 'Відділ продаж — бухгалтерія' },
        { text: 'Прив\'язати нарахування премії до закриття місяця', owner: 'Фінансовий відділ' },
      ],
      metric: { label: 'Премій в черзі', current: String(sales.premiumQueue.length), target: '0', unit: 'шт' },
      impact: { type: 'money', value: premiumSum, text: `${money(premiumSum)} невиплаченої мотивації` },
      confidence: 'high',
      sampleSize: kpi.won,
      link: { tab: 'sales' },
    }));
  }

  if (leads.total >= MIN_SAMPLES.leads) {
    if (leads.unassigned >= 5) {
      const share = (leads.unassigned / leads.total) * 100;
      out.push(rec({
        id: 'sales.leads_unassigned',
        dept: 'sales',
        category: 'Ліди',
        severity: share > 40 ? 'high' : 'medium',
        title: `${leads.unassigned} лідів без менеджера`,
        finding: `З ${leads.total} лідів періоду ${leads.unassigned} (${pct(share)}) не призначені жодному менеджеру.`
          + `${leads.avgAssignDays != null ? ` Середній час до призначення — ${days(leads.avgAssignDays)}.` : ''}`,
        rootCause: 'Розподіл лідів ручний, тому нічні та вихідні заявки чекають до наступного робочого дня і далі.',
        actions: [
          { text: 'Розібрати нерозподілені ліди в панелі «Маркетинговий відділ»', owner: 'Маркетинговий відділ' },
          { text: 'Налаштувати автопризначення лідів за регіоном або чергою', owner: 'Адміністратор' },
        ],
        metric: { label: 'Без менеджера', current: pct(share), target: '< 10%', unit: '%' },
        impact: { type: 'count', value: leads.unassigned, text: 'лідів не отримали контакту' },
        confidence: 'high',
        sampleSize: leads.total,
        link: { tab: 'sales' },
      }));
    }

    if (leads.conversionRate < 10) {
      const bestSource = (leads.bySource || [])
        .filter((s) => s.count >= 10)
        .sort((a, b) => b.conversionRate - a.conversionRate)[0];
      out.push(rec({
        id: 'sales.lead_conversion',
        dept: 'sales',
        category: 'Ліди',
        severity: leads.conversionRate < 3 ? 'high' : 'medium',
        title: `Конверсія лідів ${pct(leads.conversionRate)}`,
        finding: `${leads.converted} з ${leads.total} лідів стали клієнтами. Відмов і спаму — ${leads.rejected}.`
          + `${bestSource ? ` Найкраще конвертує «${bestSource.label}» — ${pct(bestSource.conversionRate)}.` : ''}`,
        rootCause: 'Трафік і якість ліда не збігаються: канали приводять звернення поза цільовим сегментом.',
        actions: [
          bestSource
            ? { text: `Перерозподілити бюджет у бік «${bestSource.label}» — там конверсія найвища`, owner: 'Маркетинговий відділ' }
            : { text: 'Порівняти конверсію за джерелами та кампаніями на вкладці «Продажі»', owner: 'Маркетинговий відділ' },
          { text: 'Перевірити швидкість першого контакту — вона найсильніше впливає на конверсію', owner: 'Менеджери' },
        ],
        metric: { label: 'Конверсія лідів', current: pct(leads.conversionRate), target: '> 10%', unit: '%' },
        impact: { type: 'count', value: leads.total - leads.converted, text: 'лідів не дійшли до угоди' },
        confidence: confidenceFor(leads.total, { high: 100, medium: 30 }),
        sampleSize: leads.total,
        link: { tab: 'sales' },
      }));
    }
  }

  return out;
}

/* ─────────────────────── Правила: склад і закупівлі ─────────────────────── */

function supplyRules({ supply }) {
  const out = [];
  if (!supply) return out;
  const eq = supply.equipment;
  const proc = supply.procurement;
  const ved = supply.ved;

  if (eq?.expiringReservations?.length >= 3) {
    const expired = eq.expiringReservations.filter((r) => r.expired);
    out.push(rec({
      id: 'supply.reservations',
      dept: 'supply',
      category: 'Резерви',
      severity: expired.length >= 5 ? 'high' : 'medium',
      title: expired.length
        ? `${expired.length} резервів прострочено, ще ${eq.expiringReservations.length - expired.length} закінчуються`
        : `${eq.expiringReservations.length} резервів закінчуються протягом 2 тижнів`,
      finding: `Обладнання під резервом блокує продажі. Прострочених резервів — ${expired.length}, тих, що спливають найближчими днями — ${eq.expiringReservations.length - expired.length}.`,
      rootCause: 'Резерв ставиться під очікувану угоду і не знімається, коли угода не відбулась.',
      actions: [
        { text: 'Пройтись по прострочених резервах і зняти ті, під якими немає активної угоди', owner: 'Менеджери' },
        { text: 'Увімкнути автоматичне зняття резерву після закінчення строку', owner: 'Адміністратор' },
      ],
      metric: { label: 'Прострочених резервів', current: String(expired.length), target: '0', unit: 'шт' },
      impact: { type: 'count', value: eq.expiringReservations.length, text: 'позицій недоступні для продажу' },
      evidence: {
        count: eq.expiringReservations.length,
        columns: ['Позиція', 'Клієнт', 'Склад', 'Днів'],
        items: eq.expiringReservations.slice(0, 10).map((r) => ({
          name: r.name, client: r.client, warehouse: r.warehouse, days: r.daysLeft,
        })),
      },
      confidence: 'high',
      sampleSize: eq.totals?.reserved || eq.expiringReservations.length,
      link: { tab: 'supply' },
    }));
  }

  if (eq?.totals?.noPrice >= 5) {
    const share = eq.totals.positions > 0 ? (eq.totals.noPrice / eq.totals.positions) * 100 : 0;
    out.push(rec({
      id: 'supply.no_price',
      dept: 'supply',
      category: 'Оцінка складу',
      severity: share > 30 ? 'high' : 'medium',
      title: `${eq.totals.noPrice} позицій складу без ціни`,
      finding: `${eq.totals.noPrice} з ${eq.totals.positions} позицій (${pct(share)}) не мають закупівельної ціни, тому вартість складу ${money(eq.totals.value)} занижена.`,
      rootCause: 'Позиції заводяться при надходженні без ціни — її дозаповнюють пізніше або не заповнюють зовсім.',
      actions: [
        { text: 'Дозаповнити закупівельні ціни для позицій на складі', owner: 'Складський облік' },
        { text: 'Зробити ціну обов\'язковою при оприбуткуванні', owner: 'Адміністратор' },
      ],
      metric: { label: 'Без ціни', current: pct(share), target: '< 5%', unit: '%' },
      impact: { type: 'count', value: eq.totals.noPrice, text: 'вартість складу не піддається оцінці' },
      confidence: 'high',
      sampleSize: eq.totals.positions,
      link: { tab: 'supply' },
    }));
  }

  if ((proc?.totals?.staleOpen || 0) >= 3) {
    out.push(rec({
      id: 'supply.procurement_stale',
      dept: 'supply',
      category: 'Закупівлі',
      severity: proc.totals.staleOpen >= 10 ? 'high' : 'medium',
      title: `${proc.totals.staleOpen} заявок на закупівлю відкриті понад 14 днів`,
      finding: `Всього заявок за період ${proc.totals.requests}, відкритих ${proc.totals.open}, з них ${proc.totals.staleOpen} довше 2 тижнів`
        + `${proc.totals.maxOpenDays != null ? `, найстаріша — ${days(proc.totals.maxOpenDays)}` : ''}.`
        + `${proc.totals.avgCycleDays != null ? ` Середній цикл закритих — ${days(proc.totals.avgCycleDays)}.` : ''}`,
      rootCause: 'Заявки без чіткого пріоритету обробляються в порядку появи, а заблоковані позиції не мають окремої черги.',
      actions: [
        { text: 'Розібрати найстаріші заявки на вкладці «Склад і закупівлі»', owner: 'Відділ закупівель' },
        { text: `Опрацювати ${proc.totals.blocked} заблокованих заявок — саме вони найдовше стоять`, owner: 'Відділ закупівель' },
      ],
      metric: { label: 'Прострочених заявок', current: String(proc.totals.staleOpen), target: '0', unit: 'шт' },
      impact: { type: 'count', value: proc.totals.staleOpen, text: 'сервіс і склад чекають матеріали' },
      evidence: proc.oldestOpen?.length
        ? {
          count: proc.oldestOpen.length,
          columns: ['№', 'Статус', 'Заявник', 'Днів'],
          items: proc.oldestOpen.slice(0, 10).map((p) => ({
            number: p.number, status: p.statusLabel, requester: p.requester, days: p.days,
          })),
        }
        : null,
      confidence: 'high',
      sampleSize: proc.totals.requests,
      link: { tab: 'supply' },
    }));
  }

  if ((ved?.totals?.withoutProposals || 0) >= 3) {
    out.push(rec({
      id: 'supply.ved_no_proposals',
      dept: 'supply',
      category: 'ВЕД',
      severity: 'medium',
      title: `${ved.totals.withoutProposals} запитів ВЕД без жодної пропозиції`,
      finding: `З ${ved.totals.requests} запитів на імпорт ${ved.totals.withoutProposals} не мають жодної пропозиції постачальника. Середня кількість пропозицій на запит — ${ved.totals.avgProposals.toFixed(1)}.`,
      rootCause: 'Запит створюється без достатніх технічних вимог, тому підбір постачальника не стартує.',
      actions: [
        { text: 'Перевірити, чи в цих запитах заповнені технічні вимоги', owner: 'Відділ ВЕД' },
        { text: 'Задати мінімум 3 пропозиції як умову закриття запиту', owner: 'Відділ ВЕД' },
      ],
      metric: { label: 'Без пропозицій', current: String(ved.totals.withoutProposals), target: '0', unit: 'шт' },
      impact: { type: 'count', value: ved.totals.withoutProposals, text: 'запити не рухаються' },
      confidence: 'medium',
      sampleSize: ved.totals.requests,
      link: { tab: 'supply' },
    }));
  }

  const openTesting = (eq?.testing || []).filter((t) => ['requested', 'in_progress'].includes(t.status));
  const openTestingCount = openTesting.reduce((s, t) => s + t.count, 0);
  const maxOpen = Math.max(0, ...openTesting.map((t) => t.maxOpenDays || 0));
  if (openTestingCount >= 3 && maxOpen > 14) {
    out.push(rec({
      id: 'supply.testing_backlog',
      dept: 'supply',
      category: 'Тестування',
      severity: 'medium',
      title: `${openTestingCount} одиниць очікують тестування, найдовше ${days(maxOpen)}`,
      finding: `Обладнання зі статусом «Заявка на тест» або «Тестується» — ${openTestingCount} одиниць. Найдовше очікування ${days(maxOpen)}.`,
      rootCause: 'Тестування конкурує за час інженерів із сервісними заявками і завжди програє за пріоритетом.',
      actions: [
        { text: 'Виділити фіксований слот часу на тестування', owner: 'Відділ тестування' },
        { text: 'Перевірити, чи не блокує тестування відвантаження проданого обладнання', owner: 'Зав. склад' },
      ],
      metric: { label: 'Найдовше очікування', current: days(maxOpen), target: '< 14 дн', unit: 'дн' },
      impact: { type: 'count', value: openTestingCount, text: 'одиниць не готові до продажу' },
      confidence: 'medium',
      sampleSize: openTestingCount,
      link: { tab: 'supply' },
    }));
  }

  return out;
}

/* ─────────────────────────── Позитивні висновки ─────────────────────────── */

function strengthRules({ service, finance, process: proc }) {
  const out = [];
  const kpi = service?.kpi || {};
  const cost = finance?.costSummary || {};

  if (kpi.tasks >= MIN_SAMPLES.conversion && kpi.conversionRate >= 85) {
    out.push({
      id: 'good.conversion',
      title: `Конверсія ${pct(kpi.conversionRate)}`,
      detail: `${kpi.completed} з ${kpi.tasks} заявок доведені до виконання.`,
    });
  }
  if (kpi.avgLeadDays != null && kpi.avgLeadDays <= 5 && kpi.leadSamples >= MIN_SAMPLES.leadTime) {
    out.push({
      id: 'good.lead_time',
      title: `Швидке виконання — ${days(kpi.avgLeadDays)}`,
      detail: `Розрахунок по ${kpi.leadSamples} заявках із заповненою датою виконання.`,
    });
  }
  if (cost.marginRate >= 40 && kpi.completed >= MIN_SAMPLES.margin) {
    out.push({
      id: 'good.margin',
      title: `Маржа ${pct(cost.marginRate)}`,
      detail: `${money(cost.margin)} при доході ${money(finance.revenue)}.`,
    });
  }
  if (kpi.closeRate >= 90 && kpi.completed >= MIN_SAMPLES.margin) {
    out.push({
      id: 'good.close_rate',
      title: `Узгодження закриває ${pct(kpi.closeRate)} виконаних заявок`,
      detail: `${kpi.approvedFull} заявок підтверджені і складом, і бухгалтерією.`,
    });
  }
  if ((proc?.live?.stuckTotal || 0) === 0 && (proc?.live?.active || 0) > 0) {
    out.push({
      id: 'good.no_stuck',
      title: 'У чергах немає зависших заявок',
      detail: `${proc.live.active} заявок у процесі, усі в межах нормативів.`,
    });
  }
  return out;
}

const RULE_GROUPS = [
  dataQualityRules,
  processRules,
  serviceRules,
  financeRules,
  salesRules,
  supplyRules,
];

const HEALTH_WEIGHT = { critical: 14, high: 8, medium: 3, low: 1 };
const HEALTH_DECAY = 0.85;

/**
 * Штраф до оцінки «здоров'я» зі спаданням ваги кожної наступної знахідки.
 *
 * Проста сума штрафів не працює: правил багато, і на будь-якій живій базі
 * оцінка миттєво впиралась у нуль — тобто перестала відрізняти «погано» від
 * «катастрофа». Тут найважливіші знахідки враховуються повністю, а кожна
 * наступна дає все менший внесок, тому шкала залишається читабельною.
 */
function healthPenalty(recommendations) {
  const weights = recommendations
    .map((r) => {
      const conf = r.confidence === 'high' ? 1 : r.confidence === 'medium' ? 0.7 : 0.4;
      return (HEALTH_WEIGHT[r.severity] || 1) * conf;
    })
    .sort((a, b) => b - a);

  return weights.reduce((sum, w, i) => sum + w * HEALTH_DECAY ** i, 0);
}

/**
 * @param {object} data { service, process, finance, sales, supply }
 */
function buildBriefing(recommendations, strengths, ctx) {
  const top = recommendations[0];
  const critical = recommendations.filter((r) => r.severity === 'critical' || r.severity === 'high');
  const period = ctx?.period?.label || 'вибраний період';

  if (!top) {
    const good = strengths[0];
    return {
      headline: 'Критичних проблем немає',
      text: good
        ? `${period}: ${good.title}. ${good.detail}`
        : `${period}: правила не знайшли відхилень, які варто розбирати зараз.`,
      focusOwner: null,
      focusDept: null,
    };
  }

  const first = top.actions?.[0];
  const extra = critical.length > 1
    ? ` Ще ${critical.length - 1} питань високої ваги.`
    : recommendations.length > 1
      ? ` Далі в черзі ще ${recommendations.length - 1} висновків.`
      : '';

  return {
    headline: critical.length
      ? `Спочатку: ${top.title}`
      : top.title,
    text: `${top.finding}${first ? ` Перший крок — ${first.text} (${first.owner}).` : ''}${extra}`,
    focusOwner: first?.owner || null,
    focusDept: top.dept,
  };
}

function buildTodayActions(recommendations) {
  const seen = new Set();
  const actions = [];
  for (const r of recommendations) {
    const a = (r.actions || [])[0];
    if (!a?.text || seen.has(a.text)) continue;
    seen.add(a.text);
    actions.push({
      recId: r.id,
      text: a.text,
      owner: a.owner,
      severity: r.severity,
      dept: r.dept,
      deptLabel: r.deptLabel,
      deptIcon: r.deptIcon,
      impact: r.impact,
      link: r.link,
    });
    if (actions.length >= 6) break;
  }
  return actions;
}

function buildOwnerBoard(recommendations) {
  const map = new Map();
  for (const r of recommendations) {
    for (const a of r.actions || []) {
      if (!a?.owner) continue;
      if (!map.has(a.owner)) map.set(a.owner, { owner: a.owner, count: 0, recs: [] });
      const row = map.get(a.owner);
      row.count += 1;
      if (row.recs.length < 3) {
        row.recs.push({ id: r.id, title: r.title, severity: r.severity });
      }
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function buildInsights(data, ctx) {
  const recommendations = [];
  for (const group of RULE_GROUPS) {
    try {
      recommendations.push(...(group(data) || []));
    } catch (error) {
      console.error('[analytics] rule group failed:', error.message);
    }
  }

  recommendations.sort((a, b) => b.score - a.score);

  const byDept = {};
  for (const r of recommendations) {
    byDept[r.dept] = (byDept[r.dept] || 0) + 1;
  }
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const r of recommendations) bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1;

  const moneyAtStake = recommendations
    .filter((r) => r.impact?.type === 'money')
    .reduce((sum, r) => sum + (Number(r.impact.value) || 0), 0);

  const penalty = healthPenalty(recommendations);
  const strengths = strengthRules(data);
  const todayActions = buildTodayActions(recommendations);
  const ownerBoard = buildOwnerBoard(recommendations);

  return {
    generatedAt: new Date().toISOString(),
    basis: ctx?.basis?.label || null,
    healthScore: Math.max(0, Math.min(100, Math.round(100 - penalty))),
    briefing: buildBriefing(recommendations, strengths, ctx),
    todayActions,
    ownerBoard,
    summary: {
      total: recommendations.length,
      byDept,
      bySeverity,
      moneyAtStake: Math.round(moneyAtStake),
    },
    departments: Object.entries(DEPARTMENTS).map(([id, meta]) => ({
      id, ...meta, count: byDept[id] || 0,
    })),
    recommendations,
    strengths,
  };
}

module.exports = { buildInsights, DEPARTMENTS };
