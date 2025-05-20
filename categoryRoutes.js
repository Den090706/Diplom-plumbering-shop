// server/routes/categoryRoutes.js
const express = require('express');
const router = express.Router();
const Category = require('../models/Category');

// Отримати всі категорії
router.get('/categories', (req, res) => {
  Category.getAllCategories((err, categories) => {
    if (err) {
      res.status(500).json({ error: 'Помилка отримання категорій' });
    } else {
      res.json(categories);
    }
  });
});

// Додати нову категорію
router.post('/categories', (req, res) => {
  const { name } = req.body;
  Category.addCategory(name, (err, result) => {
    if (err) {
      res.status(500).json({ error: 'Помилка додавання категорії' });
    } else {
      res.status(201).json({ message: 'Категорія додана успішно' });
    }
  });
});

module.exports = router;
