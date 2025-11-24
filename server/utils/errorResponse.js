class ErrorResponse extends Error {
    /**
     * Creates a custom error object for uniform API responses.
     * @param {string} message - The error message.
     * @param {number} statusCode - The HTTP status code to return.
     */
    constructor(message, statusCode) {
        // Call the parent (Error) constructor
        super(message);
        this.statusCode = statusCode;
    }
}

module.exports = ErrorResponse;
