const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const util = require('util');
require('dotenv').config();

const app = express();
app.use(express.json()); // для JSON-запитів
app.use(cors());

app.use(cors({
  origin: 'http://127.0.0.1:5500',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

const PORT = process.env.PORT || 3000;

// Ваш маршрут для перевірки пароля
app.post('/api/admin_password', (req, res) => {
  const { password } = req.body;

  if (password === "5555") {
    res.status(200).json({ success: true, message: 'Успішний вхід' });
  } else {
    res.status(401).json({ success: false, message: 'Неправильний логін або пароль' });
  }
});

// === Middleware ===
app.use(express.urlencoded({ extended: true }));

// === MySQL Connection ===
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
});

db.connect(err => {
  if (err) {
    console.error('❌ Помилка підключення до БД:', err);
  } else {
    console.log('✅ Підключено до MySQL (plumber_shop)');
  }
});

const queryAsync = util.promisify(db.query).bind(db);

// Отримання категорій
app.get('/api/categories', async (req, res) => {
  try {
    const results = await queryAsync('SELECT * FROM categories');
    res.json(results);
  } catch (err) {
    console.error('❌ Категорії:', err);
    res.status(500).json({ error: 'Помилка сервера при отриманні категорій' });
  }
});

// Підкатегорії за ID категорії
app.get('/api/subcategories/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const results = await queryAsync(`
  SELECT subcategory_id AS id, name AS subcategory_name, category_id 
  FROM subcategories 
  WHERE category_id = ?
`, [categoryId]);
    if (results.length === 0) return res.status(404).json({ error: 'Підкатегорії не знайдено' });
    res.json(results);
  } catch (err) {
    console.error('❌ Помилка при запиті підкатегорій:', err.message);
    res.status(500).json({ error: 'Помилка сервера при отриманні підкатегорій' });
  }
});

// Отримання всіх товарів (без фільтрації)
app.get('/api/products', async (req, res) => {
  try {
    const query = `
      SELECT 
        p.name, p.description, p.price, p.stock,
        c.name AS category_name,
        s.name AS subcategory_name
      FROM products p
      JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN subcategories s ON p.subcategory_id = s.subcategory_id
    `;

    const results = await queryAsync(query);

    if (results.length === 0) {
      return res.status(404).json({ error: 'Товари не знайдені' });
    }

    res.json(results);
  } catch (err) {
    console.error('❌ Отримання товарів:', err);
    res.status(500).json({ error: 'Помилка сервера при отриманні товарів' });
  }
});

// Інші маршрути для додавання, оновлення, видалення товарів...
// Додавання нового товару
app.post('/api/products', (req, res) => {
  const { name, category_id, subcategory_id, description, price, stock } = req.body;

  if (!name || !category_id || !description || price == null || stock == null) {
    return res.status(400).json({ error: 'Усі поля повинні бути заповнені' });
  }

  const query = `
    INSERT INTO products (name, category_id, subcategory_id, description, price, stock)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(
    query,
    [name, category_id, subcategory_id || null, description, price, stock],
    (err, results) => {
      if (err) {
        console.error('Помилка додавання сантехнічного товару:', err);
        return res.status(500).json({ error: 'Помилка сервера' });
      }
      res.status(201).json({ message: 'Товар успішно додано' });
    }
  );
});
// Оновлення товару
app.put('/api/products/:id', (req, res) => {
  const productId = req.params.id;
  const { name, category_id, subcategory_id, description } = req.body;

  if (!name || !category_id || !description) {
    return res.status(400).json({ error: 'Усі поля повинні бути заповнені' });
  }

  const checkProductQuery = 'SELECT * FROM products WHERE id = ?';
  db.query(checkProductQuery, [productId], (err, results) => {
    if (err) {
      console.error('Помилка перевірки товару:', err);
      return res.status(500).json({ error: 'Помилка сервера' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Товар не знайдено' });
    }

    const query = 'UPDATE products SET name = ?, category_id = ?, subcategory_id = ?, description = ? WHERE id = ?';
    db.query(query, [name, category_id, subcategory_id || null, description, productId], (err, result) => {
      if (err) {
        console.error('Помилка редагування товару:', err);
        return res.status(500).json({ error: 'Помилка сервера' });
      }
      res.json({ message: 'Товар оновлено' });
    });
  });
});

// Видалення товару
app.delete('/api/products/:id', (req, res) => {
  const productId = req.params.id;
  db.query('DELETE FROM products WHERE id = ?', [productId], (err, result) => {
    if (err) {
      console.error('Помилка видалення товару:', err);
      res.status(500).json({ error: 'Помилка сервера' });
    } else {
      res.json({ message: 'Товар видалено' });
    }
  });
});


// Обробник для 404 помилок, має бути в кінці
app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не знайдено' });
});

// Запуск сервера
const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`🚿 Сервер працює: http://localhost:${PORT}`);
});
