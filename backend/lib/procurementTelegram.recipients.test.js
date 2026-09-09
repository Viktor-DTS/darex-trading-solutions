/**
 * Перевірка: VZ Telegram — чекбокс + фільтр заявника (не всім підряд).
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
      notificationSettings: {
        procurementRequestCreated: true,
        procurementExecutorCompleted: true,
        procurementWarehouseConfirmed: true,
      },
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
      login: 'zaporozhets',
      role: 'manager',
      telegramChatId: '333',
      notificationSettings: { procurementWarehouseConfirmed: true },
    },
    {
      login: 'other-manager',
      role: 'manager',
      telegramChatId: '444',
      notificationSettings: { procurementWarehouseConfirmed: true, procurementExecutorCompleted: true },
    },
    {
      login: 'requester-no-box',
      role: 'manager',
      telegramChatId: '555',
      notificationSettings: {},
    },
  ];

  const deps = { User: mockUser(users) };
  const prZaporozhets = { requesterLogin: 'zaporozhets' };
  const prRequesterNoBox = { requesterLogin: 'requester-no-box' };

  const created = await collectProcurementEventChatIds(deps, 'created', prZaporozhets);
  assert.deepStrictEqual(
    created.sort(),
    ['-1001234567890', '111'].sort(),
    'created: усі з чекбоксом, без фільтра заявника'
  );

  const execOther = await collectProcurementEventChatIds(deps, 'executor_completed', prZaporozhets);
  assert.deepStrictEqual(
    execOther.sort(),
    ['-1001234567890', '222', '333'].sort(),
    'executor_completed: заявник цієї заявки + адмін; buyer/other-manager з чекбоксом чужі не отримують'
  );

  const wh = await collectProcurementEventChatIds(deps, 'warehouse_confirmed', prZaporozhets);
  assert.deepStrictEqual(
    wh.sort(),
    ['-1001234567890', '222', '333'].sort(),
    'warehouse_confirmed: заявник + адмін з чекбоксом; інший менеджер з чекбоксом — ні'
  );

  const whOtherManager = await collectProcurementEventChatIds(deps, 'warehouse_confirmed', {
    requesterLogin: 'other-manager',
  });
  assert.deepStrictEqual(
    whOtherManager.sort(),
    ['-1001234567890', '222', '444'].sort(),
    'warehouse_confirmed: лише заявник цієї заявки, не всі менеджери з чекбоксом'
  );

  const whNoBox = await collectProcurementEventChatIds(deps, 'warehouse_confirmed', prRequesterNoBox);
  assert.deepStrictEqual(
    whNoBox.sort(),
    ['-1001234567890', '222', '555'].sort(),
    'warehouse_confirmed: заявник отримує завжди, навіть без чекбокса'
  );

  const done = await collectProcurementEventChatIds(deps, 'request_completed', prZaporozhets);
  assert.deepStrictEqual(
    done.sort(),
    ['-1001234567890', '222', '333'].sort(),
    'request_completed: заявник + адмін з чекбоксом'
  );

  const rej = await collectProcurementEventChatIds(deps, 'rejected', prZaporozhets);
  assert.deepStrictEqual(
    rej.sort(),
    ['-1001234567890', '222', '333'].sort(),
    'rejected: заявник + адмін завжди'
  );

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
