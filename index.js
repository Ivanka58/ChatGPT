const { TeleBot } = require('telegram-bot-api');
const axios = require('axios');
const http = require('http');

// Получаем токен бота из переменных окружения
const bot = new TeleBot(process.env.BOT_TOKEN);

// Функция для получения мгновенного ответа от DuckDuckGo
async function getInstantAnswer(query) {
  try {
    const response = await axios.get('https://api.duckduckgo.com/', {
      params: {
        q: query,
        format: 'json'
      }
    });

    const data = response.data;

    if (data.AbstractText && data.AbstractText !== '') {
      return data.AbstractText;
    } else if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      return data.RelatedTopics[0].Text;
    } else {
      return 'Ничего не найдено';
    }
  } catch (err) {
    console.error(err.message);
    return 'Ошибка при получении ответа';
  }
}

// Обработчик команды /start
bot.on('/start', async (msg) => {
  const chatId = msg.chat.id;

  // Приветственное сообщение
  await bot.sendMessage(chatId, 'Привет, я бесплатный чат GPT. Если ты сюда попал, значит я лично дал тебе доступ. Поздравляю! Ты избранный! Развлекайся 💘');

  // Кнопки
  const keyboard = {
    reply_markup: {
      keyboard: [
        [{ text: 'Начать общение' }],
        [{ text: 'Очистить историю диалога' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };

  await bot.sendMessage(chatId, 'Выберите действие:', keyboard);
});

// Обработчик нажатия кнопки "Начать общение"
bot.on('text', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

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
  } else {
    // Обработка вопроса пользователя
    const answer = await getInstantAnswer(text);
    await bot.sendMessage(chatId, answer);
  }
});

// Обработчик нажатия кнопки "Удалить ❌"
bot.on('text', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === 'Удалить ❌') {
    // Здесь можно добавить логику очистки истории диалога
    await bot.sendMessage(chatId, 'История диалога очищена.');
  } else if (text === 'Отмена') {
    await bot.sendMessage(chatId, 'Очистка истории диалога отменена.');
  }
});

// Функция для отправки сообщения "Я жив!" каждые 10 минут
function sendAliveMessage() {
  const chatId = 6749286679;
  bot.sendMessage(chatId, 'Я жив!');
}

// Запуск бота
bot.start();

// Отправка сообщения "Я жив!" каждые 10 минут
setInterval(sendAliveMessage, 10 * 60 * 1000);

// Прослушивание порта 3000 для Render
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('OK');
});

server.listen(3000, () => {
  console.log('Server is running on port 3000');
});
