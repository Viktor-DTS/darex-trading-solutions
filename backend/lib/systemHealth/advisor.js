/**
 * Рушій рекомендацій: перетворює сирі метрики на конкретні дії
 * («час переходити на інший план», «додайте індекс», «увімкніть f_auto»).
 *
 * Кожна порада має severity, вимірюваний привід (metric) і дію (action),
 * щоб адміністратор бачив не просто «щось не так», а що саме робити.
 */

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2, good: 3 };

function bytesToGb(bytes) {
  return (Number(bytes || 0) / 1024 ** 3).toFixed(2);
}

function bytesToMb(bytes) {
  return Math.round(Number(bytes || 0) / 1024 / 1024);
}

function make(scope, severity, id, title, detail, action, metric, link) {
  return { id, scope, severity, title, detail, action, metric: metric || null, link: link || null };
}

function renderAdvice(render) {
  const items = [];
  if (!render?.configured) {
    items.push(
      make(
        'render',
        'info',
        'render-not-configured',
        'Render не підключено до аналізу',
        'Без API-ключа панель не бачить CPU, пам\'ять, трафік і статуси деплоїв.',
        'Створіть ключ у Render → Account Settings → API Keys і додайте RENDER_API_KEY в Environment бекенду.',
        null,
        'https://dashboard.render.com/u/settings#api-keys',
      ),
    );
    return items;
  }

  for (const service of render.services || []) {
    const usage = service.usage || {};
    const label = `${service.name} (${service.plan.label})`;

    if (service.plan.key === 'free' && service.type === 'web_service') {
      items.push(
        make(
          'render',
          'warning',
          `render-free-${service.id}`,
          `${service.name}: безкоштовний план присипляє сервіс`,
          'Free-інстанс вимикається після 15 хвилин без запитів, і перший запит після сну чекає 30–60 секунд. Саме це користувачі сприймають як «система гальмує».',
          'Перехід на Starter ($7/міс) прибирає засинання. Як тимчасовий обхід — зовнішній пінг раз на 10 хвилин.',
          { label: 'План', value: service.plan.label },
          service.dashboardUrl,
        ),
      );
    }

    if (usage.memoryPercent != null && usage.memoryPercent >= 85) {
      items.push(
        make(
          'render',
          'critical',
          `render-mem-${service.id}`,
          `${label}: пам'ять на межі`,
          `Використано ${Math.round(usage.memoryPercent)}% від ${usage.memoryLimitMb} МБ (пік ${usage.memoryPeakMb} МБ). За таких значень Render перезапускає інстанс через OOM, і всі активні запити обриваються.`,
          service.nextPlan
            ? `Перейдіть на ${service.nextPlan.label} (${service.nextPlan.memoryMb / 1024} ГБ, ~$${service.nextPlan.usd}/міс) або знайдіть витік пам'яті у вкладці «Проєкт».`
            : 'Перевірте витоки пам\'яті та кешування великих обʼєктів.',
          { label: 'Пам\'ять', value: `${Math.round(usage.memoryPercent)}%` },
          service.dashboardUrl,
        ),
      );
    } else if (usage.memoryPercent != null && usage.memoryPercent >= 70) {
      items.push(
        make(
          'render',
          'warning',
          `render-mem-${service.id}`,
          `${label}: пам'ять понад 70%`,
          `Зайнято ${Math.round(usage.memoryPercent)}% від ${usage.memoryLimitMb} МБ. Запас на пікові навантаження вже невеликий.`,
          'Заплануйте апгрейд плану або оптимізацію важких вибірок (див. вкладку «Проєкт» → великі відповіді).',
          { label: 'Пам\'ять', value: `${Math.round(usage.memoryPercent)}%` },
          service.dashboardUrl,
        ),
      );
    }

    if (usage.cpuPercent != null && usage.cpuPercent >= 80) {
      items.push(
        make(
          'render',
          'critical',
          `render-cpu-${service.id}`,
          `${label}: CPU завантажений`,
          `Поточне навантаження ${Math.round(usage.cpuPercent)}% від ліміту ${usage.cpuLimit} vCPU, пік ${Math.round(usage.cpuPeakPercent || 0)}%. Запити стають у чергу, час відповіді зростає нелінійно.`,
          service.nextPlan
            ? `Апгрейд до ${service.nextPlan.label} (${service.nextPlan.cpu} vCPU, ~$${service.nextPlan.usd}/міс) або увімкніть автоскейлінг.`
            : 'Увімкніть автоскейлінг або винесіть важкі задачі у фонові воркери.',
          { label: 'CPU', value: `${Math.round(usage.cpuPercent)}%` },
          service.dashboardUrl,
        ),
      );
    }

    if (usage.latencyP95Ms && usage.latencyP95Ms > 1500) {
      items.push(
        make(
          'render',
          'warning',
          `render-latency-${service.id}`,
          `${label}: повільні відповіді на рівні платформи`,
          `p95 = ${usage.latencyP95Ms} мс за обраний період. Це вже помітно користувачу при кожній дії.`,
          'Порівняйте з вкладкою «Проєкт»: якщо там p95 нижчий — вузьке місце в холодному старті чи мережі, якщо схожий — у коді.',
          { label: 'p95', value: `${usage.latencyP95Ms} мс` },
          service.dashboardUrl,
        ),
      );
    }

    if (service.failedDeploysRecent >= 2) {
      items.push(
        make(
          'render',
          'warning',
          `render-deploys-${service.id}`,
          `${service.name}: ${service.failedDeploysRecent} невдалих деплоїв поспіль`,
          'Невдалі збірки означають, що на проді працює стара версія коду.',
          'Перевірте логи збірки в Render і виправте помилку до наступного релізу.',
          { label: 'Невдалі деплої', value: service.failedDeploysRecent },
          service.dashboardUrl,
        ),
      );
    }

    if (service.suspended && service.suspended !== 'not_suspended') {
      items.push(
        make(
          'render',
          'critical',
          `render-suspended-${service.id}`,
          `${service.name}: сервіс призупинено`,
          `Статус: ${service.suspended}. Сервіс не обробляє запити.`,
          'Перевірте білінг і ліміти workspace у Render.',
          { label: 'Статус', value: service.suspended },
          service.dashboardUrl,
        ),
      );
    }

    if (service.type === 'web_service' && Number(service.numInstances) === 1 && usage.requestsTotal > 50_000) {
      items.push(
        make(
          'render',
          'info',
          `render-scale-${service.id}`,
          `${service.name}: один інстанс на помітному трафіку`,
          `${usage.requestsTotal.toLocaleString('uk-UA')} запитів за період і жодного резерву: будь-який деплой або збій = простій.`,
          'Додайте другий інстанс або увімкніть автоскейлінг для відмовостійкості.',
          { label: 'Інстансів', value: service.numInstances },
          service.dashboardUrl,
        ),
      );
    }
  }

  if (!items.length) {
    items.push(
      make('render', 'good', 'render-ok', 'Render працює в межах норми', 'CPU, пам\'ять і деплої без відхилень.', 'Дій не потрібно.', null, null),
    );
  }
  return items;
}

