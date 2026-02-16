/**
 * Vercel serverless entry point.
 * Exports the Express app for Vercel to handle.
 */
const app = require('../src/index');
module.exports = app;
