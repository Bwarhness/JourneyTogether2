import 'dotenv/config';
import { createApp } from './app.js';
import { getDb, closeDb } from './config/database.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

// Initialize database connection
getDb();

const app = createApp();

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[JourneyTogether API] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[JourneyTogether API] Health check: http://0.0.0.0:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close(() => {
    closeDb();
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  server.close(() => {
    closeDb();
    process.exit(0);
  });
});