function mongoAdvice(mongo) {
  const items = [];
  const storage = mongo?.storage || {};
  const percent = storage.percent;

  if (!mongo?.local?.available) {
    items.push(
      make(
        'mongodb',
        'critical',
        'mongo-disconnected',
        'Немає активного підключення до MongoDB',
        mongo?.local?.reason || 'Бекенд не бачить базу — жодна операція із заявками не працюватиме.',
        'Перевірте MONGODB_URI, стан кластера в Atlas і IP Access List (Render використовує динамічні адреси — потрібен 0.0.0.0/0 або статичний вихідний IP).',
        null,
        'https://account.mongodb.com/',
      ),
    );
    return items;
  }

  if (percent != null && percent >= 90) {
    items.push(
      make(
        'mongodb',
        'critical',
        'mongo-storage-critical',
        'Сховище MongoDB майже вичерпано',
        `Зайнято ${bytesToMb(storage.usedBytes)} МБ із ${bytesToMb(storage.limitBytes)} МБ (${Math.round(percent)}%). При досягненні ліміту Atlas блокує запис — система перестане приймати нові заявки.`,
        'Терміново: перехід на більший кластер або архівація старих логів і вкладень у холодне сховище.',
        { label: 'Сховище', value: `${Math.round(percent)}%` },
        mongo.billingUrl,
      ),
    );
  } else if (percent != null && percent >= 75) {
    items.push(
      make(
        'mongodb',
        'warning',
        'mongo-storage-warning',
        'Сховище MongoDB заповнене більш ніж на 75%',
        `Зайнято ${bytesToMb(storage.usedBytes)} МБ із ${bytesToMb(storage.limitBytes)} МБ.`,
        'Сплануйте апгрейд кластера або чистку найбільших колекцій (нижче — топ за розміром).',
        { label: 'Сховище', value: `${Math.round(percent)}%` },
        mongo.billingUrl,
      ),
    );
  }

  if (mongo?.cluster?.isShared) {
    items.push(
      make(
        'mongodb',
        'info',
        'mongo-shared-tier',
        `Кластер ${mongo.cluster.name} на спільному тарифі ${mongo.cluster.instanceSize}`,
        'Shared-кластери не дають метрик через API, не мають резервного копіювання за розкладом і ділять ресурси з іншими клієнтами — звідси випадкові «підвисання».',
        'Для продакшену варто перейти щонайменше на M10: власні ресурси, бекапи та повна телеметрія.',
        { label: 'Тариф', value: mongo.cluster.instanceSize },
        mongo.billingUrl,
      ),
    );
  }

  if (!mongo?.cluster?.backupEnabled && mongo?.cluster) {
    items.push(
      make(
        'mongodb',
        'warning',
        'mongo-no-backup',
        'Резервне копіювання кластера вимкнено',
        'Відновити дані після помилкового видалення або збою буде нічим.',
        'Увімкніть Cloud Backup в Atlas або налаштуйте регулярний mongodump за розкладом.',
        null,
        mongo.billingUrl,
      ),
    );
  }

  const connections = mongo?.local?.server;
  if (connections?.connectionsCurrent && connections?.connectionsAvailable != null) {
    const total = connections.connectionsCurrent + connections.connectionsAvailable;
    const used = (connections.connectionsCurrent / total) * 100;
    if (used >= 70) {
      items.push(
        make(
          'mongodb',
          used >= 85 ? 'critical' : 'warning',
          'mongo-connections',
          'Пул зʼєднань MongoDB близький до ліміту',
          `Активних ${connections.connectionsCurrent} із ${total}. Нові запити почнуть отримувати помилку підключення.`,
          'Зменште maxPoolSize у бекенді або перейдіть на тариф із більшим лімітом зʼєднань.',
          { label: 'Зʼєднання', value: `${Math.round(used)}%` },
          null,
        ),
      );
    }
  }

  if (mongo?.pendingInvoice?.amountUsd > 0) {
    items.push(
      make(
        'mongodb',
        'info',
        'mongo-pending-invoice',
        `Поточний рахунок Atlas: $${mongo.pendingInvoice.amountUsd.toFixed(2)}`,
        `Період ${String(mongo.pendingInvoice.startDate || '').slice(0, 10)} — ${String(mongo.pendingInvoice.endDate || '').slice(0, 10)}, статус ${mongo.pendingInvoice.status}.`,
        'Сума ще накопичується до кінця розрахункового періоду.',
        { label: 'До сплати', value: `$${mongo.pendingInvoice.amountUsd.toFixed(2)}` },
        mongo.billingUrl,
      ),
    );
  }

  if (!mongo?.configured) {
    items.push(
      make(
        'mongodb',
        'info',
        'mongo-api-not-configured',
        'Admin API Atlas не підключено',
        'Обʼєм бази береться напряму з підключення, але рахунки, тариф кластера й налаштування бекапів залишаються невидимими.',
        'Створіть Service Account в Atlas і додайте MONGODB_ATLAS_CLIENT_ID, MONGODB_ATLAS_CLIENT_SECRET, MONGODB_ATLAS_GROUP_ID, MONGODB_ATLAS_ORG_ID.',
        null,
        'https://cloud.mongodb.com/v2#/org/settings/serviceAccounts',
      ),
    );
  }

  if (!items.length) {
    items.push(make('mongodb', 'good', 'mongo-ok', 'MongoDB у нормі', 'Обʼєм, зʼєднання та тариф без зауважень.', 'Дій не потрібно.', null, null));
  }
  return items;
}

