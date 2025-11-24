const Item = require('../models/Item');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/asyncHandler');

// @desc    Get all items for the authenticated user
// @route   GET /api/v1/items
// @access  Private
exports.getItems = asyncHandler(async (req, res, next) => {
    // Only fetch items belonging to the currently logged-in user (req.user.id is set by middleware)
    const items = await Item.find({ user: req.user.id });

    res.status(200).json({
        success: true,
        count: items.length,
        data: items
    });
});

// @desc    Create new item
// @route   POST /api/v1/items
// @access  Private
exports.createItem = asyncHandler(async (req, res, next) => {
    // Add user ID to the request body before creating the item
    req.body.user = req.user.id;

    const item = await Item.create(req.body);

    res.status(201).json({
        success: true,
        data: item
    });
});

// @desc    Delete item
// @route   DELETE /api/v1/items/:id
// @access  Private
exports.deleteItem = asyncHandler(async (req, res, next) => {
    const item = await Item.findById(req.params.id);

    if (!item) {
        // If an item with that ID doesn't exist, use the ErrorResponse class
        return next(new ErrorResponse(`Item not found with id of ${req.params.id}`, 404));
    }

    // Ensure user is the item owner
    if (item.user.toString() !== req.user.id) {
        return next(new ErrorResponse(`User ${req.user.id} is not authorized to delete this item`, 401));
    }

    // If the user owns the item, delete it
    await item.deleteOne();

    res.status(200).json({
        success: true,
        data: {}
    });
});
