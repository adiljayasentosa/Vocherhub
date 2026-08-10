const express = require('express');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const { requireAuth } = require('../middlewares/auth');
const { loginLimiter } = require('../middlewares/security');
const authController = require('../controllers/authController');

const router = express.Router();

router.post(
  '/login',
  loginLimiter,
  body('idToken').isString().notEmpty().withMessage('idToken wajib diisi.'),
  validate,
  authController.login
);

// Not behind requireAuth: logout must succeed even with an expired/invalid
// session cookie so the client can always clear its state.
router.post('/logout', authController.logout);

router.get('/me', requireAuth, authController.me);

module.exports = router;