function cloudinaryAdvice(cloudinary) {
  const items = [];
  if (!cloudinary?.configured) {
    items.push(
      make(
        'cloudinary',
        'info',
        'cloudinary-not-configured',
        'Cloudinary не підключено до аналізу',
        'Ліміти кредитів, сховища й трафіку не видно.',
        'Перевірте CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET в Environment бекенду.',
        null,
        'https://console.cloudinary.com/settings/api-keys',
      ),
    );
    return items;
  }

  const credits = cloudinary.credits || {};
  if (credits.percent != null && credits.percent >= 90) {
    items.push(
      make(
        'cloudinary',
        'critical',
        'cloudinary-credits-critical',
        'Кредити Cloudinary майже вичерпані',
        `Використано ${credits.used} з ${credits.limit} кредитів (${Math.round(credits.percent)}%). Після вичерпання Cloudinary обмежує доставку медіа — фото обладнання та документи перестануть відкриватися.`,
        'Перейдіть на наступний тариф або увімкніть f_auto/q_auto, щоб зменшити витрати трафіку та трансформацій.',
        { label: 'Кредити', value: `${Math.round(credits.percent)}%` },
        cloudinary.billingUrl,
      ),
    );
  } else if (credits.projectedPercent != null && credits.projectedPercent > 100) {
    items.push(
      make(
        'cloudinary',
        'warning',
        'cloudinary-credits-forecast',
        'За поточної динаміки кредитів не вистачить до кінця місяця',
        `Витрачається ${credits.burnPerDay} кредитів на добу, прогноз на місяць — ${credits.projected} з ${credits.limit} (${Math.round(credits.projectedPercent)}%). Ліміт буде вичерпано приблизно через ${Math.round(credits.daysToExhaust || 0)} дн.`,
        'Або апгрейд тарифу, або оптимізація: q_auto:eco, обмеження розміру оригіналів, видалення derived-ресурсів.',
        { label: 'Прогноз', value: `${Math.round(credits.projectedPercent)}%` },
        cloudinary.billingUrl,
      ),
    );
  } else if (credits.percent != null && credits.percent >= 70) {
    items.push(
      make(
        'cloudinary',
        'warning',
        'cloudinary-credits-warning',
        'Кредити Cloudinary витрачено більш ніж на 70%',
        `${credits.used} з ${credits.limit} кредитів, до оновлення ліміту ${Math.round(cloudinary.cycle?.remainingDays || 0)} дн.`,
        'Тримайте на контролі; якщо тенденція збережеться — плануйте апгрейд.',
        { label: 'Кредити', value: `${Math.round(credits.percent)}%` },
        cloudinary.billingUrl,
      ),
    );
  }

  if (cloudinary.storage?.percent != null && cloudinary.storage.percent >= 80) {
    items.push(
      make(
        'cloudinary',
        'warning',
        'cloudinary-storage',
        'Сховище Cloudinary заповнюється',
        `Зайнято ${bytesToGb(cloudinary.storage.usedBytes)} ГБ (${Math.round(cloudinary.storage.percent)}%).`,
        'Видаліть застарілі вкладення заявок або перенесіть архів у дешевше сховище.',
        { label: 'Сховище', value: `${Math.round(cloudinary.storage.percent)}%` },
        cloudinary.consoleUrl,
      ),
    );
  }

  if (cloudinary.bandwidth?.percent != null && cloudinary.bandwidth.percent >= 80) {
    items.push(
      make(
        'cloudinary',
        'warning',
        'cloudinary-bandwidth',
        'Трафік Cloudinary близький до ліміту',
        `Віддано ${bytesToGb(cloudinary.bandwidth.usedBytes)} ГБ (${Math.round(cloudinary.bandwidth.percent)}%).`,
        'Увімкніть f_auto,q_auto і адаптивні розміри (w_auto,dpr_auto) — зазвичай це мінус 40–60% трафіку без втрати якості.',
        { label: 'Трафік', value: `${Math.round(cloudinary.bandwidth.percent)}%` },
        cloudinary.consoleUrl,
      ),
    );
  }

  if (cloudinary.derivedResources > cloudinary.resources * 4 && cloudinary.resources > 100) {
    items.push(
      make(
        'cloudinary',
        'info',
        'cloudinary-derived',
        'Забагато похідних версій зображень',
        `На ${cloudinary.resources} оригіналів припадає ${cloudinary.derivedResources} трансформацій. Кожна версія займає сховище й кредити.`,
        'Стандартизуйте набір розмірів (наприклад, лише thumb/preview/full) і почистіть невикористані derived-ресурси.',
        { label: 'Похідних', value: cloudinary.derivedResources },
        cloudinary.consoleUrl,
      ),
    );
  }

  if (!items.length) {
    items.push(
      make('cloudinary', 'good', 'cloudinary-ok', 'Cloudinary у межах тарифу', 'Кредити, сховище й трафік без ризиків.', 'Дій не потрібно.', null, null),
    );
  }
  return items;
}

