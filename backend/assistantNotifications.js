/** Сповіщення, що показує плаваючий асистент (ManagerUserNotification). */
const ASSISTANT_NOTIFICATION_KINDS = [
  'task_cashless_no_invoice_pending',
  'assistant_accountant_relay',
  'assistant_accountant_relay_reply',
];

/**
 * @param {import('mongoose').Model | null | undefined} ManagerUserNotification
 * @param {string} login
 */
async function getAssistantUnreadNotificationCount(ManagerUserNotification, login) {
  const recipientLogin = String(login || '').trim();
  if (!ManagerUserNotification || !recipientLogin) return 0;
  return ManagerUserNotification.countDocuments({
    recipientLogin,
    read: false,
    kind: { $in: ASSISTANT_NOTIFICATION_KINDS },
  });
}

/**
 * @param {import('mongoose').Model | null | undefined} ManagerUserNotification
 * @param {string} login
 */
async function markAssistantNotificationsSeen(ManagerUserNotification, login) {
  const recipientLogin = String(login || '').trim();
  if (!ManagerUserNotification || !recipientLogin) return { modified: 0 };
  const result = await ManagerUserNotification.updateMany(
    {
      recipientLogin,
      read: false,
      kind: { $in: ASSISTANT_NOTIFICATION_KINDS },
    },
    { $set: { read: true } },
  );
  return { modified: result.modifiedCount || 0 };
}

module.exports = {
  ASSISTANT_NOTIFICATION_KINDS,
  getAssistantUnreadNotificationCount,
  markAssistantNotificationsSeen,
};
