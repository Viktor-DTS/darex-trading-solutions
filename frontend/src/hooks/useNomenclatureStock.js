import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import API_BASE_URL from '../config';
import {
  buildProcurementAllowedWarehouseNameSet,
  filterStockWarehousesForProcurement,
} from '../utils/procurementWarehouseFilter';

/**
 * @param {{ name: string, productId?: string }[]} materials
 * @param {{ authHeaders?: Record<string,string>, warehouses?: object[], enabled?: boolean, debounceMs?: number }} options
 */
export function useNomenclatureStock(materials, options = {}) {
  const {
    authHeaders = {},
    warehouses = [],
    enabled = true,
    debounceMs = 320,
  } = options;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  const allowedNameSet = useMemo(
    () => buildProcurementAllowedWarehouseNameSet(warehouses),
    [warehouses],
  );

  const filterWarehouses = useCallback(
    (rows) => filterStockWarehousesForProcurement(rows, allowedNameSet),
    [allowedNameSet],
  );

  const normalizedMaterials = useMemo(() => {
    const seen = new Set();
    return (materials || [])
      .map((m) => ({
        name: String(m?.name || '').trim(),
        productId: String(m?.productId || '').trim(),
      }))
      .filter((m) => {
        if (m.name.length < 2) return false;
        const key = `${m.name.toLowerCase()}\0${m.productId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [materials]);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setLoading(false);
      return undefined;
    }

    if (!normalizedMaterials.length) {
      setItems([]);
      setLoading(false);
      return undefined;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const results = await Promise.all(
          normalizedMaterials.map(async (item) => {
            const q = new URLSearchParams({ name: item.name });
            if (item.productId) q.set('productId', item.productId);
            const res = await fetch(`${API_BASE_URL}/procurement-requests/nomenclature-stock?${q}`, {
              headers: authHeaders,
            });
            if (!res.ok) throw new Error('stock fetch failed');
            const data = await res.json();
            const warehouseRows = filterWarehouses(
              Array.isArray(data.warehouses) ? data.warehouses : [],
            );
            const totalQuantity = warehouseRows.reduce(
              (sum, w) => sum + (Number(w.quantity) || 0),
              0,
            );
            return {
              label: data.label || item.name,
              productId: item.productId,
              totalQuantity,
              warehouses: warehouseRows,
            };
          }),
        );
        if (requestId !== requestIdRef.current) return;
        setItems(results.filter(Boolean));
      } catch (e) {
        console.error('[stock]', e);
        if (requestId !== requestIdRef.current) return;
        setItems(
          normalizedMaterials.map((item) => ({
            label: item.name,
            productId: item.productId,
            totalQuantity: 0,
            warehouses: [],
          })),
        );
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled, normalizedMaterials, authHeaders, filterWarehouses, debounceMs]);

  return { items, loading, hasMaterials: normalizedMaterials.length > 0 };
}
