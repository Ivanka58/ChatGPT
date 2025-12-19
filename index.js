const TelegramBot = require('node-telegram-bot-api'); // ИСПРАВЛЕНО: используем 'node-telegram-bot-api'
const axios = require('axios');
const http = require('http'); // Модуль для создания HTTP сервера

// Получаем токен бота из переменных окружения
// Убедитесь, что вы добавили BOT_TOKEN в Environment Variables на Render!
// ИСПРАВЛЕНО: добавляем { polling: true } для запуска бота
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
      one_time_keyboard: false // Устанавливаем false, чтобы клавиатура оставалась видимой
    }
  };
  await bot.sendMessage(chatId, message, keyboard);
}

// --- Функция для получения мгновенного ответа от DuckDuckGo ---
async function getInstantAnswer(query) {
  console.log(`[DuckDuckGo] Attempting to get answer for query: "${query}"`); // Лог: Начало запроса
  try {
    const response = await axios.get('https://api.duckduckgo.com/', {
      params: {
        q: query,
        format: 'json',
        nohtml: 1, // Удалить HTML-теги
        skip_disambig: 1 // Пропускать страницы с неоднозначностями
      }
    });

    const data = response.data;
    console.log('[DuckDuckGo] Raw API response data:', JSON.stringify(data, null, 2)); // Лог: Весь ответ от DDG API

    if (data.AbstractText) {
      console.log('[DuckDuckGo] Found AbstractText:', data.AbstractText); // Лог: Найден AbstractText
      return data.AbstractText;
    }
    else if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      // Пытаемся взять текст первой связанной темы
      const firstTopicText = data.RelatedTopics[0].Text;
      console.log('[DuckDuckGo] Found RelatedTopic:', firstTopicText); // Лог: Найдена связанная тема
      return firstTopicText || "Не могу найти прямой ответ по вашему запросу. Попробуйте перефразировать.";
    }
    else {
      console.log('[DuckDuckGo] No AbstractText or RelatedTopics found for query:', query); // Лог: Ничего не найдено
      return "Не могу найти мгновенный ответ по вашему запросу. Возможно, тема слишком специфична или требует уточнения.";
    }
  } catch (error) {
    console.error('[DuckDuckGo] Error fetching instant answer:', error.message); // Лог: Общая ошибка
    // Если это ошибка Axios, может быть дополнительная информация в error.response
    if (axios.isAxiosError(error) && error.response) {
        console.error('[DuckDuckGo] Axios Error Response Data:', error.response.data);
        console.error('[DuckDuckGo] Axios Error Response Status:', error.response.status);
    } else {
        console.error('[DuckDuckGo] Full Error Object:', error); // Лог: Полный объект ошибки, если не Axios
    }
    return "Произошла ошибка при поиске ответа. Пожалуйста, попробуйте еще раз позже.";
  }
}


// --- Обработчик команды /start --
bot.onTextt(/\/start,  asyn  (msg =>    // ИСПРАВЛЕНО: для node-telegram-bot-api лучше использовать onText для коман
   cons  chatI =  ms..cha..i;

   // Приветственное сообщени
   awai  bo..sendMessage(chatI,  'Привет, я бесплатный чат. Если ты сюда попал, значит я лично дал тебе доступ. Поздравляю! Ты избранный! Развлекайся 💘';

   // Отправляем основное меню после приветстви
   awai  sendMainMenu(chatId;

};


// --- Единый обработчик для всех текстовых сообщений --


// Для node-telegram-bot-api, bot.on('text', ...) тоже работает, но on('message') более общи

// Оставим bot.on('text') для совместимости, но учтем, что он реагирует на ВСЕ текстовые сообщени

bo..on('message,  asyn  (msg =>    // ИСПРАВЛЕНО: Используем 'message' для перехвата всех сообщений, включая текстовы
   cons  chatI =  ms..cha..i;
   cons  tex =  ms..tex;

   // Если сообщение не текстовое, игнорируем ег
   i  !!text  retur;

   // Обработка команд мен
   i  (tex ===  'Начать общение'  
     awai  bo..sendMessage(chatI,  'Задавайте ваш вопрос:';
     els  i  (tex ===  'Очистить историю диалога'  
     awai  bo..sendMessage(chatI,  'Внимание! Вы точно хотите удалить историю диалога? Её невозможно восстановить!,  
       reply_marku:  
        keyboard: [
          [{ text: 'Удалить ❌' }],
          [{ text: 'Отмена' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
  }
  // Обработка подтверждения очистки
  else if (text === 'Удалить ❌') {
    await bot.sendMessage(chatId, 'История диалога очищена.');
    await sendMainMenu(chatId, 'Что вы хотите сделать дальше?');
  } else if (text === 'Отмена') {
    await bot.sendMessage(chatId, 'Очистка истории диалога отменена.');
    await sendMainMenu(chatId, 'Что вы хотите сделать дальше?');
  }
  // Обработка любого другого текста как вопроса к DuckDuckGo
  else if (!text.startsWith('/')) { // ИСПРАВЛЕНО: Игнорируем команды, которые начинаются с '/'
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
setInterval(sendAliveMessage, 10 * 60 * 1000); // 10 минут * 60 секунд * 1000 миллисекунд

// --- HTTP сервер для Render ---
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Telegram Bot HTTP Server is running and responding to health checks.');
});

server.listen(PORT, () => {
  console.log(`HTTP server is running on port ${PORT}`);
});
