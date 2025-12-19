const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');

// Получаем токен бота из переменных окружения
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// --- НОВЫЕ ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ И URL ДЛЯ НЕЙРОСЕТИ ---
const HUGGING_FACE_API_KEY = process.env.HF_API_KEY; // Ваш токен Hugging Face API
// ВНИМАНИЕ: Замените "google/flan-t5-small" на ID выбранной вами модели с huggingface.co
const HUGGING_FACE_MODEL_ID = "google/flan-t5-small";
// ИСПРАВЛЕНО: Обновленный базовый URL для Hugging Face Inference API
const HUGGING_FACE_API_URL = `https://router.huggingface.co/models/${HUGGING_FACE_MODEL_ID}`;


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

// --- НОВАЯ Функция для получения ответа от нейросети (Hugging Face) ---
async function getAIAnswer(query) {
  console.log(`[HuggingFace] Attempting to get AI answer for query: "${query}" using model ${HUGGING_FACE_MODEL_ID}`);

  // Проверяем наличие API ключа
  if (!HUGGING_FACE_API_KEY) {
    console.error("[HuggingFace] HF_API_KEY is not set in environment variables.");
    return "Ошибка: Ключ API для нейросети не настроен. Пожалуйста, свяжитесь с администратором.";
  }

  try {
    const response = await axios.post(
      HUGGING_FACE_API_URL, // ИСПОЛЬЗУЕМ НОВЫЙ URL
      {
        inputs: query,
        parameters: {
          max_new_tokens: 150, // Максимальное количество новых токенов (слов) в ответе
          temperature: 0.8,    // Температура генерации (от 0 до 1), влияет на "креативность". Выше = креативнее.
          do_sample: true,     // Включить семплирование, чтобы ответы были разнообразнее
          wait_for_model: true // Ждать, если модель загружается (может быть до 20 секунд на бесплатных тирах)
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${HUGGING_FACE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // Увеличиваем таймаут до 60 секунд на случай долгой загрузки модели
      }
    );

    const data = response.data;
    console.log('[HuggingFace] Raw API response data:', JSON.stringify(data, null, 2));

    if (data && Array.isArray(data) && data.length > 0 && data[0].generated_text) {
      let generatedText = data[0].generated_text.trim();
      
      // Модели Hugging Face часто повторяют входной запрос в начале ответа.
      // Попытаемся удалить его, чтобы ответ выглядел более естественно.
      // Добавим более надежную проверку, чтобы избежать ошибок с substring, если запрос не найден
      if (generatedText.toLowerCase().startsWith(query.trim().toLowerCase())) {
        generatedText = generatedText.substring(query.trim().length).trim();
      }
      // Также уберем лишние символы в начале, если модель генерирует их
      generatedText = generatedText.replace(/^['"\s]+/, '').replace(/['"\s]+$/, '');


      console.log('[HuggingFace] Generated AI text:', generatedText);
      return generatedText || "Нейросеть сгенерировала пустой или нерелевантный ответ. Попробуйте другой запрос.";
    } else {
      console.log('[HuggingFace] Unexpected API response structure:', data);
      return "Нейросеть не смогла сгенерировать ответ. Попробуйте перефразировать запрос.";
    }
  } catch (error) {
    console.error('[HuggingFace] Error fetching AI answer:', error.message);
    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error('[HuggingFace] Axios Error Response Data:', error.response.data);
        console.error('[HuggingFace] Axios Error Response Status:', error.response.status);
        if (error.response.status === 429) {
            return "Слишком много запросов к нейросети. Пожалуйста, подождите немного и попробуйте снова.";
        }
        if (error.response.status === 503 || error.response.status === 504) { // 504 Gateway Timeout также может быть из-за загрузки модели
            return "Нейросеть загружается или перегружена. Пожалуйста, подождите 10-20 секунд и попробуйте снова. Модель " + HUGGING_FACE_MODEL_ID + " может запускаться медленно.";
        }
      } else if (error.request) {
        console.error('[HuggingFace] Axios Error No Response (timeout or network):', error.request);
        return "Нейросеть не ответила вовремя. Пожалуйста, попробуйте еще раз позже. (Таймаут)";
      } else {
        console.error('[HuggingFace] Axios Error Message:', error.message);
      }
    } else {
      console.error('[HuggingFace] Full Error Object:', error);
    }
    return "Произошла ошибка при получении ответа от нейросети. Пожалуйста, попробуйте еще раз позже.";
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
      const answer = await getAIAnswer(text);
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
