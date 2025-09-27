'use strict';

// Serverless wrapper for our Express app to run on Vercel
const serverless = require('serverless-http');
const path = require('path');

// Ensure env from src/.env.local is loaded when running on Vercel
try {
  require('dotenv').config();
  require('dotenv').config({ path: path.join(__dirname, '..', 'src', '.env.local') });
} catch (_) {}

const app = require('../src/server-supabase');

module.exports = serverless(app);

