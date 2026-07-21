import API_BASE_URL from '../../config';
import regionBasesFallback from '../../data/regionServiceBases.json';

function normalizeRegion(value) {
  return String(value || '').trim().toLowerCase();
}

function filterWarehousesByRegion(serviceRegion, warehouses = []) {
  const target = normalizeRegion(serviceRegion);
  if (!target) return [];

  return (warehouses || []).filter((wh) => {
    if (wh?.isActive === false) return false;
    const whRegion = normalizeRegion(wh.region);
    if (!whRegion) return false;
    return whRegion === target || whRegion.includes(target) || target.includes(whRegion);
  });
}

export function resolveRegionBaseWarehouse(serviceRegion, warehouses = []) {
  const matched = filterWarehousesByRegion(serviceRegion, warehouses);

  const designated = matched.find(
    (wh) => wh.isRegionBase === true && String(wh.address || '').trim()
  );
  if (designated) {
    return {
      id: designated._id || designated.id,
      name: String(designated.name || '').trim(),
      address: String(designated.address).trim(),
      source: 'designated',
    };
  }

  const withAddress = matched
    .filter((wh) => String(wh.address || '').trim())
    .sort((a, b) => {
      const aService = /сервис|service|зип/i.test(String(a.name || '')) ? 0 : 1;
      const bService = /сервис|service|зип/i.test(String(b.name || '')) ? 0 : 1;
      if (aService !== bService) return aService - bService;
      const aStock = a.isStockSource === false ? 1 : 0;
      const bStock = b.isStockSource === false ? 1 : 0;
      if (aStock !== bStock) return aStock - bStock;
      return String(a.name || '').localeCompare(String(b.name || ''), 'uk');
    });

  if (withAddress.length) {
    return {
      id: withAddress[0]._id || withAddress[0].id,
      name: String(withAddress[0].name || '').trim(),
      address: String(withAddress[0].address).trim(),
      source: 'fallback',
    };
  }

  const fallbackAddress = regionBasesFallback[serviceRegion] || regionBasesFallback['Україна'] || '';
  if (fallbackAddress) {
    return { id: null, name: '', address: fallbackAddress, source: 'static' };
  }

  return null;
}

export function resolveRegionBaseAddress(serviceRegion, warehouses = []) {
  return resolveRegionBaseWarehouse(serviceRegion, warehouses)?.address || '';
}

export async function fetchActiveWarehouses() {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE_URL}/warehouses`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error('Не вдалося завантажити склади');
  return response.json();
}
