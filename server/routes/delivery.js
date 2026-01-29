const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const axios = require('axios');

// Константы для расчета стоимости доставки
const BASE_RADIUS_KM = 2;      // Базовый радиус бесплатной доставки
const BASE_PRICE = 5000;       // Базовая стоимость доставки (сум)
const PRICE_PER_KM = 2000;     // Цена за каждый км после базового радиуса (сум)

/**
 * Получить расстояние между двумя точками через OSRM API (реальное дорожное расстояние)
 */
async function getRoadDistance(fromLat, fromLng, toLat, toLng) {
  try {
    const url = `http://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
    const response = await axios.get(url, { timeout: 10000 });
    
    if (response.data.code === 'Ok' && response.data.routes.length > 0) {
      // Расстояние в метрах -> километры
      const distanceMeters = response.data.routes[0].distance;
      return distanceMeters / 1000;
    }
    return null;
  } catch (error) {
    console.error('OSRM API error:', error.message);
    return null;
  }
}

/**
 * Расчет прямого расстояния (формула Гаверсина) - fallback если OSRM недоступен
 */
function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Радиус Земли в км
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Расчет стоимости доставки
 */
function calculateDeliveryPrice(distanceKm) {
  if (distanceKm <= BASE_RADIUS_KM) {
    return BASE_PRICE;
  }
  const extraKm = Math.ceil(distanceKm - BASE_RADIUS_KM);
  return BASE_PRICE + (extraKm * PRICE_PER_KM);
}

/**
 * POST /api/delivery/calculate
 * Рассчитать стоимость доставки
 * Body: { restaurant_id, customer_lat, customer_lng }
 */
router.post('/calculate', async (req, res) => {
  try {
    const { restaurant_id, customer_lat, customer_lng } = req.body;
    
    if (!restaurant_id || !customer_lat || !customer_lng) {
      return res.status(400).json({ 
        error: 'Необходимы параметры: restaurant_id, customer_lat, customer_lng' 
      });
    }
    
    // Получаем координаты и настройки доставки ресторана
    const result = await pool.query(
      `SELECT latitude, longitude, name, 
              delivery_base_radius, delivery_base_price, delivery_price_per_km 
       FROM restaurants WHERE id = $1`,
      [restaurant_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }
    
    const restaurant = result.rows[0];
    
    // Используем настройки ресторана или дефолтные значения
    const baseRadius = parseFloat(restaurant.delivery_base_radius) || BASE_RADIUS_KM;
    const basePrice = parseFloat(restaurant.delivery_base_price) || BASE_PRICE;
    const pricePerKm = parseFloat(restaurant.delivery_price_per_km) || PRICE_PER_KM;
    
    // Если у ресторана нет координат
    if (!restaurant.latitude || !restaurant.longitude) {
      return res.json({
        delivery_cost: 0,
        distance_km: 0,
        message: 'Координаты ресторана не указаны - бесплатная доставка',
        free_delivery: true
      });
    }
    
    const restaurantLat = parseFloat(restaurant.latitude);
    const restaurantLng = parseFloat(restaurant.longitude);
    const custLat = parseFloat(customer_lat);
    const custLng = parseFloat(customer_lng);
    
    // Пробуем получить реальное дорожное расстояние через OSRM
    let distanceKm = await getRoadDistance(restaurantLat, restaurantLng, custLat, custLng);
    let distanceType = 'road';
    
    // Если OSRM недоступен - используем прямое расстояние с коэффициентом
    if (distanceKm === null) {
      distanceKm = getHaversineDistance(restaurantLat, restaurantLng, custLat, custLng) * 1.3;
      distanceType = 'straight_line';
    }
    
    // Расчет с индивидуальными настройками ресторана
    let deliveryCost = basePrice;
    if (distanceKm > baseRadius) {
      const extraKm = distanceKm - baseRadius;
      deliveryCost = basePrice + (extraKm * pricePerKm);
    }
    deliveryCost = Math.round(deliveryCost / 500) * 500; // Округляем до 500 сум
    
    res.json({
      delivery_cost: deliveryCost,
      distance_km: Math.round(distanceKm * 100) / 100,
      distance_type: distanceType,
      base_radius_km: baseRadius,
      base_price: basePrice,
      price_per_km: pricePerKm,
      restaurant_name: restaurant.name
    });
    
  } catch (error) {
    console.error('Delivery calculation error:', error);
    res.status(500).json({ error: 'Ошибка расчета доставки' });
  }
});

/**
 * GET /api/delivery/info
 * Получить информацию о тарифах доставки (для конкретного ресторана или дефолтные)
 */
router.get('/info', async (req, res) => {
  const { restaurant_id } = req.query;
  
  let baseRadius = BASE_RADIUS_KM;
  let basePrice = BASE_PRICE;
  let pricePerKm = PRICE_PER_KM;
  
  if (restaurant_id) {
    try {
      const result = await pool.query(
        `SELECT delivery_base_radius, delivery_base_price, delivery_price_per_km 
         FROM restaurants WHERE id = $1`,
        [restaurant_id]
      );
      
      if (result.rows.length > 0) {
        const r = result.rows[0];
        baseRadius = parseFloat(r.delivery_base_radius) || BASE_RADIUS_KM;
        basePrice = parseFloat(r.delivery_base_price) || BASE_PRICE;
        pricePerKm = parseFloat(r.delivery_price_per_km) || PRICE_PER_KM;
      }
    } catch (error) {
      console.error('Error fetching restaurant delivery settings:', error);
    }
  }
  
  res.json({
    base_radius_km: baseRadius,
    base_price: basePrice,
    price_per_km: pricePerKm,
    description: `Доставка в радиусе ${baseRadius} км - ${basePrice} сум. Каждый дополнительный км - ${pricePerKm} сум.`
  });
});

module.exports = router;
