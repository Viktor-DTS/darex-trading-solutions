const mongoose = require('mongoose');

let assistantConnection = null;

/**
 * Окреме з'єднання mongoose до асистентського кластера (Atlas M0 тощо).
 * Моделі асистента реєструвати лише на цьому connection, не на mongoose.model глобально.
 */
async function connectAssistantMongoDB() {
  const uri = String(process.env.ASSISTANT_MONGODB_URI || '').trim();
  if (!uri) {
    console.log('[AssistantMongo] ASSISTANT_MONGODB_URI не задано — асистентська БД вимкнена');
    return null;
  }
  try {
    const masked = uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    console.log('[AssistantMongo] Підключення:', masked);

    assistantConnection = mongoose.createConnection(uri, {
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 60000,
      serverSelectionTimeoutMS: 65000,
      socketTimeoutMS: 45000,
      heartbeatFrequencyMS: 10000,
    });

    assistantConnection.on('connected', () => {
      console.log('[AssistantMongo] ✅ Підключено');
    });
    assistantConnection.on('error', (err) => {
      console.error('[AssistantMongo] Помилка:', err.message);
    });
    assistantConnection.on('disconnected', () => {
      console.log('[AssistantMongo] Відключено');
    });

    await assistantConnection.asPromise();
    return assistantConnection;
  } catch (e) {
    console.warn('[AssistantMongo] Не вдалося підключити:', e.message);
    assistantConnection = null;
    return null;
  }
}

function getAssistantConnection() {
  return assistantConnection;
}

module.exports = { connectAssistantMongoDB, getAssistantConnection };
