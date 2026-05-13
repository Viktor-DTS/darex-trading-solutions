/**
 * Збірка текстового контексту для LLM: активна панель у клієнті + профіль у Mongo.
 */
const mongoose = require('mongoose');

/**
 * @param {string} login
 * @returns {Promise<{ name?: string, role?: string, region?: string } | null>}
 */
async function loadUserLeanForAssistant(login) {
  const li = String(login || '').trim();
  if (!li) return null;
  const User = mongoose.models.User;
  if (!User) return null;
  return User.findOne({ login: li }).select('name role region').lean().catch(() => null);
}

/**
 * @param {{
 *   panelId?: string,
 *   panelLabel?: string,
 *   panelHint?: string,
 *   path?: string,
 *   userRole?: string,
 *   userName?: string,
 *   userRegion?: string,
 * }} client — з body.context
 * @param {{ name?: string, role?: string, region?: string } | null} serverUser
 * @param {string} login
 */
function formatAssistantSessionBlock({ client, serverUser, login }) {
  const li = String(login || '').trim();
  const panelId = String(client?.panelId || '').trim();
  const panelLabel = String(client?.panelLabel || '').trim().slice(0, 240);
  const panelHint = String(client?.panelHint || '').trim().slice(0, 1200);
  const path = String(client?.path || '').trim().slice(0, 400);
  const roleClient = String(client?.userRole || '').trim().slice(0, 80);
  const nameClient = String(client?.userName || '').trim().slice(0, 120);
  const regionClient = String(client?.userRegion || '').trim().slice(0, 200);

  const su = serverUser || {};
  const roleDb = String(su.role || '').trim().slice(0, 80);
  const regionDb = String(su.region || '').trim().slice(0, 200);
  const nameDb = String(su.name || '').trim().slice(0, 120);

  const lines = [];

  lines.push('[DTS/UI] Поточне місце користувача у веб-інтерфейсі DTS (оновлюється з клієнта на кожне повідомлення):');

  if (panelLabel || panelId) {
    lines.push(`• Відкрита панель: «${panelLabel || panelId}»${panelId ? ` [id: ${panelId}]` : ''}.`);
  } else {
    lines.push('• Відкрита панель: дані від клієнта відсутні — не припускай, на якому екрані людина.');
  }

  if (panelHint) {
    lines.push(`• Призначення цього екрана в системі: ${panelHint}`);
  }

  if (path) {
    lines.push(`• Маршрут у браузері: ${path}`);
  }

  lines.push(`• Передано з клієнта: роль «${roleClient || '—'}», ім’я «${nameClient || '—'}», регіон «${regionClient || '—'}».`);

  lines.push('');
  lines.push('[DTS/User] Профіль у базі DTS (використовується сервером для доступу до заявок та фільтрів):');
  lines.push(`• login: ${li}`);
  lines.push(`• роль у БД: ${roleDb || '—'}`);
  lines.push(`• регіон у БД: ${regionDb || '— порожньо / може трактуватися як загальний (Україна)'}`);
  lines.push(`• ПІБ у БД: ${nameDb || '—'}`);

  lines.push('');
  lines.push(
    [
      'Правила поведінки:',
      'орієнтуй підказки на поточну панель із [DTS/UI] — не описуй екран іншої вкладки як «те, що перед користувачем»;',
      'якщо людина не на сервісі, а питає про операції з KV-таблицею — поясни різницю та куди перемкнутися (найчастіше «Сервісна служба» або «Оператор»);',
      'якщо у повідомленні згадано номер заявки, але серверне підстановлення даних відсутнє або блок [DTS] каже недоступно — не вигадуй статус, суми чи склад; коротко поясни можливі причини (регіон, закріплені клієнти менеджера, відсутність у призначених інженерах);',
      'якщо [DTS] уже підставив дані конкретної заявки, але користувач на панелі з кількома підвкладками (наприклад «Бух на затвердженні»: черга на підтвердження проти архіву виконаних) — рядка заявки у видимій таблиці може не бути;',
      'не стверджуй, що заявка «вже є в таблиці на екрані» лише через відкриту горизонтальну вкладку: запропонуй перемкнути підвкладку (архів виконаних тощо), глобальний пошук у DTS або кнопку «Відкрити форму заявки» під чатом, якщо в ході є [DTS/UI-action];',
    ].join(' '),
  );

  return lines.join('\n');
}

module.exports = { loadUserLeanForAssistant, formatAssistantSessionBlock };
