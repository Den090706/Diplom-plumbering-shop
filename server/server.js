const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const util = require('util');
require('dotenv').config();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { error, log } = require('console');
const bcrypt = require('bcrypt');
const session = require('express-session');
const favicon = require('serve-favicon');

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
app.use(express.json()); 

// Зобраеження з теки 'diplom' 
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(favicon(path.join(__dirname, '..', 'uploads', 'favicon', 'favicon.ico')));
// Middleware
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

const PORT = process.env.PORT || 3000;

// Маршрут для перевірки пароля
app.post('/api/admin_password', (req, res) => {
  const { password } = req.body;

  if (password === "5555") {
    res.status(200).json({ success: true, message: 'Успішний вхід' });
  } else {
    res.status(401).json({ success: false, message: 'Неправильний логін або пароль' });
  }
});

app.use('/uploads/', express.static(path.join(__dirname, '../uploads/')));



// MySQL Connection 
 const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
});


/*const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '5555',
  database: 'plumber_shop'
});
*/

db.connect(err => {
  if (err) {
    console.error('Помилка підключення до БД:', err);
  } else {
    console.log('Підключено до MySQL (plumber_shop)');
  }
});

const queryAsync = util.promisify(db.query).bind(db);

// Підключення middleware для парсингу форм
app.use(express.urlencoded({ extended: true }));

// Підключення middleware для сесій
app.use(session({
  secret: 'yourSecretKey',
  resave: false,
  saveUninitialized: false,
}));

// МІДЛВАР ДЛЯ ЗАХИСТУ ДОСТУПУ 
function authMiddleware(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/api/login.html');
  }
  next();
}

// Реєстрація користувача
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;

  const hash = await bcrypt.hash(password, 10);

  try {
    await queryAsync(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, 'customer']
    );
    res.status(201).send('Користувача створено');
  } catch (err) {
    console.error(err);
    res.status(500).send('Помилка сервера');
  }
});

// Вхід користувача
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  const user = await queryAsync('SELECT * FROM users WHERE email = ?', [email]);
  if (user.length === 0) {
    return res.status(401).send('Користувача не знайдено');
  }

  const foundUser = user[0];

  const passwordMatch = await bcrypt.compare(password, foundUser.password);
  if (!passwordMatch) {
    return res.status(401).send('Невірний пароль');
  }

  // Збереження даних користувача в сесії
  req.session.userId = foundUser.user_id;
  req.session.userName = foundUser.name;
  req.session.userRole = foundUser.role;

  let cart = await queryAsync('SELECT cart_id FROM carts WHERE user_id = ?', [foundUser.user_id]);

  let cartId;
  if (cart.length > 0) {
    cartId = cart[0].cart_id;
  } else {
    const result = await queryAsync('INSERT INTO carts (user_id) VALUES (?)', [foundUser.user_id]);
    cartId = result.insertId;
  }

  res.json({
    userId: foundUser.user_id,
    name: foundUser.name,
    role: foundUser.role,
    cartId
  });
});

// Перевірка статусу авторизації
app.get('/api/check-auth', (req, res) => {
  if (req.session && req.session.userId) {
    res.json({ loggedIn: true, userName: req.session.userName });
  } else {
    res.json({ loggedIn: false });
  }
});

// Вихід користувача
app.get('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).send('Помилка при виході');
    }
    res.redirect('/api/login.html');
  });
});

// Отримуємо зображення з БД
function cleanUnusedImages() {
  const uploadDir = path.join(__dirname, 'uploads/products');
  const filesInFolder = fs.readdirSync(uploadDir);

  db.query('SELECT image FROM products WHERE image IS NOT NULL', (err, results) => {
    if (err) throw err;

    const usedImages = results.map(row => path.basename(row.image));
    const unusedImages = filesInFolder.filter(file => !usedImages.includes(file));

    unusedImages.forEach(file => {
      const filePath = path.join(uploadDir, file);
      if (simulate) {
        console.log('[SIMULATION] Буде видалено:', file);
      } else {
        fs.unlinkSync(filePath, err => {
          if (err) console.warn('Не вдалося видалити файл: ', filePath);
          console.log('Видалено:', file);
        });
      }
    });
  });
}

//Запуск очищення
app.delete('/api/images/cleanup', (req, res) => {
  cleanUnusedImages(false);
  res.json({ message: 'Очищення запущено (перевір логи сервера)' });
});

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
    console.error('Категорії:', err);
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
    console.error('Помилка при отриманні всіх підкатегорій:', err.message);
    res.status(500).json({ error: 'Помилка сервера при отриманні підкатегорій' });
  }
});

