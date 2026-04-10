import React, { useState, useEffect, useMemo, useCallback } from 'react';
import API_BASE_URL from '../../config';
import ProductCardQuickCreateModal from '../equipment/ProductCardQuickCreateModal';
import './ReceiptProductCardsTab.css';

function flattenCategories(nodes, level = 0) {
  let list = [];
  (nodes || []).forEach((n) => {
    list.push({ ...n, level });
    if (n.children?.length) list = list.concat(flattenCategories(n.children, level + 1));
  });
  return list;
}

function categoryIdOf(card) {
  if (!card?.categoryId) return '';
  return String(card.categoryId._id || card.categoryId);
}

/**
 * Вкладка «Надходження»: вибір карточки продукту в основній зоні (як відвантаження), потім форма прийому в модалці.
 */
export default function ReceiptProductCardsTab({ user, warehouses, onOpenReceiptWithCard, onOpenReceiptWithoutCard }) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [itemKindFilter, setItemKindFilter] = useState('');
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoriesFlat, setCategoriesFlat] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 320);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/categories?tree=true`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const tree = await res.json();
        if (!cancelled) setCategoriesFlat(flattenCategories(Array.isArray(tree) ? tree : []));
      } catch (_) {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const q = new URLSearchParams({ limit: '400' });
      if (debouncedSearch) q.set('search', debouncedSearch);
      const res = await fetch(`${API_BASE_URL}/product-cards?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setCards([]);
        return;
      }
      const data = await res.json();
      setCards(Array.isArray(data) ? data : []);
    } catch (_) {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const filteredCards = useMemo(() => {
    let list = cards;
    if (categoryFilter) {
      list = list.filter((c) => categoryIdOf(c) === categoryFilter);
    }
    if (itemKindFilter) {
      list = list.filter((c) => (c.itemKind || 'equipment') === itemKindFilter);
    }
    return list;
  }, [cards, categoryFilter, itemKindFilter]);

  return (
    <div className="inventory-tab-content receipt-product-cards-tab">
      <div className="inventory-header receipt-product-cards-tab__header">
        <div className="receipt-product-cards-tab__header-main">
          <h2>Надходження товарів</h2>
          <div className="receipt-product-cards-tab__intro">
            <button
              type="button"
              className="btn-primary receipt-product-cards-tab__add-card-btn"
              onClick={() => setShowCreateModal(true)}
            >
              + Додати карточку товару
            </button>
            <p className="inventory-description receipt-product-cards-tab__intro-desc">
              Додавання нового обладнання на склад від постачальників
            </p>
          </div>
          <p className="inventory-description receipt-product-cards-tab__subdesc">
            Оберіть карточку зі списку нижче — відкриється форма прийому. Або створіть нову карточку кнопкою ліворуч, або прийміть позицію без карточки.
          </p>
        </div>
        <div className="receipt-product-cards-tab__actions">
          <button type="button" className="btn-secondary" onClick={() => onOpenReceiptWithoutCard()}>
            Прийом без карточки
          </button>
        </div>
      </div>

      <div className="receipt-product-cards-tab__filters">
        <div className="receipt-product-cards-tab__filter">
          <label htmlFor="receipt-card-search">Пошук</label>
          <input
            id="receipt-card-search"
            type="search"
            className="receipt-product-cards-tab__search"
            placeholder="Тип, виробник, назва…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="receipt-product-cards-tab__filter">
          <label htmlFor="receipt-cat-filter">Група номенклатури (1С)</label>
          <select
            id="receipt-cat-filter"
            className="receipt-product-cards-tab__select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">Усі групи</option>
            {categoriesFlat.map((c) => (
              <option key={c._id} value={String(c._id)}>
                {'\u00A0'.repeat((c.level || 0) * 2)}
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="receipt-product-cards-tab__filter">
          <label htmlFor="receipt-kind-filter">Вид</label>
          <select
            id="receipt-kind-filter"
            className="receipt-product-cards-tab__select"
            value={itemKindFilter}
            onChange={(e) => setItemKindFilter(e.target.value)}
          >
            <option value="">Усі</option>
            <option value="equipment">Обладнання</option>
            <option value="parts">Деталі / ЗІП</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading-indicator" style={{ marginTop: 24 }}>
          Завантаження карточок…
        </div>
      ) : filteredCards.length === 0 ? (
        <p className="inventory-description receipt-product-cards-tab__empty" style={{ marginTop: 24 }}>
          Нічого не знайдено. Змініть фільтри або створіть нову карточку продукту.
        </p>
      ) : (
        <ul className="receipt-product-cards-tab__grid">
          {filteredCards.map((card) => {
            const id = String(card._id);
            const catName = card.categoryId?.name || '';
            return (
              <li key={id}>
                <button
                  type="button"
                  className="receipt-product-cards-tab__card"
                  onClick={() => onOpenReceiptWithCard(card)}
                >
                  <span className="receipt-product-cards-tab__card-type">{card.type || '—'}</span>
                  {card.displayName ? (
                    <span className="receipt-product-cards-tab__card-display">{card.displayName}</span>
                  ) : null}
                  <span className="receipt-product-cards-tab__card-manuf">{card.manufacturer || '—'}</span>
                  {catName ? <span className="receipt-product-cards-tab__card-cat">{catName}</span> : null}
                  {card.isActive === false ? (
                    <span className="receipt-product-cards-tab__card-inactive">Вимкнена в довіднику</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showCreateModal && (
        <ProductCardQuickCreateModal
          user={user}
          warehouses={warehouses}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            loadCards();
          }}
        />
      )}
    </div>
  );
}
