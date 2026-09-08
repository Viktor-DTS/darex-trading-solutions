/**
 * Перевірка: VZ Telegram отримувачі за чекбоксами + адмінський канал.
 * Запуск: node lib/procurementTelegram.recipients.test.js
 */
const assert = require('assert');
const { collectProcurementEventChatIds, EVENT_SETTING_FIELD } = require('./procurementTelegram');

function mockUser(users) {
  return {
    find() {
      return {
        select() {
          return { lean: async () => users };
        },
      };
    },
  };
}

async function run() {
  process.env.TELEGRAM_ADMIN_CHAT_ID = '-1001234567890';
  process.env.ADMIN_TELEGRAM_CHAT_ID = '';

  const users = [
    {
      login: 'buyer',
      role: 'vidzakupok',
      telegramChatId: '111',
      notificationSettings: { procurementExecutorCompleted: true, procurementWarehouseConfirmed: false },
    },
    {
      login: 'admin1',
      role: 'admin',
      telegramChatId: '222',
      notificationSettings: {
        procurementExecutorCompleted: true,
        procurementWarehouseConfirmed: true,
        procurementRequestCompleted: true,
        procurementRequestRejected: false,
      },
    },
    {
      login: 'manager',
      role: 'manager',
      telegramChatId: '333',
      notificationSettings: {},
    },
  ];

  const deps = { User: mockUser(users) };

  const exec = await collectProcurementEventChatIds(deps, 'executor_completed');
  assert.deepStrictEqual(exec.sort(), ['-1001234567890', '111', '222'].sort(), 'executor_completed: чекбокс + адмін-канал');

  const wh = await collectProcurementEventChatIds(deps, 'warehouse_confirmed');
  assert.deepStrictEqual(wh.sort(), ['-1001234567890', '222'].sort(), 'warehouse_confirmed: лише хто має чекбокс');

  const done = await collectProcurementEventChatIds(deps, 'request_completed');
  assert.deepStrictEqual(done.sort(), ['-1001234567890', '222'].sort(), 'request_completed: адмін з чекбоксом');

  const rej = await collectProcurementEventChatIds(deps, 'rejected');
  assert.deepStrictEqual(rej.sort(), ['-1001234567890', '222'].sort(), 'rejected: адмін завжди, навіть без чекбокса');

  assert.strictEqual(EVENT_SETTING_FIELD.executor_completed, 'procurementExecutorCompleted');
  assert.strictEqual(EVENT_SETTING_FIELD.warehouse_confirmed, 'procurementWarehouseConfirmed');
  assert.strictEqual(EVENT_SETTING_FIELD.request_completed, 'procurementRequestCompleted');
  assert.strictEqual(EVENT_SETTING_FIELD.rejected, 'procurementRequestRejected');

  console.log('procurementTelegram.recipients.test.js OK');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
