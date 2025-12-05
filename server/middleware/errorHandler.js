const ErrorResponse = require('../utils/errorResponse');

const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // Log the error stack to the console for debugging
    console.error(`Error Stack: ${err.stack}`);

    // Mongoose Bad ObjectId (CastError - happens when providing an invalid ID format)
    if (err.name === 'CastError') {
        const message = `Resource not found. Invalid ID: ${err.value}`;
        error = new ErrorResponse(message, 404);
    }

    // Mongoose Duplicate Key (E11000 - happens when trying to register a user with an existing email)
    if (err.code === 11000) {
        // Extract the field that caused the duplicate key error
        const field = Object.keys(err.keyValue).join(', ');
        const message = `Duplicate field value entered for ${field}. Value: ${err.keyValue[field]}.`;
        error = new ErrorResponse(message, 400);
    }

    // Mongoose Validation Error (happens if required fields are missing or data types are wrong)
    if (err.name === 'ValidationError') {
        // Join all validation messages into a single string
        const messages = Object.values(err.errors).map(val => val.message).join(', ');
        error = new ErrorResponse(`Validation Failed: ${messages}`, 400);
    }

    // Respond with the determined status code and error message
    res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Server Error'
    });
};

module.exports = errorHandler;