//Отримання однієї категорії за id
app.get('/api/categories/:id', (req, res) => {
  const categoryId = req.params.id;

  const query = 'SELECT * FROM categories WHERE category_id = ?';
  db.query(query, [categoryId], (err, results) => {
    if (err) {
      console.log('Помилка отримання категорії: ', err);
      return res.status(500).json({ error: 'Помилка сервера' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Категорію не знайдено' });
    }
    res.json(results[0]);
  });
});

// Отримання підкатегорій за id категорії
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
    console.error('Помилка при отриманні підкатегорій за категорією:', err.message);
    res.status(500).json({ error: 'Помилка сервера при отриманні підкатегорій' });
  }
});

// Отримання однієї підкатегорії за її id
app.get('/api/subcategories/id/:subcategoryId', async (req, res) => {
  const subcategoryId = req.params.subcategoryId;

  try {
    const results = await queryAsync(`
      SELECT subcategory_id AS id, name AS subcategory_name, category_id
      FROM subcategories
      WHERE subcategory_id = ?
    `, [subcategoryId]);

    if (results.length === 0) {
      return res.status(404).json({ error: 'Підкатегорія не знайдена' });
    }

    res.json(results);
  } catch (err) {
    console.error('Помилка при отриманні підкатегорії за ID:', err.message);
    res.status(500).json({ error: 'Помилка сервера при отриманні підкатегорії' });
  }
});

// Отримання одного товару за ID
app.get('/api/products/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      SELECT 
        p.product_id AS product_id,
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
    console.error('Помилка при отриманні товару:', err.message);
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
    console.error('Отримання товарів:', err);
    res.status(500).json({ error: 'Помилка сервера при отриманні товарів' });
  }
});

// Отримання товарів за ID підкатегорії
app.get('/api/products/subcategory/:subcategoryId', async (req, res) => {
  const subcategoryId = req.params.subcategoryId;

  try {
    const results = await queryAsync(`
      SELECT p.*, c.name AS category_name, s.name AS subcategory_name
      FROM products p
      JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN subcategories s ON p.subcategory_id = s.subcategory_id
      WHERE p.subcategory_id = ?
    `, [subcategoryId]);

    res.json(results);
  } catch (err) {
    console.error('Помилка при отриманні товарів по підкатегорії:', err.message);
    res.status(500).json({ error: 'Помилка сервера при отриманні товарів' });
  }
});

//КОШИК
// Отримати/створити
app.post('/api/cart', async (req, res) => {
  const { userId } = req.body;

  const existing = await queryAsync('SELECT * FROM carts WHERE user_id = ?', [userId]);

  if (existing.length > 0) {
    res.json(existing[0]);
  } else {
    const result = await queryAsync('INSERT INTO carts (user_id) VALUES (?)', [userId]);
    res.json({ cart_id: result.insertId, user_id: userId });
  }
});

// Додати товар у кошик
app.post('/api/cart/add', async (req, res) => {
  try {
    const { cartId, productId, quantity } = req.body;

    if (!cartId || !productId || !quantity || quantity < 1) {
      return res.status(400).json({ error: 'Некоректні дані для кошика' });
    }

    const existing = await queryAsync(
      'SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?',
      [cartId, productId]
    );

    if (existing.length > 0) {
      await queryAsync(
        'UPDATE cart_items SET quantity = quantity + ? WHERE item_id = ?',
        [quantity, existing[0].item_id]
      );
    } else {
      await queryAsync(
        'INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)',
        [cartId, productId, quantity]
      );
    }

    res.json({ message: 'Товар додано до кошика' });
  } catch (err) {
    console.error('Помилка у /cart/add:', err);
    res.status(500).json({ error: 'Помилка при додаванні товару до кошика' });
  }
});

//ЗАМОВЛЕННЯ
//Оформлення замовлення
app.post('/api/orders/create', async (req, res) => {
  try {
    const { items } = req.body;

    console.log('ITEMS:', items);
    console.log('TOTAL:', calculateTotal(items));
    console.log('ORDER DATA:', req.body);


    //const cartId = req.body.cartId;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Кошик порожній' });
    }

    const result = await queryAsync(
      'INSERT INTO orders (user_id, order_date, total_price, status) VALUES (?, NOW(), ?, ?)',
      [1, calculateTotal(items), 'new']
    );
    const orderId = result.insertId;

    for (const item of items) {
      if (!item.product_id || !item.stock || !item.price) {
        return res.status(400).json({ success: false, message: 'Невірні дані товару' });
      }

      await queryAsync(
        'INSERT INTO order_items (order_id, product_id, stock, unit_price) VALUES (?, ?, ?, ?)',
        [orderId, item.product_id, item.stock, item.price]
      );
    }

    res.json({ success: true, orderId });
  } catch (err) {
    console.error('Помилка при створенні замовлення:', err);
    res.status(500).json({ success: false, message: 'Внутрішня помилка сервера' });
  }
});

function calculateTotal(items) {
  return items.reduce((sum, item) => {
    const price = Number(item.price);
    const stock = Number(item.stock);

    if (isNaN(price) || isNaN(stock)) {
      throw new Error(`Некоректні дані у товарі: price=${item.price}, quantity=${item.stock}`);
    }

    return sum + price * stock;
  }, 0);
}

