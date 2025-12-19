const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');

// Получаем токен бота из переменных окружения
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

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

// --- Функция для получения мгновенного ответа от DuckDuckGo ---
async function getInstantAnswer(query) {
  console.log(`[DuckDuckGo] Attempting to get answer for query: "${query}"`);
  try {
    const response = await axios.get('https://api.duckduckgo.com/', {
      params: {
        q: query,
        format: 'json',
        nohtml: 1,
        skip_disambig: 1
      }
    });

    const data = response.data;
    console.log('[DuckDuckGo] Raw API response data:', JSON.stringify(data, null, 2));

    if (data.AbstractText) {
      console.log('[DuckDuckGo] Found AbstractText:', data.AbstractText);
      return data.AbstractText;
    }
    else if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      const firstTopicText = data.RelatedTopics[0].Text;
      console.log('[DuckDuckGo] Found RelatedTopic:', firstTopicText);
      return firstTopicText || "Не могу найти прямой ответ по вашему запросу. Попробуйте перефразировать.";
    }
    else {
      console.log('[DuckDuckGo] No AbstractText or RelatedTopics found for query:', query);
      return "Не могу найти мгновенный ответ по вашему запросу. Возможно, тема слишком специфична или требует уточнения.";
    }
  } catch (error) {
    console.error('[DuckDuckGo] Error fetching instant answer:', error.message);
    if (axios.isAxiosError(error) && error.response) {
        console.error('[DuckDuckGo] Axios Error Response Data:', error.response.data);
        console.error('[DuckDuckGo] Axios Error Response Status:', error.response.status);
    } else {
        console.error('[DuckDuckGo] Full Error Object:', error);
    }
    return "Произошла ошибка при поиске ответа. Пожалуйста, попробуйте еще раз позже.";
  }
}

// --- Обработчик команды /start ---
bot.onText(/\/start/, async (msg) => { // ВНИМАНИЕ: ПРОВЕРЬТЕ ЭТУ СТРОКУ! /start/

  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 'Привет, я бесплатный чат. Если ты сюда попал, значит я лично дал тебе доступ. Поздравляю! Ты избранный! Развлекайся 💘');
  await sendMainMenu(chatId);
});

// --- Единый обработчик для всех текстовых сообщений ---
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

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
  else if (!text.startsWith('/')) {
    if (text.trim().length > 0) {
      await bot.sendChatAction(chatId, 'typing');
      const answer = await getInstantAnswer(text);
      await bot.sendMessage(chatId, answer);
    } else {
      await bot.sendMessage(chatId, "Пожалуйста, введите ваш вопрос.");
    }
  }
});

// --- Функция для отправки сообщения "Я жив!" каждые 10 минут ---
function sendAliveMessage() {
  const chatId = 6749286679; // Ваш ID чата
  bot.sendMessage(chatId, 'Я жив!');
}

// --- Отправка сообщения "Я жив!" каждые 10 минут ---
setInterval(sendAliveMessage, 10 × 60 × 1000);

// --- HTTP сервер для Render ---
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Telegram Bot HTTP Server is running and responding to health checks.');
});

server.listen(PORT, () => {
  console.log(`HTTP server is running on port ${PORT}`);
});
