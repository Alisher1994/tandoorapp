const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { authenticate } = require('../middleware/auth');

// Ensure table exists
async function ensureTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_addresses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        address TEXT NOT NULL,
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    console.log('ℹ️ user_addresses table check:', e.message);
  }
}

/**
 * GET /api/addresses
 * Получить все адреса пользователя
 */
router.get('/', authenticate, async (req, res) => {
  try {
    await ensureTable();
    
    const result = await pool.query(
      `SELECT * FROM user_addresses 
       WHERE user_id = $1 
       ORDER BY is_default DESC, created_at DESC`,
      [req.user.id]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({ error: 'Ошибка получения адресов' });
  }
});

/**
 * POST /api/addresses
 * Добавить новый адрес
 */
router.post('/', authenticate, async (req, res) => {
  try {
    await ensureTable();
    
    const { name, address, latitude, longitude, is_default } = req.body;
    
    if (!name || !address) {
      return res.status(400).json({ error: 'Название и адрес обязательны' });
    }
    
    // Если это дефолтный адрес - сбросить is_default у других
    if (is_default) {
      await pool.query(
        'UPDATE user_addresses SET is_default = false WHERE user_id = $1',
        [req.user.id]
      );
    }
    
    const result = await pool.query(
      `INSERT INTO user_addresses (user_id, name, address, latitude, longitude, is_default)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.id, name, address, latitude || null, longitude || null, is_default || false]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create address error:', error);
    res.status(500).json({ error: 'Ошибка создания адреса' });
  }
});

/**
 * PUT /api/addresses/:id
 * Обновить адрес
 */
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, address, latitude, longitude, is_default } = req.body;
    
    // Проверяем что адрес принадлежит пользователю
    const check = await pool.query(
      'SELECT id FROM user_addresses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Адрес не найден' });
    }
    
    // Если это дефолтный адрес - сбросить is_default у других
    if (is_default) {
      await pool.query(
        'UPDATE user_addresses SET is_default = false WHERE user_id = $1',
        [req.user.id]
      );
    }
    
    const result = await pool.query(
      `UPDATE user_addresses 
       SET name = COALESCE($1, name),
           address = COALESCE($2, address),
           latitude = $3,
           longitude = $4,
           is_default = COALESCE($5, is_default),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [name, address, latitude || null, longitude || null, is_default, req.params.id, req.user.id]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({ error: 'Ошибка обновления адреса' });
  }
});

/**
 * PUT /api/addresses/:id/default
 * Установить адрес по умолчанию
 */
router.put('/:id/default', authenticate, async (req, res) => {
  try {
    // Сбросить is_default у всех адресов пользователя
    await pool.query(
      'UPDATE user_addresses SET is_default = false WHERE user_id = $1',
      [req.user.id]
    );
    
    // Установить is_default для выбранного адреса
    const result = await pool.query(
      `UPDATE user_addresses 
       SET is_default = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Адрес не найден' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Set default address error:', error);
    res.status(500).json({ error: 'Ошибка установки адреса по умолчанию' });
  }
});

/**
 * DELETE /api/addresses/:id
 * Удалить адрес
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM user_addresses WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Адрес не найден' });
    }
    
    res.json({ success: true, message: 'Адрес удален' });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({ error: 'Ошибка удаления адреса' });
  }
});

module.exports = router;
