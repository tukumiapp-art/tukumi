/**
 * Simple wrapper utility for Express async route handlers.
 * It catches any errors and passes them directly to the Express error middleware.
 * @param {Function} fn - The async function (controller method) to wrap.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
