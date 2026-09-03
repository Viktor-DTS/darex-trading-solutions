/**
 * TTL-кеш для відповідей зовнішніх API.
 *
 * Render/Atlas/Cloudinary мають ліміти на кількість запитів, а панель адміністратора
 * може оновлюватись часто — тому кожен провайдер віддає закешовану відповідь,
 * поки не мине ttl або поки клієнт явно не попросить refresh.
 */
const store = new Map();

async function cached(key, ttlMs, loader, { force = false } = {}) {
  const now = Date.now();
  const hit = store.get(key);
  if (!force && hit && hit.expiresAt > now) {
    return { ...hit.value, cached: true, fetchedAt: hit.fetchedAt };
  }
  if (hit?.inFlight) return hit.inFlight;

  const inFlight = (async () => {
    try {
      const value = await loader();
      const fetchedAt = new Date().toISOString();
      store.set(key, { value, fetchedAt, expiresAt: Date.now() + ttlMs });
      return { ...value, cached: false, fetchedAt };
    } catch (error) {
      // Прострочені дані краще, ніж порожній борд: віддаємо їх із позначкою stale.
      if (hit?.value) {
        store.set(key, { ...hit, expiresAt: Date.now() + 30_000 });
        return { ...hit.value, cached: true, stale: true, fetchedAt: hit.fetchedAt, staleReason: error.message };
      }
      store.delete(key);
      throw error;
    }
  })();

  store.set(key, { ...(hit || {}), inFlight });
  try {
    return await inFlight;
  } finally {
    const current = store.get(key);
    if (current?.inFlight === inFlight) delete current.inFlight;
  }
}

function invalidate(prefix = '') {
  for (const key of store.keys()) {
    if (!prefix || key.startsWith(prefix)) store.delete(key);
  }
}

module.exports = { cached, invalidate };
