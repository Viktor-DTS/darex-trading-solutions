import React from 'react';
import { Gauge, UsageBar, Sparkline, RankBar } from './HealthCharts';
import {
  formatBytes,
  formatNumber,
  formatMs,
  formatPercent,
  formatDateTime,
  formatDate,
  percentStatus,
  STATUS_COLORS,
} from './healthFormat';

function NotConfigured({ title, message, envKeys, link }) {
  return (
    <div className="sh-empty-card">
      <div className="sh-empty-title">🔌 {title}</div>
      <p>{message}</p>
      {envKeys?.length > 0 && (
        <div className="sh-env-keys">
          {envKeys.map((key) => (
            <code key={key}>{key}</code>
          ))}
        </div>
      )}
      {link && (
        <a className="sh-link-btn" href={link} target="_blank" rel="noreferrer">
          Відкрити кабінет ↗
        </a>
      )}
    </div>
  );
}

function DeployBadge({ deploy }) {
  if (!deploy) return <span className="sh-badge sh-badge-muted">немає деплоїв</span>;
  const ok = deploy.status === 'live' || deploy.status === 'succeeded';
  const failed = String(deploy.status || '').includes('failed') || deploy.status === 'canceled';
  return (
    <span className={`sh-badge ${ok ? 'sh-badge-ok' : failed ? 'sh-badge-critical' : 'sh-badge-warning'}`}>
      {deploy.status} · {formatDateTime(deploy.finishedAt || deploy.createdAt)}
    </span>
  );
}

function RenderServiceCard({ service }) {
  const usage = service.usage || {};
  const memStatus = percentStatus(usage.memoryPercent);
  const cpuStatus = percentStatus(usage.cpuPercent);
  // Статичні сайти та cron-джоби не мають інстансів, тож CPU/RAM для них Render не віддає.
  const hasInstanceMetrics = usage.memoryPercent != null || usage.cpuPercent != null;

  return (
    <div className={`sh-service-card sh-border-${memStatus === 'critical' || cpuStatus === 'critical' ? 'critical' : memStatus === 'warning' || cpuStatus === 'warning' ? 'warning' : 'ok'}`}>
      <div className="sh-service-head">
        <div>
          <div className="sh-service-name">
            {service.name}
            <span className="sh-chip">{service.type}</span>
          </div>
          <div className="sh-service-meta">
            {service.region && <span>📍 {service.region}</span>}
            {service.branch && <span>🌿 {service.branch}</span>}
            <span>🖥 {service.numInstances} інст.</span>
          </div>
        </div>
        <div className="sh-service-plan">
          <span className={`sh-plan-badge ${service.plan.key === 'free' ? 'sh-plan-free' : ''}`}>{service.plan.label}</span>
          {service.plan.usd != null && <span className="sh-plan-price">${service.plan.usd}/міс</span>}
        </div>
      </div>

      <div className="sh-service-gauges">
        {hasInstanceMetrics ? (
          <>
            <Gauge
              percent={usage.memoryPercent}
              status={memStatus}
              value={usage.memoryPercent == null ? '—' : formatPercent(usage.memoryPercent)}
              label={`RAM ${usage.memoryUsedMb}/${usage.memoryLimitMb} МБ`}
              size={92}
            />
            <Gauge
              percent={usage.cpuPercent}
              status={cpuStatus}
              value={usage.cpuPercent == null ? '—' : formatPercent(usage.cpuPercent)}
              label={`CPU ${usage.cpuUsed}/${usage.cpuLimit}`}
              size={92}
            />
            <div className="sh-service-stats">
              <div><span>Запитів</span><b>{formatNumber(usage.requestsTotal)}</b></div>
              <div><span>p95</span><b>{usage.latencyP95Ms ? formatMs(usage.latencyP95Ms) : '—'}</b></div>
              <div><span>Трафік</span><b>{usage.bandwidthGb ? `${usage.bandwidthGb} ГБ` : '—'}</b></div>
              <div><span>Пік RAM</span><b>{usage.memoryPeakMb ? `${usage.memoryPeakMb} МБ` : '—'}</b></div>
            </div>
          </>
        ) : (
          <div className="sh-service-nometrics">
            Render не публікує метрики CPU і памʼяті для типу «{service.type}» — доступні лише стан і деплої.
          </div>
        )}
      </div>

      {service.metrics?.httpRequests?.series?.length > 1 && (
        <div className="sh-service-spark">
          <span className="sh-spark-title">Запити за період</span>
          <Sparkline points={service.metrics.httpRequests.series} color="#8b5cf6" />
        </div>
      )}

      <div className="sh-service-foot">
        <DeployBadge deploy={service.lastDeploy} />
        {service.failedDeploysRecent > 0 && (
          <span className="sh-badge sh-badge-critical">невдалих деплоїв: {service.failedDeploysRecent}</span>
        )}
        {service.nextPlan && (memStatus !== 'ok' || cpuStatus !== 'ok') && (
          <span className="sh-badge sh-badge-warning">
            наступний план: {service.nextPlan.label} (${service.nextPlan.usd}/міс)
          </span>
        )}
        <a className="sh-link-btn sh-link-sm" href={service.dashboardUrl} target="_blank" rel="noreferrer">
          Render ↗
        </a>
      </div>
    </div>
  );
}

