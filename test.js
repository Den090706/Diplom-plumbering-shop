const mysql = require('mysql2');

// Налаштування підключення
const connection = mysql.createConnection({
  host: 'localhost',         // або IP-адреса сервера БД
  user: 'root',     // ім'я користувача
  password: '!@rootf0rk_r5589#$', // пароль
  database: 'weapon_store'   // назва бази даних
});

// Підключення до бази даних і тестовий запит
connection.connect((err) => {
  if (err) {
    console.error('Помилка підключення до БД:', err);
    return;
  }
  console.log('Підключення до БД успішне!');

  // Виконання тестового запиту
  connection.query('SELECT 1 + 1 AS solution', (err, results) => {
    if (err) {
      console.error('Помилка запиту:', err);
    } else {
      console.log('Результат запиту:', results[0].solution); // Повинно показати "2"
    }
    connection.end(); // Закриття підключення після перевірки
  });
});
