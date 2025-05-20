// server/models/Category.js
const db = require(\server\config\weapon_store.sql);

// Отримати всі категорії
exports.getAllCategories = (callback) => {
  db.query('SELECT * FROM categories', (err, results) => {
    if (err) {
      return callback(err);
    }
    callback(null, results);
  });
};

// Додати нову категорію
exports.addCategory = (name, callback) => {
  db.query('INSERT INTO categories (name) VALUES (?)', [name], (err, results) => {
    if (err) {
      return callback(err);
    }
    callback(null, results);
  });
};
