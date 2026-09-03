/**
 * Доступ до AI-асистента DTS (видимість UI + /api/assistant/*).
 * Зараз лише повні адміністратори; інші ролі — 403.
 */
const ASSISTANT_VISIBLE_ROLES = new Set(['admin', 'administrator']);

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function isAssistantVisibleRole(role) {
  return ASSISTANT_VISIBLE_ROLES.has(normalizeRole(role));
}

/** Express middleware для всіх маршрутів /api/assistant. */
function assistantAccessGuard(req, res, next) {
  const login = req.user?.login;
  if (!login) {
    return res.status(401).json({ error: 'Користувач не визначений' });
  }
  if (!isAssistantVisibleRole(req.user?.role)) {
    return res.status(403).json({ error: 'Асистент доступний лише адміністраторам DTS.' });
  }
  return next();
}

module.exports = {
  ASSISTANT_VISIBLE_ROLES,
  isAssistantVisibleRole,
  assistantAccessGuard,
};
