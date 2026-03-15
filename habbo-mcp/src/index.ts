import 'dotenv/config';
import { startServer } from './server.js';
import { startAgentHotelSync } from './sync/agentHotelSync.js';

startAgentHotelSync();

startServer().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
