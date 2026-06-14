const express = require('express');
const { requireAdmin } = require('../middleware');
const { getAllKeys, createKey, revokeKey, deleteKey, addCredits, getStats } = require('../db');
const { getBalance } = require('../twocaptcha');

const router = express.Router();

router.get('/keys', requireAdmin, (req, res) => {
  res.json({ keys: getAllKeys() });
});

router.post('/keys', requireAdmin, (req, res) => {
  const { label, credits } = req.body;
  const entry = createKey(label, credits ? parseInt(credits, 10) : 0);
  res.status(201).json({ key: entry });
});

router.post('/keys/:id/credits', requireAdmin, (req, res) => {
  const amount = parseInt(req.body.amount, 10);
  if (!amount || amount < 1) return res.status(400).json({ error: 'amount must be a positive integer' });
  const newBalance = addCredits(req.params.id, amount);
  if (newBalance === false) return res.status(404).json({ error: 'Key not found' });
  res.json({ success: true, credits: newBalance });
});

router.get('/stats', requireAdmin, async (req, res) => {
  const stats = getStats();
  let balance = null;
  try { balance = await getBalance(); } catch {}
  res.json({ ...stats, twocaptchaBalance: balance });
});

router.patch('/keys/:id/revoke', requireAdmin, (req, res) => {
  const ok = revokeKey(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Key not found' });
  res.json({ success: true });
});

router.delete('/keys/:id', requireAdmin, (req, res) => {
  const ok = deleteKey(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Key not found' });
  res.json({ success: true });
});

module.exports = router;
