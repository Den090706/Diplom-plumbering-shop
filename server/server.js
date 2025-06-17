const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const util = require('util');
require('dotenv').config();
const multer = require('multer');
const path = require('path');
const fs = require('fs')

const uploadDir = path.join(__dirname, 'uploads/products');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('Папка для завантаження створена:', uploadDir);
}

// Сховище для зображень
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
  const uploadPath = path.join(__dirname, 'uploads/products');
  console.log('Завантаження у папку:', uploadPath);
  cb(null, path.join(__dirname, 'uploads/products'));
},
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    console.log('Ім\'я файлу:', uniqueName);
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

const app = express();
app.use(express.json()); // для JSON-запитів

app.use(cors({
  origin: '*',
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

app.use('/uploads/products', express.static(path.join(__dirname, '../uploads/products')));

// === Middleware ===
app.use(express.urlencoded({ extended: true }));

// === MySQL Connection === 
/* const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
});
*/

const db = mysql.createConnection({
  host: 'localhost',       
  user: 'root',            
  password: '5555',   
  database: 'plumber_shop' 
});

db.connect(err => {
  if (err) {
    console.error('❌ Помилка підключення до БД:', err);
  } else {
    console.log('✅ Підключено до MySQL (plumber_shop)');
  }
});

const queryAsync = util.promisify(db.query).bind(db);


// Зобраеження з теки 'diplom' 
app.use(express.static(path.join(__dirname, '..')));

// Маршрут, який віддає головний HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'main.html'));
});

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

// Отримання всіх підкатегорій для admin.html
app.get('/api/subcategories', async (req, res) => {
  try {
    const results = await queryAsync(`
      SELECT subcategory_id AS id, name AS subcategory_name, category_id
      FROM subcategories
    `);

    if (results.length === 0) return res.status(404).json({ error: 'Підкатегорії не знайдено' });

    res.json(results); // повертаємо масив підкатегорій
  } catch (err) {
    console.error('❌ Помилка при отриманні всіх підкатегорій:', err.message);
    res.status(500).json({ error: 'Помилка сервера при отриманні підкатегорій' });
  }
});

// Отримання підкатегорій за ID категорії
app.get('/api/subcategories/:categoryId', async (req, res) => { //можливо замінити /api/categories/:categoryId/subcategories
  const categoryId = req.params.categoryId;
  console.log('Запит підкатегорій для категорії ID:', categoryId);

  try {
    const results = await queryAsync(`
      SELECT subcategory_id AS id, name AS subcategory_name
      FROM subcategories
      WHERE category_id = ?
    `, [categoryId]);

    if (results.length === 0) return res.status(404).json({ error: 'Підкатегорії не знайдено для цієї категорії' });

    res.json(results);
  } catch (err) {
    console.error('❌ Помилка при отриманні підкатегорій за категорією:', err.message);
    res.status(500).json({ error: 'Помилка сервера при отриманні підкатегорій' });
  }
});

// Отримання одного товару за ID
app.get('/api/products/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      SELECT 
        p.product_id AS id,
        p.name,
        p.description,
        p.price,
        p.stock,
        p.image,
        p.category_id,
        p.subcategory_id,
        c.name AS category_name,
        s.name AS subcategory_name
      FROM products p
      JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN subcategories s ON p.subcategory_id = s.subcategory_id
      WHERE p.product_id = ?
    `;

    const results = await queryAsync(query, [id]);

    if (results.length === 0) {
      return res.status(404).json({ error: 'Товар не знайдено' });
    }

    res.json(results[0]);
  } catch (err) {
    console.error('❌ Помилка при отриманні товару:', err.message);
    res.status(500).json({ error: 'Помилка сервера при отриманні товару' });
  }
});

// Отримання всіх товарів (без фільтрації)
app.get('/api/products', async (req, res) => {
  try {
    const query = `
    SELECT 
      p.product_id,
      p.name, p.description, p.price, p.stock, p.image,
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

// Маршрути для додавання, оновлення, видалення товарів
// Додавання нового товару
app.post('/api/products', upload.single('image'), (req, res) => {
  const { name, category_id, subcategory_id, description, price, stock } = req.body;
  const imagePath = req.file ? '/uploads/products/' + req.file.filename : null;

  if (!name || !category_id || !description || !price || !stock ) {
    return res.status(400).json({ error: 'Усі поля повинні бути заповнені' });
  }

  const query = `
    INSERT INTO products (name, category_id, subcategory_id, description, price, stock, image)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    query,
    [name, category_id, subcategory_id || null, description, price, stock, imagePath],
    (err, results) => {
      if (err) {
        console.error('Помилка додавання товару:', err);
        return res.status(500).json({ error: 'Помилка сервера' });
      }
      res.status(201).json({ message: 'Товар успішно додано' });
    }
  );
});

// Оновлення товару
app.put('/api/products/:id', upload.single('image'), (req, res) => {
  const productId = req.params.id;
  const { name, category_id, subcategory_id, description, price, stock } = req.body;

  if (!name || !category_id || !subcategory_id || !description  || !stock || !price ) {
    return res.status(400).json({ error: 'Усі поля повинні бути заповнені' });
  }

  const checkProductQuery = 'SELECT * FROM products WHERE product_id = ?';
  db.query(checkProductQuery, [productId], (err, results) => {
    if (err) {
      console.error('Помилка перевірки товару:', err);
      return res.status(500).json({ error: 'Помилка сервера' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Товар не знайдено' });
    }

    const imageFile = req.file ? '/uploads/products/' + req.file.filename : results[0].image;

    const query = `UPDATE products 
    SET name = ?, category_id = ?, subcategory_id = ?, description = ?, price = ?, stock = ?, image = ?
    WHERE product_id = ?`;
    db.query(query, [name, category_id, subcategory_id || null, description, price, stock, imageFile, productId], (err, result) => {
      if (err) {
        console.error('Помилка редагування товару:', err);
        return res.status(500).json({ error: 'Помилка сервера' });
      }
      res.json({ message: 'Товар оновлено' });
    });
  });
});

// Видалення товару - змінити
app.delete('/api/products/:id', (req, res) => {
  const productId = req.params.id;
  db.query('DELETE FROM products WHERE product_id = ?', [productId], (err, result) => {
    if (err) {
      console.error('Помилка видалення товару:', err);
      res.status(500).json({ error: 'Помилка сервера' });
    } else {
      res.json({ message: 'Товар видалено' });
    }
  });
});

// Маршрути для додавання, оновлення, видалення підкатегорій
// Додавання підкатегорії
app.post('/api/subcategories', (req, res) => {
  const {name, category_id } = req.body;

  if (!name || !category_id) {
    return res.status(400).json({ error: 'Поле повинне бути заповненим' });
  }

  const query = `
    INSERT INTO subcategories (name, category_id)
    VALUES (?, ?)
  `;

  db.query(
    query,
    [name],
    (err, results) => {
      if (err) {
        console.error('Помилка додавання підкатегорії:', err);
        return res.status(500).json({ error: 'Помилка сервера' });
      }
      res.status(201).json({ message: 'Підкатегорію додано' });
    }
  );
});

// Оновлення підкатегорії
app.put('/api/subcategories/:id', (req, res) => {
  const productId = req.params.id;
  const { name, category_id, subcategory_id} = req.body;

  if (!name || !category_id) {
    return res.status(400).json({ error: 'Усі поля повинні бути заповнені' });
  }

  const checkProductQuery = 'SELECT * FROM subcategories WHERE subcategory_id = ?';
  db.query(checkProductQuery, [productId], (err, results) => {
    if (err) {
      console.error('Помилка перевірки товару:', err);
      return res.status(500).json({ error: 'Помилка сервера' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Товар не знайдено' });
    }

    const query = 'UPDATE subcategories SET name = ?, category_id = ? WHERE subcategory_id = ?';
    db.query(query, [name, category_id, productId], (err, result) => {
      if (err) {
        console.error('Помилка редагування товару:', err);
        return res.status(500).json({ error: 'Помилка сервера' });
      }
      res.json({ message: 'Категорію оновлено' });
    });
  });
});

// Видалення підкатегорії
app.delete('/api/subcategories/:id', (req, res) => {
  const subcategoryId = req.params.id;
  db.query('DELETE FROM subcategories WHERE subcategory_id = ?', [subcategoryId], (err, result) => {
    if (err) {
      console.error('Помилка видалення підкатегорії:', err);
      res.status(500).json({ error: 'Помилка сервера' });
    } else {
      res.json({ message: 'Підкатегорію видалено' });
    }
  });
});

// Маршрути для додавання, оновлення, видалення категорій
// Додавання категорії
app.post('/api/categories', (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Поле повинне бути заповненим' });
  }

  const query = `
    INSERT INTO categories (name)
    VALUES (?)
  `;

  db.query(
    query,
    [name],
    (err, results) => {
      if (err) {
        console.error('Помилка додавання категорії:', err);
        return res.status(500).json({ error: 'Помилка сервера' });
      }
      res.status(201).json({ message: 'Категорію додано' });
    }
  );
});

// Оновлення категорії
app.put('/api/categories/:id', (req, res) => {
  const productId = req.params.id;
  const { name, category_id, } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Усі поля повинні бути заповнені' });
  }

  const checkProductQuery = 'SELECT * FROM categories WHERE category_id = ?';
  db.query(checkProductQuery, [productId], (err, results) => {
    if (err) {
      console.error('Помилка перевірки товару:', err);
      return res.status(500).json({ error: 'Помилка сервера' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Товар не знайдено' });
    }

    const query = 'UPDATE categories SET name = ?,  WHERE category_id = ?';
    db.query(query, [name, productId], (err, result) => {
      if (err) {
        console.error('Помилка редагування товару:', err);
        return res.status(500).json({ error: 'Помилка сервера' });
      }
      res.json({ message: 'Категорію оновлено' });
    });
  });
});

// Видалення категорії
app.delete('/api/categories/:id', (req, res) => {
  const categoryId = req.params.id;
  db.query('DELETE FROM categories WHERE category_id = ?', [categoryId], (err, result) => {
    if (err) {
      console.error('Помилка видалення категорії:', err);
      res.status(500).json({ error: 'Помилка сервера' });
    } else {
      res.json({ message: 'Категорію видалено' });
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
