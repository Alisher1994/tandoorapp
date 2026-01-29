const express = require('express');
const pool = require('../database/connection');

const router = express.Router();

// Get all categories (public - for customers, filtered by restaurant)
router.get('/categories', async (req, res) => {
  try {
    const { restaurant_id } = req.query;
    
    let query = 'SELECT * FROM categories WHERE is_active = true';
    const params = [];
    
    if (restaurant_id) {
      query += ' AND restaurant_id = $1';
      params.push(restaurant_id);
    }
    
    query += ' ORDER BY name_ru';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Categories error:', error);
    res.status(500).json({ error: 'Ошибка получения категорий' });
  }
});

// Get all products (public - for customers, filtered by restaurant)
router.get('/', async (req, res) => {
  try {
    const { category_id, in_stock, restaurant_id } = req.query;
    
    let query = `
      SELECT p.*, c.name_ru as category_name,
             cnt.id as container_id, cnt.name as container_name, cnt.price as container_price
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      LEFT JOIN containers cnt ON p.container_id = cnt.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;
    
    if (restaurant_id) {
      query += ` AND p.restaurant_id = $${paramCount}`;
      params.push(restaurant_id);
      paramCount++;
    }
    
    if (category_id) {
      query += ` AND p.category_id = $${paramCount}`;
      params.push(category_id);
      paramCount++;
    }
    
    if (in_stock === 'true') {
      query += ` AND p.in_stock = true`;
    }
    
    query += ' ORDER BY p.name_ru';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Products error:', error);
    res.status(500).json({ error: 'Ошибка получения товаров' });
  }
});

// Get restaurant by id (public - for receipt/logo)
router.get('/restaurant/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM restaurants WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    // Return only safe public fields
    const r = result.rows[0];
    res.json({
      id: r.id,
      name: r.name,
      address: r.address,
      phone: r.phone,
      logo_url: r.logo_url,
      service_fee: r.service_fee || 0,
      click_url: r.click_url,
      payme_url: r.payme_url
    });
  } catch (error) {
    console.error('Restaurant error:', error);
    res.status(500).json({ error: 'Ошибка получения ресторана' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, c.name_ru as category_name, r.name as restaurant_name
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN restaurants r ON p.restaurant_id = r.id
      WHERE p.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Товар не найден' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Product error:', error);
    res.status(500).json({ error: 'Ошибка получения товара' });
  }
});

// Get restaurants list (public - for customer app to select restaurant)
router.get('/restaurants/list', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM restaurants 
      WHERE is_active = true 
      ORDER BY name
    `);
    // Return only safe public fields
    const restaurants = result.rows.map(r => ({
      id: r.id,
      name: r.name,
      address: r.address,
      phone: r.phone,
      logo_url: r.logo_url,
      service_fee: r.service_fee || 0
    }));
    res.json(restaurants);
  } catch (error) {
    console.error('Restaurants list error:', error);
    res.status(500).json({ error: 'Ошибка получения списка ресторанов' });
  }
});

module.exports = router;
