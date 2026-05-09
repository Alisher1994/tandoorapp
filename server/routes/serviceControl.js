const express = require('express');
const {
  SERVICE_KEY,
  getServiceState,
  toggleServiceState,
  canManageService
} = require('../services/serviceControl');

const router = express.Router();

router.get('/state', async (req, res) => {
  try {
    const payload = await getServiceState(req.query.service || SERVICE_KEY);
    if (!payload.success) return res.status(404).json(payload);
    return res.json(payload);
  } catch (error) {
    console.error('Service state error:', error);
    return res.status(500).json({ success: false, message: 'Ошибка получения статуса сервиса' });
  }
});

router.get('/telegram/status', async (req, res) => {
  try {
    const chatId = String(req.query.chat_id || '').trim();
    if (!chatId) return res.status(400).json({ success: false, message: 'chat_id не указан' });
    if (!canManageService(req, chatId)) {
      return res.status(403).json({ success: false, message: 'Доступ запрещен для этого chat_id' });
    }

    const payload = await getServiceState(req.query.service || SERVICE_KEY);
    if (!payload.success) return res.status(404).json(payload);
    return res.json(payload);
  } catch (error) {
    console.error('Service status error:', error);
    return res.status(500).json({ success: false, message: 'Ошибка получения статуса сервиса' });
  }
});

router.post('/telegram/toggle', async (req, res) => {
  try {
    const chatId = String(req.body?.chat_id || '').trim();
    if (!chatId) return res.status(400).json({ success: false, message: 'chat_id не указан' });
    if (!canManageService(req, chatId)) {
      return res.status(403).json({ success: false, message: 'Доступ запрещен для этого chat_id' });
    }

    const payload = await toggleServiceState({
      serviceKey: req.body?.service || SERVICE_KEY,
      updatedBy: `chat:${chatId}`
    });
    if (!payload.success) return res.status(404).json(payload);
    return res.json(payload);
  } catch (error) {
    console.error('Service toggle error:', error);
    return res.status(500).json({ success: false, message: 'Ошибка переключения сервиса' });
  }
});

module.exports = router;
