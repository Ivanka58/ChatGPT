require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Teleprompter } = require('@telegramjs/bot');

// Получаем токены из переменных окружения
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_URL = process.env.GIGACHAT_API_URL;
const PORT = parseInt(process.env.PORT || '8080'); // Порт для Render

// Создаем экземпляр бота
const teleprompter = new Teleprompter({
  token: BOT_TOKEN,
});

// Вспомогательные функции
async function sendMainMenu(chatId) {
  await teleprompter.sendMessage(chatId, 'Напишите ваше сообщение.');
}

// Обработчик команды /start
async function startCommand(ctx) {
  await sendMainMenu(ctx.chat.id);
}

// Обработчик текстовых сообщений
async function handleMessage(ctx) {
  const userMessage = ctx.message.text.trim();
  const chatId = ctx.chat.id;

  try {
    // Отправляем сообщение "AI думает..."
    const thinkingMessage = await teleprompter.sendMessage(chatId, "AI думает...");

    // Отправляем запрос на API
    const response = await axios.post(API_URL, { query: userMessage });

    // Удаляем сообщение "AI думает..."
    await teleprompter.deleteMessage(chatId, thinkingMessage.message_id);

    // Отправляем ответ пользователю
    if (response.status === 200) {
      const answer = response.data.response || '';
      await teleprompter.sendMessage(chatId, answer);
    } else {
      await teleprompter.sendMessage(chatId, "Что-то пошло не так. Повторите попытку позже.");
    }
  } catch (err) {
    console.error(err);
    await teleprompter.sendMessage(chatId, "Что-то пошло не так. Повторите попытку позже.");
  }
}

// Конфигурация Express
const app = express();
app.use(express.json());

// Маршрут для Webhook
app.post('/webhook', async (req, res) => {
  try {
    await teleprompter.processUpdate(req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Главная страница
app.get('/', (req, res) => {
  res.send('<h1>JavaScript Telegram Bot on Render</h1>');
});

// Настройка команд бота
teleprompter.command('start', startCommand);
teleprompter.on('message:text', handleMessage);

// Запуск приложения
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
