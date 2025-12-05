const express = require('express');
const { fileUpload } = require('../controllers/upload');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/', protect, fileUpload);

module.exports = router;