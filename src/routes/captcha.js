const express = require('express');
const { requireApiKey } = require('../middleware');
const { deductCredit, getStats } = require('../db');
const { solveFunCaptchaToken, validateFunCaptchaParams } = require('../twocaptcha');

const router = express.Router();

router.get('/stats/public', (req, res) => {
  const stats = getStats();
  res.json({
    success: true,
    totalRequests: stats.totalRequests || 0
  });
});

router.post('/captcha/solve', requireApiKey, async (req, res) => {
  let params;
  try {
    params = validateFunCaptchaParams(req.body || {});
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message,
      message: 'Provide "pageurl" (the page hosting the FunCaptcha) and "publickey" (the Arkose public key). "surl" is optional.'
    });
  }

  const ok = deductCredit(req.apiKeyEntry.key);
  if (!ok) {
    return res.status(402).json({
      success: false,
      error: 'Insufficient credits',
      message: 'Purchase more credits at bearcaptcha.live'
    });
  }

  try {
    const { token } = await solveFunCaptchaToken(params);

    res.json({
      success: true,
      token,
      credits_remaining: req.apiKeyEntry.credits - 1,
      usage: 'Pass token as captchaToken with captchaProvider: PROVIDER_ARKOSE_LABS'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/captcha/credits', requireApiKey, (req, res) => {
  res.json({
    success: true,
    label: req.apiKeyEntry.label,
    credits: req.apiKeyEntry.credits || 0,
    requests: req.apiKeyEntry.requests || 0
  });
});

module.exports = router;
