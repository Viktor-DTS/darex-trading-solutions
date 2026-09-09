import React, { useMemo, useState } from 'react';
import {
  displayText,
  formatAmps,
  formatPower,
  isAvrItem,
  isBlankLabel,
  isDieselGenerator,
  parseDieselRatings,
  warehouseDisplayName,
} from '../manager/stock/stockUtils';
import './EquipmentPassportView.css';

function testingMeta(status) {
  switch (status) {
    case 'completed':
      return { label: 'Протестовано', tone: 'ok' };
    case 'failed':
      return { label: 'Тест не пройдено', tone: 'bad' };
    case 'in_progress':
      return { label: 'Тест у роботі', tone: 'info' };
    case 'requested':
      return { label: 'Очікує тест', tone: 'warn' };
    default:
      return { label: 'Без тесту', tone: 'mute' };
  }
}

function stockMeta(status) {
  switch (status) {
    case 'reserved':
      return { label: 'У резерві', tone: 'warn' };
    case 'shipped':
      return { label: 'Відвантажено', tone: 'info' };
    case 'in_transit':
      return { label: 'В дорозі', tone: 'info' };
    case 'sold':
      return { label: 'Продано', tone: 'mute' };
    default:
      return { label: 'На складі', tone: 'ok' };
  }
}

function modelTag(type) {
  const s = String(type || '');
  const m = s.match(/\b([A-Z]{1,6}[-\s]?\d{2,5}[A-Z0-9-]*)\b/i);
  return m ? m[1].replace(/\s+/g, '-') : '';
}

function isFilled(value) {
  return !isBlankLabel(value) && String(value).trim() !== '—';
}