function projectAdvice(project) {
  const items = [];
  const totals = project?.totals || {};
  const runtime = project?.runtime || {};

  if (totals.requests < 30) {
    items.push(
      make(
        'project',
        'info',
        'project-warmup',
        'Замало даних для висновків',
        `Зібрано лише ${totals.requests} запитів з моменту старту процесу. Після деплою або пробудження інстансу лічильники обнуляються.`,
        'Поверніться сюди після кількох годин звичайної роботи — тоді рекомендації будуть репрезентативні.',
        { label: 'Запитів', value: totals.requests },
        null,
      ),
    );
  }

  if (totals.p95Ms >= 2000) {
    items.push(
      make(
        'project',
        'critical',
        'project-p95',
        'API відповідає надто повільно',
        `p95 = ${totals.p95Ms} мс: кожен двадцятий запит користувача чекає понад дві секунди.`,
        'Почніть з таблиці «Найдорожчі маршрути» — верхні 3 рядки зазвичай дають 80% усього часу.',
        { label: 'p95', value: `${totals.p95Ms} мс` },
        null,
      ),
    );
  } else if (totals.p95Ms >= 900) {
    items.push(
      make(
        'project',
        'warning',
        'project-p95',
        'Затримка відповіді вище комфортної',
        `p95 = ${totals.p95Ms} мс при цільових 400–600 мс.`,
        'Додайте пагінацію та проекції полів на найважчих маршрутах.',
        { label: 'p95', value: `${totals.p95Ms} мс` },
        null,
      ),
    );
  }

  if (totals.serverErrorRate >= 1) {
    items.push(
      make(
        'project',
        totals.serverErrorRate >= 3 ? 'critical' : 'warning',
        'project-5xx',
        'Частка серверних помилок вище норми',
        `${totals.serverErrorRate.toFixed(2)}% запитів завершуються кодом 5xx (норма — до 0.5%).`,
        'Дивіться список останніх помилок нижче: там точні маршрути та час.',
        { label: '5xx', value: `${totals.serverErrorRate.toFixed(2)}%` },
        null,
      ),
    );
  }

  const eventLoopP99 = runtime.eventLoop?.p99Ms || 0;
  if (eventLoopP99 >= 100) {
    items.push(
      make(
        'project',
        eventLoopP99 >= 250 ? 'critical' : 'warning',
        'project-event-loop',
        'Event loop блокується синхронними операціями',
        `p99 затримки циклу подій — ${eventLoopP99} мс. У Node це означає, що всі інші запити стоять і чекають.`,
        'Шукайте важкий синхронний код: розбір великих XLSX/PDF, JSON.parse на мегабайтах, синхронні операції з файлами. Виносьте це у worker_threads або окремий фоновий сервіс.',
        { label: 'Event loop p99', value: `${eventLoopP99} мс` },
        null,
      ),
    );
  }

  const memPercent = runtime.systemTotalMb ? (runtime.rssMb / runtime.systemTotalMb) * 100 : null;
  if (memPercent != null && memPercent >= 80) {
    items.push(
      make(
        'project',
        'warning',
        'project-memory',
        'Процес споживає багато памʼяті',
        `RSS ${runtime.rssMb} МБ із ${runtime.systemTotalMb} МБ доступних (heap ${runtime.heapUsedMb}/${runtime.heapTotalMb} МБ).`,
        'Перевірте кеші в памʼяті та вибірки без .lean() і без лімітів — вони найчастіше дають ріст heap.',
        { label: 'RSS', value: `${runtime.rssMb} МБ` },
        null,
      ),
    );
  }

  const database = project?.database || {};
  if (database.queriesPerRequest >= 8) {
    items.push(
      make(
        'project',
        'warning',
        'project-n-plus-one',
        'Забагато звернень до бази на один запит',
        `У середньому ${database.queriesPerRequest} операцій MongoDB на кожен HTTP-запит — типова ознака N+1 (запит у циклі замість populate чи $lookup).`,
        'Замініть цикли з findOne на один запит із $in або aggregate/$lookup.',
        { label: 'Запитів/HTTP', value: database.queriesPerRequest },
        null,
      ),
    );
  }

  if (database.totals?.avgMs >= 120) {
    items.push(
      make(
        'project',
        'warning',
        'project-slow-queries',
        'Запити до MongoDB виконуються повільно',
        `Середня тривалість операції ${database.totals.avgMs} мс, повільних (>${project.thresholds?.slowQueryMs || 200} мс) — ${database.totals.slow}.`,
        'Найчастіша причина — фільтр по полю без індексу. Перевірте таблицю колекцій нижче.',
        { label: 'Середній запит', value: `${database.totals.avgMs} мс` },
        null,
      ),
    );
  }

  for (const collection of (database.riskyCollections || []).slice(0, 5)) {
    items.push(
      make(
        'project',
        collection.count > 50_000 ? 'warning' : 'info',
        `project-collection-${collection.name}`,
        `Колекція ${collection.name}: ${collection.risks.length} зауваж.`,
        collection.risks.join(' '),
        collection.unusedIndexes.length
          ? `Приберіть невикористані індекси: ${collection.unusedIndexes.join(', ')}.`
          : 'Додайте індекс під найчастіший фільтр цієї колекції.',
        { label: 'Документів', value: collection.count.toLocaleString('uk-UA') },
        null,
      ),
    );
  }

  for (const route of (project?.routes?.heavyPayload || []).slice(0, 3)) {
    items.push(
      make(
        'project',
        'info',
        `project-payload-${route.key}`,
        `Важка відповідь: ${route.key}`,
        `У середньому ${route.avgPayloadKb} КБ на відповідь, ${route.count} викликів. Такі обсяги довго йдуть по мережі й гальмують рендер у браузері.`,
        'Додайте пагінацію, віддавайте лише потрібні поля (projection) і не тягніть вкладені масиви документів у список.',
        { label: 'Розмір', value: `${route.avgPayloadKb} КБ` },
        null,
      ),
    );
  }

  const cacheCandidates = (project?.routes?.chatty || []).filter((route) => route.method === 'GET' && route.avgMs >= 200);
  for (const route of cacheCandidates.slice(0, 3)) {
    items.push(
      make(
        'project',
        'info',
        `project-cache-${route.key}`,
        `Кандидат на кешування: ${route.key}`,
        `${route.count} викликів, у середньому ${route.avgMs} мс — разом ${Math.round(route.totalTimeMs / 1000)} с процесорного часу.`,
        'Якщо дані змінюються рідко (довідники, регіони, склади) — кешуйте відповідь на 30–120 секунд.',
        { label: 'Викликів', value: route.count },
        null,
      ),
    );
  }

  if (!database.monitoring) {
    items.push(
      make(
        'project',
        'info',
        'project-mongo-monitoring',
        'Детальні метрики запитів MongoDB вимкнені',
        'Без command monitoring не видно, які саме колекції гальмують.',
        'У підключенні mongoose додайте monitorCommands: true і перезапустіть сервіс.',
        null,
        null,
      ),
    );
  }

  if (!items.length) {
    items.push(
      make('project', 'good', 'project-ok', 'Проєкт працює рівно', 'Затримки, помилки й запити до бази в межах цільових значень.', 'Дій не потрібно.', null, null),
    );
  }
  return items;
}

function buildRecommendations({ render, mongo, cloudinary, project }) {
  const items = [
    ...renderAdvice(render),
    ...mongoAdvice(mongo),
    ...cloudinaryAdvice(cloudinary),
    ...projectAdvice(project),
  ];
  items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const counts = items.reduce(
    (acc, item) => {
      acc[item.severity] = (acc[item.severity] || 0) + 1;
      return acc;
    },
    { critical: 0, warning: 0, info: 0, good: 0 },
  );
  return { items, counts };
}

module.exports = { buildRecommendations, SEVERITY_ORDER };
