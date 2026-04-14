import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  /** Індекс зображення у модалці збільшеного перегляду */
  const [previewIndex, setPreviewIndex] = useState(null);

  useEffect(() => {
    if (!data || loading) return;
    setUseName(false);
    setUseManufacturer(!!(data.manufacturerHint && String(data.manufacturerHint).trim()));
    const s = new Set((data.specs || []).map((x) => x.id).filter(Boolean));
    setSpecIds(s);
    // Зображення за замовчуванням не обрані — користувач позначає, що імпортувати у «Фото / файли».
    setImageIds(new Set());
    setPreviewIndex(null);
  }, [data, loading]);

  const assistantImages = data?.images && Array.isArray(data.images) ? data.images : [];
  const closePreview = useCallback(() => setPreviewIndex(null), []);
  const openPreview = useCallback((idx) => {
    if (idx >= 0 && idx < assistantImages.length) setPreviewIndex(idx);
  }, [assistantImages.length]);

  useEffect(() => {
    if (previewIndex == null) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePreview();
      }
      if (e.key === 'ArrowLeft' && previewIndex > 0) {
        e.preventDefault();
        setPreviewIndex(previewIndex - 1);
      }
      if (e.key === 'ArrowRight' && previewIndex < assistantImages.length - 1) {
        e.preventDefault();
        setPreviewIndex(previewIndex + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [previewIndex, assistantImages.length, closePreview]);

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
          {data.googleImagesAdded > 0 || data.serpApiImagesAdded > 0 || data.commonsImagesAdded > 0 ? (
            <p className="product-card-assistant__meta">
              {data.serpApiImagesAdded > 0 ? <>SerpApi: +{data.serpApiImagesAdded} </> : null}
              {data.googleImagesAdded > 0 ? <>Google: +{data.googleImagesAdded} </> : null}
              {data.commonsImagesAdded > 0 ? <>Commons: +{data.commonsImagesAdded} </> : null}
              (імпорт у «Фото / файли» через обрані чекбокси)
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
              <p className="product-card-assistant__image-hint">
                Клік по мініатюрі — великий перегляд. Стрілки ← → у вікні перегляду — інші фото.
              </p>
            ) : null}
            {(data.images || []).length > 0 ? (
              <ul className="product-card-assistant__images">
                {(data.images || []).map((im, idx) => (
                  <li key={im.id} className="product-card-assistant__image-item">
                    <div className="product-card-assistant__image-toolbar">
                      <label className="product-card-assistant__image-check">
                        <input
                          type="checkbox"
                          checked={imageIds.has(im.id)}
                          onChange={() => toggleImage(im.id)}
                        />
                        <span className="product-card-assistant__image-check-label">Імпорт</span>
                      </label>
                      <button
                        type="button"
                        className="product-card-assistant__thumb-btn"
                        onClick={() => openPreview(idx)}
                        title="Збільшити"
                        aria-label={`Збільшити зображення ${idx + 1}`}
                      >
                        <img src={im.url} alt="" className="product-card-assistant__thumb" loading="lazy" />
                      </button>
                    </div>
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

          {previewIndex != null &&
            assistantImages[previewIndex] &&
            createPortal(
              <div
                className="product-card-assistant-lightbox"
                role="dialog"
                aria-modal="true"
                aria-label="Перегляд зображення"
                onClick={closePreview}
              >
                <div className="product-card-assistant-lightbox__inner" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="product-card-assistant-lightbox__close"
                    onClick={closePreview}
                    aria-label="Закрити"
                  >
                    ×
                  </button>
                  {assistantImages.length > 1 ? (
                    <>
                      <button
                        type="button"
                        className="product-card-assistant-lightbox__nav product-card-assistant-lightbox__nav--prev"
                        disabled={previewIndex <= 0}
                        onClick={() => previewIndex > 0 && setPreviewIndex(previewIndex - 1)}
                        aria-label="Попереднє фото"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className="product-card-assistant-lightbox__nav product-card-assistant-lightbox__nav--next"
                        disabled={previewIndex >= assistantImages.length - 1}
                        onClick={() =>
                          previewIndex < assistantImages.length - 1 && setPreviewIndex(previewIndex + 1)
                        }
                        aria-label="Наступне фото"
                      >
                        ›
                      </button>
                    </>
                  ) : null}
                  <img
                    src={assistantImages[previewIndex].url}
                    alt={assistantImages[previewIndex].title || 'Прев’ю'}
                    className="product-card-assistant-lightbox__img"
                  />
                  {assistantImages[previewIndex].title ? (
                    <p className="product-card-assistant-lightbox__caption">{assistantImages[previewIndex].title}</p>
                  ) : null}
                  {assistantImages.length > 1 ? (
                    <p className="product-card-assistant-lightbox__counter">
                      {previewIndex + 1} / {assistantImages.length}
                    </p>
                  ) : null}
                </div>
              </div>,
              document.body,
            )}
        </>
      )}
    </aside>
  );
}
