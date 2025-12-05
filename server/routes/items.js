const express = require('express');
const { getItems, createItem, deleteItem } = require('../controllers/items');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.route('/')
    .get(protect, getItems)
    .post(protect, createItem);

router.route('/:id')
    .delete(protect, deleteItem);

module.exports = router;