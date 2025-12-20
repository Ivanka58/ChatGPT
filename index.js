const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');

// Получаем токен бота из переменных окружения
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// --- НОВЫЕ ПЕРЕМЕННЫЕ ДЛЯ ПРОКСИРОВАНИЯ К ДРУГОМУ БОТУ ЧЕРЕЗ ГРУППУ ---
// ID или @username реального публичного AI-бота в Telegram.
// ВНИМАНИЕ: Если это username, укажите его БЕЗ символа '@' в переменной окружения Render.
// Например, для @gigachat_bot здесь должно быть "gigachat_bot". Код сам добавит '@'.
const TARGET_AI_BOT_USERNAME = process.env.TARGET_AI_BOT_USERNAME; 
// ID группового чата, в котором будут общаться наши боты.
// Получи его с помощью @get_id_bot или другим способом (отрицательное число, например -1234567890123).
const INTERMEDIARY_GROUP_CHAT_ID = process.env.INTERMEDIARY_GROUP_CHAT_ID;

// --- Хранение запросов для связывания ответов ---
// { id_сообщения_от_нашего_бота_в_группе: id_чата_пользователя }
const pendingQueries = {};


// --- Вспомогательная функция для отправки основного меню ---
async function sendMainMenu(chatId, message = 'Выберите действие:') {
  const keyboard = {
    reply_markup: {
      keyboard: [
        [{ text: 'Начать общение' }],
        [{ text: 'Очистить историю диалога' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
  await bot.sendMessage(chatId, message, keyboard);
}

// --- Функция для пересылки запроса другому AI-боту через группу ---
async function forwardToAIBot(chatId, query) {
  console.log(`[Proxy AI] User ${chatId} asked: "${query}"`);

  if (!TARGET_AI_BOT_USERNAME || !INTERMEDIARY_GROUP_CHAT_ID) {
    console.error("[Proxy AI] TARGET_AI_BOT_USERNAME or INTERMEDIARY_GROUP_CHAT_ID is not set.");
    return bot.sendMessage(chatId, "Ошибка: Наш AI-бот-помощник или групповой чат не настроены. Пожалуйста, свяжитесь с администратором.");
  }

  try {
    // ФОРМИРУЕМ ЗАПРОС С УПОМИНАНИЕМ AI-БОТА
    const messageForAIBot = `${TARGET_AI_BOT_USERNAME} ${query}`; 
    console.log(`[Proxy AI] Sending to group ${INTERMEDIARY_GROUP_CHAT_ID}: "${messageForAIBot}"`);

    // Отправляем сообщение в групповой чат, где присутствуют оба бота.
    const sentMessage = await bot.sendMessage(INTERMEDIARY_GROUP_CHAT_ID, messageForAIBot);
    
    // Сохраняем информацию, чтобы знать, кому отвечать, когда придет ответ от AI-бота
    pendingQueries[sentMessage.message_id] = chatId; // pendingQueries[id нашего сообщения в группе] = id чата пользователя

    await bot.sendMessage(chatId, "AI думает...", { reply_to_message_id: sentMessage.message_id });

  } catch (error) {
    console.error('[Proxy AI] Error forwarding message to AI bot via group:', error.message);
    return bot.sendMessage(chatId, "Произошла ошибка при отправке запроса AI. Пожалуйста, попробуйте еще раз позже.");
  }
}

// --- Обработчик команды /start ---
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 'Привет, я бесплатный чат. Если ты сюда попал, значит я лично дал тебе доступ. Поздравляю! Ты избранный! Развлекайся 💘');
  await sendMainMenu(chatId);
});

// --- Единый обработчик для всех текстовых сообщений ---
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  // --- Если это сообщение пришло из нашей *промежуточной группы* ---
  if (String(chatId) === String(INTERMEDIARY_GROUP_CHAT_ID)) { // Сравниваем как строки, чтобы избежать проблем с типами
    // Проверяем, является ли это ответом от *нашего* сообщения, отправленного в группу
    if (msg.reply_to_message && pendingQueries[msg.reply_to_message.message_id]) {
      const originalUserChatId = pendingQueries[msg.reply_to_message.message_id];
      const aiResponseText = msg.text;

      console.log(`[Proxy AI] Received AI response from group for original user ${originalUserChatId}: "${aiResponseText.substring(0, 50)}..."`);
      
      // Отправляем ответ AI пользователю
      await bot.sendMessage(originalUserChatId, aiResponseText);
      
      // Удаляем запрос из очереди
      delete pendingQueries[msg.reply_to_message.message_id];
      return; // Обработали ответ AI, дальше не идем
    }
  }

  // --- Обработка команд и запросов пользователя (если сообщение пришло не из промежуточной группы) ---
  if (text === 'Начать общение') {
    await bot.sendMessage(chatId, 'Задавайте ваш вопрос:');
  } else if (text === 'Очистить историю диалога') {
    await bot.sendMessage(chatId, 'Внимание! Вы точно хотите удалить историю диалога? Её невозможно восстановить!', {
      reply_markup: {
        keyboard: [
          [{ text: 'Удалить ❌' }],
          [{ text: 'Отмена' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
  }
  else if (text === 'Удалить ❌') {
    await bot.sendMessage(chatId, 'История диалога очищена.');
    await sendMainMenu(chatId, 'Что вы хотите сделать дальше?');
  } else if (text === 'Отмена') {
    await bot.sendMessage(chatId, 'Очистка истории диалога отменена.');
    await sendMainMenu(chatId, 'Что вы хотите сделать дальше?');
  }
  // Пересылаем все остальные текстовые сообщения AI-боту через группу
  else if (!text.startsWith('/')) {
    if (text.trim().length > 0) {
      await bot.sendChatAction(chatId, 'typing');
      await forwardToAIBot(chatId, text); // ИСПОЛЬЗУЕМ ФУНКЦИЮ ПРОКСИ
    } else {
      await bot.sendMessage(chatId, "Пожалуйста, введите ваш вопрос.");
    }
  }
});

// --- Функция для отправки сообщения "Я жив!" каждые 10 минут ---
function sendAliveMessage() {
  const chatId = 6749286679; // Ваш ID чата
  // Добавлена обработка ошибок для отправки сообщения, чтобы не крашить бота
  bot.sendMessage(chatId, 'Я жив! (Ping)').catch(err => console.error("Error sending alive message:", err.message));
}

// --- Отправка сообщения "Я жив!" каждые 10 минут ---
setInterval(sendAliveMessage, 10 * 60 * 1000);

// --- HTTP сервер для Render ---
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Telegram Bot HTTP Server is running and responding to health checks.');
});

server.listen(PORT, () => {
  console.log(`HTTP server is running on port ${PORT}`);
});
