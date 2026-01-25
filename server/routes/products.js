const express = require('express');
const pool = require('../database/connection');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get all categories
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM categories ORDER BY sort_order, name_ru'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Categories error:', error);
    res.status(500).json({ error: 'Ошибка получения категорий' });
  }
});

// Get all products
router.get('/', async (req, res) => {
  try {
    const { category_id, in_stock } = req.query;
    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    let paramCount = 1;
    
    if (category_id) {
      query += ` AND category_id = $${paramCount}`;
      params.push(category_id);
      paramCount++;
    }
    
    if (in_stock === 'true') {
      query += ` AND in_stock = true`;
    }
    
    query += ' ORDER BY sort_order, name_ru';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Products error:', error);
    res.status(500).json({ error: 'Ошибка получения товаров' });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products WHERE id = $1',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Товар не найден' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Product error:', error);
    res.status(500).json({ error: 'Ошибка получения товара' });
  }
});

module.exports = router;

