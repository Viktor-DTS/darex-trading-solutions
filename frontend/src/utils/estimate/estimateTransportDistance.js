import { parseNumber, roundMoney } from './estimatePrefill';

const KM_TOLERANCE = 1;

function waitForGoogleMaps(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (typeof google !== 'undefined' && google.maps?.DistanceMatrixService) {
        resolve(google.maps);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error('Google Maps API не завантажено'));
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}

export function getTransportLine(lowerLines = []) {
  return (lowerLines || []).find((line) => line.id === 'transport' || line.source === 'task-transport') || null;
}

export async function fetchDrivingDistanceKm(origin, destination) {
  const from = String(origin || '').trim();
  const to = String(destination || '').trim();
  if (!from || !to) {
    throw new Error('Недостатньо адрес для розрахунку відстані');
  }

  const maps = await waitForGoogleMaps();
  return new Promise((resolve, reject) => {
    const service = new maps.DistanceMatrixService();
    service.getDistanceMatrix(
      {
        origins: [from],
        destinations: [to],
        travelMode: maps.TravelMode.DRIVING,
        unitSystem: maps.UnitSystem.METRIC,
        region: 'ua',
      },
      (response, status) => {
        if (status !== 'OK') {
          reject(new Error(`Google Maps: ${status}`));
          return;
        }
        const element = response?.rows?.[0]?.elements?.[0];
        if (!element || element.status !== 'OK') {
          reject(new Error('Не вдалося розрахувати маршрут між адресами'));
          return;
        }
        const oneWayKm = Math.round(Number(element.distance?.value || 0) / 1000);
        resolve(oneWayKm);
      }
    );
  });
}

export function buildTransportDistanceCheck({ oneWayKm, transportKm }) {
  const expectedRoundTripKm = Math.max(0, parseNumber(oneWayKm) * 2);
  const actualKm = parseNumber(transportKm);
  const diff = actualKm - expectedRoundTripKm;
  const ok = expectedRoundTripKm <= 0
    ? true
    : actualKm <= 0
      ? false
      : Math.abs(diff) <= KM_TOLERANCE;

  return {
    ok,
    oneWayKm: parseNumber(oneWayKm),
    expectedRoundTripKm,
    actualKm,
    diff,
  };
}

export function buildTransportDistancePatch(transportLine, expectedRoundTripKm) {
  const qty = parseNumber(expectedRoundTripKm);
  const price = parseNumber(transportLine?.unitPrice);
  return {
    quantity: qty,
    total: roundMoney(qty * price),
  };
}