function RenderSection({ render }) {
  if (!render?.configured) {
    return (
      <NotConfigured
        title="Render не підключено"
        message={render?.message || 'Додайте API-ключ Render, щоб бачити CPU, пам\'ять, трафік і статуси деплоїв просто тут.'}
        envKeys={['RENDER_API_KEY']}
        link="https://dashboard.render.com/"
      />
    );
  }

  return (
    <div className="sh-section">
      <div className="sh-section-head">
        <h3>
          <span className="sh-dot" style={{ background: '#8b5cf6' }} /> Render — хостинг застосунку
        </h3>
        <div className="sh-section-actions">
          <span className="sh-muted">
            Оцінка витрат: <b>${(render.estimate?.monthlyUsd || 0).toFixed(0)}/міс</b>
          </span>
          <a className="sh-link-btn sh-link-sm" href={render.billingUrl} target="_blank" rel="noreferrer">
            Білінг ↗
          </a>
        </div>
      </div>
      <div className="sh-service-grid">
        {(render.services || []).map((service) => (
          <RenderServiceCard key={service.id} service={service} />
        ))}
      </div>
      {render.estimate?.note && <p className="sh-note">ℹ️ {render.estimate.note}</p>}
    </div>
  );
}

function MongoSection({ mongo }) {
  const storage = mongo?.storage || {};
  const local = mongo?.local || {};
  const status = percentStatus(storage.percent, { warn: 75, critical: 90 });
  const topCollections = (local.collectionStats || []).slice(0, 10);
  const maxCollection = topCollections[0]?.storageSizeBytes || 1;

  return (
    <div className="sh-section">
      <div className="sh-section-head">
        <h3>
          <span className="sh-dot" style={{ background: '#10b981' }} /> MongoDB Atlas — база даних
        </h3>
        <div className="sh-section-actions">
          {mongo?.cluster && (
            <span className="sh-chip">
              {mongo.cluster.name} · {mongo.cluster.instanceSize} · {mongo.cluster.stateName}
            </span>
          )}
          <a className="sh-link-btn sh-link-sm" href={mongo?.billingUrl || 'https://account.mongodb.com/'} target="_blank" rel="noreferrer">
            Atlas ↗
          </a>
        </div>
      </div>

      {local.available === false && (
        <p className="sh-note sh-note-warning">
          ⚠️ Немає активного підключення до бази: {local.reason || 'причина невідома'}. Показники нижче недоступні.
        </p>
      )}

      <div className="sh-mongo-grid">
        <div className="sh-panel">
          <Gauge
            percent={storage.percent}
            status={status}
            value={formatPercent(storage.percent)}
            label="сховище"
            size={128}
            thickness={12}
          />
          <div className="sh-panel-note">
            {formatBytes(storage.usedBytes)} із {formatBytes(storage.limitBytes)}
            <br />
            <span className="sh-muted">
              ліміт з {storage.limitSource === 'atlas' ? 'Atlas API' : storage.limitSource === 'env' ? 'налаштувань' : 'тарифу M0'}
            </span>
          </div>
        </div>

        <div className="sh-panel sh-panel-wide">
          <UsageBar
            label="Дані"
            percent={storage.limitBytes ? (local.dataSizeBytes / storage.limitBytes) * 100 : null}
            valueText={formatBytes(local.dataSizeBytes)}
            status="ok"
          />
          <UsageBar
            label="Індекси"
            percent={storage.limitBytes ? (local.indexSizeBytes / storage.limitBytes) * 100 : null}
            valueText={formatBytes(local.indexSizeBytes)}
            status={local.indexSizeBytes > local.dataSizeBytes ? 'warning' : 'ok'}
            hintText={
              local.indexSizeBytes > local.dataSizeBytes
                ? 'Індекси важать більше за дані — перевірте зайві складені індекси'
                : null
            }
          />
          <div className="sh-kv-grid">
            <div><span>Колекцій</span><b>{formatNumber(local.collections)}</b></div>
            <div><span>Документів</span><b>{formatNumber(local.objects)}</b></div>
            <div><span>Індексів</span><b>{formatNumber(local.indexes)}</b></div>
            <div><span>Сер. документ</span><b>{formatBytes(local.avgObjSizeBytes)}</b></div>
            <div><span>Пул зʼєднань</span><b>{local.driverPool?.maxPoolSize ?? '—'}</b></div>
            <div><span>Версія</span><b>{local.server?.version || mongo?.cluster?.mongoDBVersion || '—'}</b></div>
          </div>
          {local.server && (
            <div className="sh-kv-grid">
              <div><span>Активні зʼєднання</span><b>{formatNumber(local.server.connectionsCurrent)}</b></div>
              <div><span>Доступно</span><b>{formatNumber(local.server.connectionsAvailable)}</b></div>
              <div><span>Аптайм БД</span><b>{Math.round(local.server.uptimeSec / 3600)} год</b></div>
            </div>
          )}
        </div>
      </div>

      <div className="sh-subpanel">
        <div className="sh-subpanel-title">Найбільші колекції</div>
        <table className="sh-table">
          <thead>
            <tr>
              <th>Колекція</th>
              <th>Документів</th>
              <th>Дані</th>
              <th>Індекси</th>
              <th className="sh-col-bar">Частка сховища</th>
            </tr>
          </thead>
          <tbody>
            {topCollections.map((collection) => (
              <tr key={collection.name}>
                <td className="sh-mono">{collection.name}</td>
                <td>{formatNumber(collection.count)}</td>
                <td>{formatBytes(collection.dataSizeBytes)}</td>
                <td>{formatBytes(collection.indexSizeBytes)}</td>
                <td className="sh-col-bar">
                  <RankBar percent={(collection.storageSizeBytes / maxCollection) * 100} color="#10b981" />
                </td>
              </tr>
            ))}
            {!topCollections.length && (
              <tr>
                <td colSpan={5} className="sh-muted">Статистика колекцій недоступна</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(mongo?.invoices || []).length > 0 && (
        <div className="sh-subpanel">
          <div className="sh-subpanel-title">Рахунки Atlas</div>
          <table className="sh-table">
            <thead>
              <tr>
                <th>Період</th>
                <th>Статус</th>
                <th>Сума</th>
              </tr>
            </thead>
            <tbody>
              {mongo.invoices.slice(0, 8).map((invoice) => (
                <tr key={invoice.id}>
                  <td>{formatDate(invoice.startDate)} — {formatDate(invoice.endDate)}</td>
                  <td>
                    <span className={`sh-badge ${invoice.status === 'PAID' ? 'sh-badge-ok' : 'sh-badge-warning'}`}>
                      {invoice.status}
                    </span>
                  </td>
                  <td>${invoice.amountUsd.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!mongo?.configured && (
        <p className="sh-note">
          ℹ️ Обʼєм бази читається напряму з підключення. Щоб бачити тариф кластера, бекапи та рахунки — додайте ключі Atlas
          (<code>MONGODB_ATLAS_CLIENT_ID</code>, <code>MONGODB_ATLAS_CLIENT_SECRET</code>, <code>MONGODB_ATLAS_GROUP_ID</code>,{' '}
          <code>MONGODB_ATLAS_ORG_ID</code>).
        </p>
      )}
      {(mongo?.apiErrors || []).map((error) => (
        <p className="sh-note sh-note-warning" key={error}>⚠️ Atlas API: {error}</p>
      ))}
    </div>
  );
}

function CloudinarySection({ cloudinary }) {
  if (!cloudinary?.configured) {
    return (
      <NotConfigured
        title="Cloudinary не підключено"
        message={cloudinary?.message || 'Без ключів не видно кредитів, сховища й трафіку медіа.'}
        envKeys={['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']}
        link="https://cloudinary.com/"
      />
    );
  }

  const credits = cloudinary.credits || {};
  const creditStatus = percentStatus(credits.percent, { warn: 70, critical: 90 });
  const forecastOver = credits.projectedPercent != null && credits.projectedPercent > 100;

  return (
    <div className="sh-section">
      <div className="sh-section-head">
        <h3>
          <span className="sh-dot" style={{ background: '#38bdf8' }} /> Cloudinary — медіа та файли
        </h3>
        <div className="sh-section-actions">
          <span className="sh-chip">{cloudinary.plan?.name || cloudinary.plan?.label}</span>
          <span className="sh-muted">оновлення лімітів через {Math.round(cloudinary.cycle?.remainingDays || 0)} дн.</span>
          <a className="sh-link-btn sh-link-sm" href={cloudinary.billingUrl} target="_blank" rel="noreferrer">
            Білінг ↗
          </a>
        </div>
      </div>

      <div className="sh-mongo-grid">
        <div className="sh-panel">
          <Gauge
            percent={credits.percent}
            status={creditStatus}
            value={formatPercent(credits.percent)}
            label="кредити"
            size={128}
            thickness={12}
            marker={credits.projectedPercent}
          />
          <div className="sh-panel-note">
            {formatNumber(credits.used, 1)} із {formatNumber(credits.limit)} кредитів
            <br />
            <span className={forecastOver ? 'sh-text-critical' : 'sh-muted'}>
              прогноз на місяць: {formatNumber(credits.projected, 0)} ({formatPercent(credits.projectedPercent)})
            </span>
          </div>
        </div>

        <div className="sh-panel sh-panel-wide">
          <UsageBar
            label="Сховище"
            percent={cloudinary.storage?.percent}
            valueText={formatBytes(cloudinary.storage?.usedBytes)}
            status={percentStatus(cloudinary.storage?.percent)}
          />
          <UsageBar
            label="Трафік"
            percent={cloudinary.bandwidth?.percent}
            valueText={formatBytes(cloudinary.bandwidth?.usedBytes)}
            status={percentStatus(cloudinary.bandwidth?.percent)}
            hintText={
              (cloudinary.bandwidth?.percent || 0) >= 60
                ? 'Порада: f_auto,q_auto зменшують трафік на 40–60% без втрати якості'
                : null
            }
          />
          <UsageBar
            label="Трансформації"
            percent={cloudinary.transformations?.percent}
            valueText={formatNumber(cloudinary.transformations?.used)}
            status={percentStatus(cloudinary.transformations?.percent)}
          />
          <div className="sh-kv-grid">
            <div><span>Оригіналів</span><b>{formatNumber(cloudinary.resources)}</b></div>
            <div><span>Похідних</span><b>{formatNumber(cloudinary.derivedResources)}</b></div>
            <div><span>Запитів API</span><b>{formatNumber(cloudinary.requests)}</b></div>
            <div><span>Витрата/добу</span><b>{formatNumber(credits.burnPerDay, 2)} кред.</b></div>
            <div>
              <span>Вистачить на</span>
              <b style={{ color: credits.daysToExhaust != null && credits.daysToExhaust < (cloudinary.cycle?.remainingDays || 0) ? STATUS_COLORS.critical : undefined }}>
                {credits.daysToExhaust == null ? '—' : `${Math.round(credits.daysToExhaust)} дн.`}
              </b>
            </div>
            <div><span>Оновлено</span><b>{formatDate(cloudinary.lastUpdated)}</b></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ExternalResourcesPanel({ external }) {
  return (
    <div className="sh-stack">
      <RenderSection render={external?.render} />
      <MongoSection mongo={external?.mongodb} />
      <CloudinarySection cloudinary={external?.cloudinary} />
    </div>
  );
}
