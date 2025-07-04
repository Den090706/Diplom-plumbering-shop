# Diploma-plumbering-shop

## 🎓 Тема дипломної роботи

Кваліфікаційна робота на підтвердження ступеня **фахового молодшого бакалавра**  
[ВСП «ППФК НТУ «ХПІ»](http://polytechnic.poltava.ua)  
**Керівник роботи** – *Ковальова Наталія Володимирівна*

---

## 📌 Завдання дипломного проєкту

Розробити **вебзастосунок** для продажу товарів сантехнічного призначення. Основні цілі:

- Створення клієнтського інтерфейсу магазину.
- Реалізація адміністративного режиму (додавання, редагування, видалення товарів, категорій, підкатегорій).
- Підтримка багатомовності (інтерфейс українською та англійською).
- Додавання товарів до кошика та обробка замовлень.
- Можливість фільтрації товарів за категоріями та підкатегоріями.

---

## 🧱 Функціональність

### 👨‍💻 Адміністративна панель:
- Авторизація адміністратора.
- Додавання/редагування/видалення:
  - Товарів
  - Категорій
  - Підкатегорій
- Додавання зображень, ціни, опису, кількості на складі.

### 🛒 Магазин (користувацька частина):
- Перегляд усіх товарів.
- Вибір за категорією/підкатегорією.
- Додавання до кошика.
- Формування замовлення (модель без реальної оплати).

---

## ⚙️ Використані технології

### **Фронтенд (Клієнтська частина)**
- HTML, CSS, JavaScript – основа верстки та логіки.
- Bootstrap або Tailwind CSS – для адаптивної стилізації.
- Fetch API або Axios – взаємодія з сервером через REST API.

### **Бекенд (Серверна частина)**
- Node.js з Express – обробка API-запитів, маршрутизація.
- Middleware: CORS, body-parser, express.json, тощо.

### **База даних**
- **MySQL** – реляційна СУБД:
  - Таблиці: `products`, `categories`, `subcategories`, `orders`, `users`, тощо.
  - Зв’язки: `products` ↔ `categories`, `products` ↔ `subcategories`.

---

## Опублікований продукт
Готовий вебхастосунок буде захощений на хостингу [Render](https://diplom-plumbering-shop.onrender.com).
