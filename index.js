const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');

// Получаем токен бота из переменных окружения
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// --- ПЕРЕМЕННЫЕ ДЛЯ ПРОКСИРОВАНИЯ К ДРУГОМУ БОТУ ЧЕРЕЗ ГРУППУ ---
// Username целевого AI-бота (например, "Mira"). Используется для идентификации сообщений в группе.
const TARGET_AI_BOT_USERNAME = process.env.TARGET_AI_BOT_USERNAME; 
// Числовой ID целевого AI-бота (например, "123456789"). Более надежный способ идентификации.
// ОБЯЗАТЕЛЬНО получите его через @userinfobot и добавьте в переменные окружения Render!
const TARGET_AI_BOT_NUMERIC_ID_STR = process.env.TARGET_AI_BOT_NUMERIC_ID;
const TARGET_AI_BOT_NUMERIC_ID = Number(TARGET_AI_BOT_NUMERIC_ID_STR); // Преобразуем в число

// ID группового чата, в котором будут общаться наши боты.
const INTERMEDIARY_GROUP_CHAT_ID_STR = process.env.INTERMEDIARY_GROUP_CHAT_ID; 
const INTERMEDIARY_GROUP_CHAT_ID = Number(INTERMEDIARY_GROUP_CHAT_ID_STR);

// --- Глобальная переменная для хранения ID последнего сообщения от AI-бота (Mira) в группе ---
let lastMiraMessageId = null;

// --- Хранение запросов для связывания ответов ---
// { id_сообщения_от_нашего_бота_в_группе: { userChatId: ID_чата_пользователя, thinkingMessageId: ID_сообщения_AI_думает_у_пользователя } }
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
// Принимает originalUserMessageId, чтобы отправить "AI думает..." как ответ на него.
async function forwardToAIBot(chatId, query, originalUserMessageId) {
  console.log(`[Proxy AI] User ${chatId} asked: "${query}"`);

  if (!TARGET_AI_BOT_USERNAME || !TARGET_AI_BOT_NUMERIC_ID_STR || isNaN(TARGET_AI_BOT_NUMERIC_ID) || !INTERMEDIARY_GROUP_CHAT_ID_STR || isNaN(INTERMEDIARY_GROUP_CHAT_ID)) {
    console.error("[Proxy AI] One or more required environment variables (TARGET_AI_BOT_USERNAME, TARGET_AI_BOT_NUMERIC_ID, INTERMEDIARY_GROUP_CHAT_ID) are not set or invalid.");
    return bot.sendMessage(chatId, "Ошибка: Настройки AI-бота-помощника неполные. Пожалуйста, свяжитесь с администратором (проверьте ID бота и группы).");
  }

  let thinkingMessage = null;
  try {
    // 1. Отправляем "AI думает..." как ответ на сообщение пользователя
    thinkingMessage = await bot.sendMessage(chatId, "AI думает...", { reply_to_message_id: originalUserMessageId });

    // 2. Отправляем запрос пользователя в нашу промежуточную группу.
    // Если lastMiraMessageId не установлен (например, при первом запуске или Mira еще ничего не писала),
    // отправляем сообщение без ответа, надеясь, что Mira на него среагирует или напишет что-то,
    // что мы сможем запомнить.
    const sendMessageOptions = {};
    if (lastMiraMessageId) {
        sendMessageOptions.reply_to_message_id = lastMiraMessageId;
        console.log(`[Proxy AI] Replying to Mira's last message (${lastMiraMessageId}) in group ${INTERMEDIARY_GROUP_CHAT_ID} with: "${query}"`);
    } else {
        console.log(`[Proxy AI] lastMiraMessageId is null. Sending direct message to group ${INTERMEDIARY_GROUP_CHAT_ID} with: "${query}"`);
        await bot.sendMessage(chatId, "Начальный запрос отправлен. Если бот не отвечает, убедитесь, что Mira активна в группе.", { reply_to_message_id: originalUserMessageId });
    }

    const sentMessageToGroup = await bot.sendMessage(
      INTERMEDIARY_GROUP_CHAT_ID,
      query,
      sendMessageOptions
    );
    
    // Сохраняем информацию, чтобы знать, кому отвечать и какое сообщение удалять
    pendingQueries[sentMessageToGroup.message_id] = { 
      userChatId: chatId, 
      thinkingMessageId: thinkingMessage.message_id 
    };

  } catch (error) {
    console.error('[Proxy AI] Error forwarding message to AI bot via group:', error.message);
    if (axios.isAxiosError(error) && error.response) {
        console.error('[Proxy AI] Telegram API Error response:', error.response.data);
        if (error.response.data.description && error.response.data.description.includes("group chat was upgraded to a supergroup")) {
            return bot.sendMessage(chatId, "Ошибка Telegram API: Кажется, ID вашей промежуточной группы устарел. Пожалуйста, пересоздайте группу и получите новый ID, или проверьте, что ID группы в Render актуален.");
        }
    } else {
        console.error('[Proxy AI] Unknown error object:', error);
    }
    // Если произошла ошибка, и сообщение "AI думает..." было отправлено, удалим его
    if (thinkingMessage) {
        try {
            await bot.deleteMessage(chatId, thinkingMessage.message_id);
        } catch (deleteError) {
            console.error("Error deleting thinking message after original error:", deleteError.message);
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

  // --- Идентификация AI-бота Mira в группе и запоминание ее последнего сообщения ---
  // Сравниваем по ID, так как это более надежно, чем username.
  if (chatId === INTERMEDIARY_GROUP_CHAT_ID) {
      if (msg.from && (msg.from.id === TARGET_AI_BOT_NUMERIC_ID || msg.from.username === TARGET_AI_BOT_USERNAME)) {
          lastMiraMessageId = msg.message_id;
          console.log(`[Proxy AI] Updated lastMiraMessageId to: ${lastMiraMessageId}`);
      }

      // --- Если это сообщение пришло из нашей *промежуточной группы* и является ответом на наше сообщение ---
      if (msg.reply_to_message && pendingQueries[msg.reply_to_message.message_id]) {
        const queryData = pendingQueries[msg.reply_to_message.message_id];
        const originalUserChatId = queryData.userChatId;
        const thinkingMessageId = queryData.thinkingMessageId;
        const aiResponseText = msg.text;

        console.log(`[Proxy AI] Received AI response from group for original user ${originalUserChatId}: "${aiResponseText.substring(0, 50)}..."`);
        
        // 1. Удаляем сообщение "AI думает..."
        try {
          await bot.deleteMessage(originalUserChatId, thinkingMessageId);
        } catch (deleteError) {
          console.error(`Error deleting thinking message ${thinkingMessageId} in chat ${originalUserChatId}:`, deleteError.message);
        }

        // 2. Отправляем ответ AI пользователю
        await bot.sendMessage(originalUserChatId, aiResponseText);
        
        // 3. Удаляем запрос из очереди
        delete pendingQueries[msg.reply_to_message.message_id];
        return;
      }
  }

  // --- Обработка команд и запросов пользователя (если сообщение пришло не из промежуточной группы) ---
  else if (!text.startsWith('/')) { // Обрабатываем только текстовые сообщения пользователя, не команды
    if (text.trim().length > 0) {
      await bot.sendChatAction(chatId, 'typing');
      // Передаем originalUserMessageId (msg.message_id), чтобы AI думает... было ответом на него
      await forwardToAIBot(chatId, text, msg.message_id); 
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
