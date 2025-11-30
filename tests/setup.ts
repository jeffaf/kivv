// =============================================================================
// kivv - Test Setup
// =============================================================================
// Initializes database schema before tests run
// This ensures all tests have a clean database with proper schema
// =============================================================================

import { env } from 'cloudflare:test';
import { readFileSync } from 'fs';
import { join } from 'path';

// Initialize database schema before all tests
export async function setup() {
  try {
    // Read schema SQL file
    const schemaPath = join(__dirname, '../shared/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    // Execute schema (this creates tables and indexes)
    await env.DB.exec(schema);

    console.log('[TEST SETUP] Database schema initialized successfully');
  } catch (error) {
    console.error('[TEST SETUP] Failed to initialize database schema:', error);
    throw error;
  }
}