//Отримати вміст кошика
app.get('/api/cart/:cartId', async (req, res) => {
  const { cartId } = req.params;

  const items = await queryAsync(`
    SELECT ci.quantity, p.*
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.product_id
    WHERE ci.cart_id = ?
  `, [cartId]);

  res.json(items);
});

// Oновлення кількості товару
app.post('/api/cart/update', async (req, res) => {
  const { cartId, productId, change } = req.body;

  if (!cartId || !productId || !change) {
    return res.status(400).json({ error: 'Відсутні обовʼязкові параметри' });
  }

  try {
    const [item] = await queryAsync(
      `SELECT quantity FROM cart_items WHERE cart_id = ? AND product_id = ?`,
      [cartId, productId]
    );

    if (!item) {
      if (change > 0) {
        await queryAsync(
          `INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)`,
          [cartId, productId, change]
        );
      }
    } else {
      const newQty = item.quantity + change;
      if (newQty <= 0) {
        await queryAsync(
          `DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?`,
          [cartId, productId]
        );
      } else {
        await queryAsync(
          `UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND product_id = ?`,
          [newQty, cartId, productId]
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Помилка при оновленні товару в кошику:', err.message);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Bидалення товару повністю
app.post('/api/cart/remove', async (req, res) => {
  const { cartId, productId } = req.body;

  if (!cartId || !productId) {
    return res.status(400).json({ error: 'Відсутні обовʼязкові параметри' });
  }

  try {
    await queryAsync(
      `DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?`,
      [cartId, productId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Помилка при видаленні товару з кошика:', err.message);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Oчищення кошика
app.post('/api/cart/clear', async (req, res) => {
  const { cartId } = req.body;

  if (!cartId) {
    return res.status(400).json({ error: 'Не вказано cartId' });
  }

  try {
    await queryAsync(`DELETE FROM cart_items WHERE cart_id = ?`, [cartId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Помилка при очищенні кошика:', err.message);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Маршрути для додавання, оновлення, видалення товарів
// Додавання нового товару
app.post('/api/products', upload.single('image'), (req, res) => {
  const { name, category_id, subcategory_id, description, price, stock } = req.body;
  const imagePath = req.file ? '/uploads/products/' + req.file.filename : null;

  if (!name || !category_id || !description || !price || !stock) {
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

  if (!name || !category_id || !subcategory_id || !description || !stock || !price) {
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
    const oldImagePath = results[0].image;

    if (req.file && oldImagePath) {
      const fullOldPath = path.join(__dirname, '...', oldImagePath);
      fs.unlink(fullOldPath, (err) => {
        if (err) {
          console.warn('Не вдалося видалити старе зображення:', fullOldPath, err.message);
        } else {
          console.log('Старе зображення видалено:', fullOldPath);
        }
      });
    }

    const imageFile = req.file ? '/uploads/products/' + req.file.filename : results[0].image;
    const { name, category_id, subcategory_id, description, price, stock } = req.body;

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

// Видалення товару
app.delete('/api/products/:id', (req, res) => {
  const productId = req.params.id;

  const getProductQuery = 'SELECT image FROM products WHERE product_id = ?';
  db.query(getProductQuery, [productId], (err, results) => {
    if (err) {
      console.error('Помилка отримання товару', err);
      return res.status(500).json({ error: 'Помилка сервера' });
    }

    if (!results || results.length === 0) {
      return res.status(404).json({ error: 'Товар не знайдено' });
    }

    const imagePath = results[0].image;
    const fullImagePath = path.join(__dirname, 'uploads', 'products', imagePath);

    db.query('DELETE FROM products WHERE product_id = ?', [productId], (err, result) => {
      if (err) {
        console.error('Помилка видалення товару:', err);
        return res.status(500).json({ error: 'Помилка при видаленні товару' });
      }

      if (imagePath && !imagePath.includes('no-image.jpg')) {
        fs.unlink(fullImagePath, (err) => {
          if (err) {
            console.error('Не вдалося видалити зображення', fullImagePath, err.message);
          } else {
            console.log('Зображення видалено:', imagePath);
          }
        });
      }

      res.json({ message: 'Товар видалено' });
    });
  });
});

// Маршрути для додавання, оновлення, видалення підкатегорій
// Додавання підкатегорії
app.post('/api/subcategories', (req, res) => {
  const { name, category_id } = req.body;

  if (!name || !category_id) {
    return res.status(400).json({ error: 'Поле повинне бути заповненим' });
  }

  const query = `
    INSERT INTO subcategories (name, category_id)
    VALUES (?, ?)
  `;

  db.query(
    query,
    [name, category_id],
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
  const { name, category_id } = req.body;

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

    const query = 'UPDATE categories SET name = ?  WHERE category_id = ?';
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
  console.log(`Сервер працює: http://localhost:${PORT}`);
});
