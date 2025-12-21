const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');

// Получаем токен бота из переменных окружения
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// --- ПЕРЕМЕННЫЕ ДЛЯ ПРОКСИРОВАНИЯ К ДРУГОМУ БОТУ ЧЕРЕЗ ГРУППУ ---
// ID или @username реального публичного AI-бота в Telegram.
// ВНИМАНИЕ: Если это username, укажите его БЕЗ символа '@' в переменной окружения Render.
// Например, для @gigachat_bot здесь должно быть "gigachat_bot". Код сам добавит '@'.
const TARGET_AI_BOT_USERNAME = process.env.TARGET_AI_BOT_USERNAME; 
// ID группового чата, в котором будут общаться наши боты.
// Получи его с помощью @get_id_bot или другим способом (отрицательное число, например -1234567890123).
const INTERMEDIARY_GROUP_CHAT_ID_STR = process.env.INTERMEDIARY_GROUP_CHAT_ID; // Получаем как строку
const INTERMEDIARY_GROUP_CHAT_ID = Number(INTERMEDIARY_GROUP_CHAT_ID_STR); // Преобразуем в число сразу

// --- Хранение запросов для связывания ответов ---
// { id_сообщения_от_нашего_бота_в_группе: id_чата_пользователя }
const pendingQueries = {};

// --- Вспомогательная функция для экранирования символов MarkdownV2 ---
function escapeMarkdownV2(text) {
    // Символы, которые нужно экранировать в MarkdownV2:
    // _ * [ ] ( ) ~ ` > # + - = | { } . !
    // Слэш \ не экранируется, если он сам не является частью текста
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}


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

  if (!TARGET_AI_BOT_USERNAME || !INTERMEDIARY_GROUP_CHAT_ID_STR || isNaN(INTERMEDIARY_GROUP_CHAT_ID)) {
    console.error("[Proxy AI] TARGET_AI_BOT_USERNAME or INTERMEDIARY_GROUP_CHAT_ID is not set or invalid (not a number).");
    return bot.sendMessage(chatId, "Ошибка: Наш AI-бот-помощник или групповой чат не настроены или ID группы неверный. Пожалуйста, свяжитесь с администратором.");
  }

  try {
    // Экранируем пользовательский запрос для MarkdownV2
    const escapedQuery = escapeMarkdownV2(query);
    
    // Формируем запрос с явным упоминанием AI-бота, используя Zero Width Non-Joiner (U+200C)
    // и MarkdownV2 для создания сущности упоминания.
    // Это должно помочь GigaChat увидеть себя упомянутым.
    const messageForAIBot = `@\u200C${TARGET_AI_BOT_USERNAME} ${escapedQuery}`; 
    console.log(`[Proxy AI] Sending formatted message "${messageForAIBot}" to group ID: ${INTERMEDIARY_GROUP_CHAT_ID}`);

    // Отправляем сообщение в групповой чат
    const sentMessage = await bot.sendMessage(
      INTERMEDIARY_GROUP_CHAT_ID,
      messageForAIBot,
      { parse_mode: 'MarkdownV2' } // ОБЯЗАТЕЛЬНО указываем parse_mode
    );
    
    // Сохраняем информацию, чтобы знать, кому отвечать, когда придет ответ от AI-бота
    pendingQueries[sentMessage.message_id] = chatId; // pendingQueries[id нашего сообщения в группе] = id чата пользователя

    await bot.sendMessage(chatId, "AI думает...", { reply_to_message_id: sentMessage.message_id });

  } catch (error) {
    console.error('[Proxy AI] Error forwarding message to AI bot via group:', error.message);
    if (error.response && error.response.data && error.response.data.description) {
        console.error('[Proxy AI] Telegram API Error description:', error.response.data.description);
        if (error.response.data.description.includes("group chat was upgraded to a supergroup")) {
            return bot.sendMessage(chatId, "Ошибка Telegram API: Кажется, ID вашей промежуточной группы устарел. Пожалуйста, пересоздайте группу и получите новый ID, или проверьте, что ID группы в Render актуален.");
        }
    }
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
  if (chatId === INTERMEDIARY_GROUP_CHAT_ID) { 
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
