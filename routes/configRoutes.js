const express = require('express');
const configController = require('../controllers/configController');

const router = express.Router();

router.get('/firebase-client', configController.getFirebaseClientConfig);

module.exports = router;
