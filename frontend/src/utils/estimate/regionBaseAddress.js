import API_BASE_URL from '../../config';
import regionBasesFallback from '../../data/regionServiceBases.json';

function normalizeRegion(value) {
  return String(value || '').trim().toLowerCase();
}

export function resolveRegionBaseAddress(serviceRegion, warehouses = []) {
  const target = normalizeRegion(serviceRegion);
  if (!target) return regionBasesFallback['Україна'] || '';

  const matched = (warehouses || []).filter((wh) => {
    if (wh?.isActive === false) return false;
    const whRegion = normalizeRegion(wh.region);
    if (!whRegion) return false;
    return whRegion === target || whRegion.includes(target) || target.includes(whRegion);
  });

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

  if (withAddress.length) return String(withAddress[0].address).trim();

  return regionBasesFallback[serviceRegion] || regionBasesFallback['Україна'] || '';
}

export async function fetchActiveWarehouses() {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE_URL}/warehouses`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error('Не вдалося завантажити склади');
  return response.json();
}
