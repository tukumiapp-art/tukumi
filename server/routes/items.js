const express = require('express');
// Ensure these three functions are correctly imported (they match the exports in the controller)
const { 
    getItems, 
    createItem, 
    deleteItem 
} = require('../controllers/items'); 
const { protect } = require('../middleware/auth');

const router = express.Router();

// Route for /api/v1/items
router
    .route('/')
    .get(protect, getItems) // Now getItems should be defined
    .post(protect, createItem);

// Route for /api/v1/items/:id
router
    .route('/:id')
    .delete(protect, deleteItem);

module.exports = router;