function EquipmentPassportView({
  equipment,
  formData = {},
  warehouses = [],
  specs = [],
  images = [],
  unitSpecs = [],
  loading = false,
  onQr,
  onHistory,
  onTestingInfo,
}) {
  const [copied, setCopied] = useState(false);
  const type = displayText(formData.type || equipment?.type, 'Обладнання');
  const manufacturer = displayText(formData.manufacturer || equipment?.manufacturer, '');
  const serial = displayText(formData.serialNumber || equipment?.serialNumber, '');
  const hasSerial = serial && serial !== '—';
  const warehouse = warehouseDisplayName(
    equipment?.currentWarehouseName
      || warehouses.find((w) => String(w._id) === String(formData.currentWarehouse || equipment?.currentWarehouse))?.name
      || ''
  );
  const powerItem = { ...equipment, ...formData, type };
  const diesel = parseDieselRatings(powerItem);
  const powerLine = formatPower(powerItem);
  const amps = formatAmps(powerItem);
  const test = testingMeta(equipment?.testingStatus);
  const stock = stockMeta(equipment?.status);
  const model = modelTag(type);
  const photo = images[0]?.cloudinaryUrl
    || (equipment?.attachedFiles || []).find((f) => String(f?.mimetype || '').startsWith('image/') || /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(f?.cloudinaryUrl || ''))?.cloudinaryUrl
    || '';
  const extraPhotos = useMemo(() => {
    const seen = new Set(photo ? [photo] : []);
    const out = [];
    for (const f of [...images, ...(equipment?.attachedFiles || [])]) {
      const url = f?.cloudinaryUrl;
      if (!url || seen.has(url)) continue;
      const mt = String(f?.mimetype || '').toLowerCase();
      const isImg = mt.startsWith('image/') || /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/i.test(url);
      if (!isImg) continue;
      seen.add(url);
      out.push(f);
    }
    return out;
  }, [equipment?.attachedFiles, images, photo]);

  const facts = useMemo(() => {
    const qty = equipment?.quantity != null ? `${equipment.quantity} ${displayText(equipment.batchUnit, 'шт.')}` : '';
    const testedAt = equipment?.testingDate
      ? new Date(equipment.testingDate).toLocaleString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      : '';
    const made = formData.manufactureDate
      ? new Date(formData.manufactureDate).toLocaleDateString('uk-UA')
      : '';
    return [
      ['Склад', warehouse],
      ['Регіон', formData.region],
      ['Кількість', qty],
      ['Фаза', formData.phase],
      ['Напруга', formData.voltage],
      ['Струм', amps || formData.amperage],
      ['Частота', formData.frequency],
      ['Оберти', formData.rpm],
      ['Вага', formData.weight],
      ['Габарити', formData.dimensions],
      ['Випуск', made],
      ['Дата тесту', testedAt],
    ].filter(([, value]) => isFilled(value));
  }, [amps, equipment, formData, warehouse]);

  const uniqueSpecs = useMemo(() => {
    const seen = new Set();
    const skipNames = /виробник|тип обладнання|найменування|назва/i;
    const skipValues = new Set([type, manufacturer].map((x) => String(x).trim().toLowerCase()).filter(Boolean));
    return [...specs, ...unitSpecs]
      .filter((row) => {
        const name = String(row?.name || '').trim();
        const value = String(row?.value || '').trim();
        if (!name && !value) return false;
        if (skipNames.test(name)) return false;
        if (skipValues.has(value.toLowerCase())) return false;
        const key = `${name.toLowerCase()}::${value.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [manufacturer, specs, type, unitSpecs]);

  const copySerial = async () => {
    if (!hasSerial) return;
    try {
      await navigator.clipboard.writeText(serial);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };

  const canOpenTest = equipment?.testingStatus === 'completed' || equipment?.testingStatus === 'failed';

  return (
    <div className="eqp">
      <section className="eqp-hero">
        <div className={`eqp-photo ${photo ? '' : 'is-empty'}`}>
          {photo ? (
            <a href={photo} target="_blank" rel="noopener noreferrer">
              <img src={photo} alt="" />
            </a>
          ) : (
            <div className="eqp-photo-fallback" aria-hidden="true">
              <span>{model || (isAvrItem(type) ? 'АВР' : isDieselGenerator(type) ? 'ДГУ' : 'DTS')}</span>
            </div>
          )}
        </div>
        <div className="eqp-identity">
          {manufacturer ? <p className="eqp-mfr">{manufacturer}</p> : null}
          <h3>{type}</h3>
          <div className="eqp-pills">
            {model ? <span className="eqp-pill is-model">{model}</span> : null}
            <span className={`eqp-pill is-${stock.tone}`}>{stock.label}</span>
            <span className={`eqp-pill is-${test.tone}`}>{test.label}</span>
            {isAvrItem(type) ? <span className="eqp-pill">АВР</span> : null}
            {isDieselGenerator(type) ? <span className="eqp-pill">Дизель-генератор</span> : null}
          </div>
          <button
            type="button"
            className={`eqp-serial ${copied ? 'is-copied' : ''}`}
            onClick={copySerial}
            disabled={!hasSerial}
            title={hasSerial ? 'Скопіювати серійний номер' : 'Серійний номер не вказано'}
          >
            <small>Серійний №</small>
            <b>{hasSerial ? serial : 'без серійного №'}</b>
            {hasSerial ? <em>{copied ? 'скопійовано' : 'копіювати'}</em> : null}
          </button>
          <div className="eqp-actions">
            <button type="button" className="eqp-act" onClick={onQr}>QR-код</button>
            <button type="button" className="eqp-act" onClick={onHistory}>Історія</button>
            <button
              type="button"
              className="eqp-act"
              onClick={onTestingInfo}
              disabled={!canOpenTest}
            >
              Протокол тесту
            </button>
          </div>
        </div>
      </section>

      {diesel ? (
        <section className="eqp-cluster" aria-label="Потужність">
          <div>
            <em>Номінал</em>
            <strong>{diesel.nomKw}</strong>
            <span>кВт · {diesel.nomKva} кВА</span>
          </div>
          <div>
            <em>Максимум</em>
            <strong>{diesel.maxKw}</strong>
            <span>кВт · {diesel.maxKva} кВА</span>
          </div>
          <div className="eqp-cluster-meter">
            <em>Запас до максимуму</em>
            <div className="eqp-meter">
              <i style={{ width: `${Math.max(8, Math.min(100, (diesel.nomKw / diesel.maxKw) * 100))}%` }} />
            </div>
            <span>номінал {Math.round((diesel.nomKw / diesel.maxKw) * 100)}% від max</span>
          </div>
        </section>
      ) : powerLine || amps ? (
        <section className="eqp-power-line">
          <b>{powerLine || amps}</b>
          {powerLine && amps ? <span>{amps}</span> : null}
        </section>
      ) : null}

      {facts.length ? (
        <section className="eqp-facts">
          {facts.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <b>{value}</b>
            </div>
          ))}
        </section>
      ) : null}

      {equipment?.status === 'reserved' || equipment?.reservedByName ? (
        <section className="eqp-reserve">
          <strong>Резерв</strong>
          <p>
            {[
              equipment.reservationClientName && `клієнт ${equipment.reservationClientName}`,
              equipment.reservedByName && `менеджер ${equipment.reservedByName}`,
              equipment.reservationEndDate && `до ${new Date(equipment.reservationEndDate).toLocaleDateString('uk-UA')}`,
            ].filter(Boolean).join(' · ') || 'Позицію зарезервовано'}
          </p>
        </section>
      ) : null}

      {loading ? <p className="eqp-loading">Підтягуємо картку продукту…</p> : null}

      {uniqueSpecs.length ? (
        <section className="eqp-specs">
          <h4>Характеристики</h4>
          <dl>
            {uniqueSpecs.map((row, i) => (
              <div key={`${row.name}-${i}`}>
                <dt>{row.name || '—'}</dt>
                <dd>{row.value || '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {extraPhotos.length ? (
        <section className="eqp-gallery">
          {extraPhotos.map((f, i) => (
            <a
              key={f.cloudinaryId || `${f.cloudinaryUrl}-${i}`}
              href={f.cloudinaryUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img src={f.cloudinaryUrl} alt={f.originalName || ''} />
            </a>
          ))}
        </section>
      ) : null}

      {isFilled(formData.notes) ? (
        <section className="eqp-notes">
          <h4>Примітка</h4>
          <p>{formData.notes}</p>
        </section>
      ) : null}
    </div>
  );
}

export default EquipmentPassportView;
