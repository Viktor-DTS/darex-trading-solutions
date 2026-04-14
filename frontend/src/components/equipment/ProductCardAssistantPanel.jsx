import React, { useState, useEffect } from 'react';
import './ProductCardAssistantPanel.css';

/**
 * Права колонка модалки: підказки з бекенду (Вікіпедія / Commons / LLM / заглушка), чекбокси, застосування до форми.
 */
export default function ProductCardAssistantPanel({
  loading,
  error,
  data,
  onApply,
  applyBusy,
}) {
  const [useName, setUseName] = useState(false);
  const [useManufacturer, setUseManufacturer] = useState(false);
  const [specIds, setSpecIds] = useState(() => new Set());
  const [imageIds, setImageIds] = useState(() => new Set());

  useEffect(() => {
    if (!data || loading) return;
    setUseName(false);
    setUseManufacturer(!!(data.manufacturerHint && String(data.manufacturerHint).trim()));
    const s = new Set((data.specs || []).map((x) => x.id).filter(Boolean));
    setSpecIds(s);
    // Зображення за замовчуванням не обрані — користувач позначає, що імпортувати у «Фото / файли».
    setImageIds(new Set());
  }, [data, loading]);

  const toggleSpec = (id) => {
    setSpecIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleImage = (id) => {
    setImageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canApply =
    data &&
    (useName ||
      (useManufacturer && data.manufacturerHint) ||
      specIds.size > 0 ||
      imageIds.size > 0);

  return (
    <aside className="product-card-assistant" aria-label="Асистент карточки продукту">
      <h4 className="product-card-assistant__title">Асистент</h4>
      <p className="product-card-assistant__hint">
        Після введення <strong>Тип / найменування</strong> (або лише <strong>короткої назви</strong>, якщо тип порожній) переведіть
        фокус у інше поле (Tab або клік) — підвантажаться довідкові дані (Вікіпедія, Commons, за наявності ключа LLM на сервері: PRODUCT_ASSISTANT_LLM_API_KEY або OPENAI_API_KEY). Оберіть чекбоксами, що перенести у
        форму зліва.
      </p>

      {loading && <div className="product-card-assistant__status">Завантаження…</div>}
      {error && !loading && <div className="product-card-assistant__error">{error}</div>}

      {!loading && !error && !data && (
        <p className="product-card-assistant__empty">
          Введіть тип або коротку назву (від 2 символів) і переведіть фокус з одного з цих полів.
        </p>
      )}

      {data && !loading && (
        <>
          {data.disclaimer ? <p className="product-card-assistant__disclaimer">{data.disclaimer}</p> : null}
          {data.source ? (
            <p className="product-card-assistant__meta">
              Джерело:{' '}
              {data.source === 'wikipedia'
                ? `Вікіпедія (${data.lang || '—'})`
                : data.source === 'mock'
                  ? 'заглушка'
                  : data.source === 'llm'
                    ? `LLM${data.llmModel ? ` (${data.llmModel})` : ''}`
                    : data.source}
            </p>
          ) : null}
          {data.commonsImagesAdded > 0 ? (
            <p className="product-card-assistant__meta">
              Зображення з Commons: +{data.commonsImagesAdded} (імпорт у «Фото / файли» через обрані чекбокси)
            </p>
          ) : null}

          {data.suggestedName ? (
            <label className="product-card-assistant__check product-card-assistant__check--block">
              <input type="checkbox" checked={useName} onChange={(e) => setUseName(e.target.checked)} />
              <span>
                Підставити назву: <strong>{data.suggestedName}</strong>
              </span>
            </label>
          ) : null}

          {data.manufacturerHint ? (
            <label className="product-card-assistant__check product-card-assistant__check--block">
              <input
                type="checkbox"
                checked={useManufacturer}
                onChange={(e) => setUseManufacturer(e.target.checked)}
              />
              <span>
                Підставити виробника: <strong>{data.manufacturerHint}</strong>
              </span>
            </label>
          ) : null}

          {(data.specs || []).length > 0 && (
            <div className="product-card-assistant__section">
              <div className="product-card-assistant__section-title">Характеристики</div>
              <ul className="product-card-assistant__spec-list">
                {(data.specs || []).map((s) => (
                  <li key={s.id}>
                    <label className="product-card-assistant__spec-row">
                      <input
                        type="checkbox"
                        checked={specIds.has(s.id)}
                        onChange={() => toggleSpec(s.id)}
                      />
                      <span className="product-card-assistant__spec-text">
                        <span className="product-card-assistant__spec-name">{s.name}</span>
                        <span className="product-card-assistant__spec-value">{s.value}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="product-card-assistant__section">
            <div className="product-card-assistant__section-title">
              Зображення для підстановки у «Фото / файли»
            </div>
            {(data.images || []).length > 0 ? (
              <ul className="product-card-assistant__images">
                {(data.images || []).map((im) => (
                  <li key={im.id} className="product-card-assistant__image-item">
                    <label>
                      <input
                        type="checkbox"
                        checked={imageIds.has(im.id)}
                        onChange={() => toggleImage(im.id)}
                      />
                      <img src={im.url} alt={im.title || ''} className="product-card-assistant__thumb" loading="lazy" />
                    </label>
                    {im.title ? <span className="product-card-assistant__img-cap">{im.title}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="product-card-assistant__empty product-card-assistant__empty--inline">
                За цим запитом зображень у відкритих джерелах не знайдено. Додайте фото вручну («Вибрати файли» / «Зробити фото») або
                уточніть назву.
              </p>
            )}
          </div>

          <button
            type="button"
            className="btn-primary product-card-assistant__apply"
            disabled={!canApply || applyBusy}
            onClick={() =>
              onApply({
                applySuggestedName: useName,
                applyManufacturer: useManufacturer && !!data.manufacturerHint,
                specIds: Array.from(specIds),
                imageIds: Array.from(imageIds),
              })
            }
          >
            {applyBusy ? 'Застосування…' : 'Додати обране до форми'}
          </button>
        </>
      )}
    </aside>
  );
}
