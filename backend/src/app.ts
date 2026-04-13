import express from 'express';
import cors from 'cors';
import path from 'path';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import journeyRoutes from './routes/journey.routes.js';
import sessionRoutes from './routes/session.routes.js';
import userRoutes from './routes/user.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import reactionRoutes from './routes/reaction.routes.js';
import spontaneousRoutes from './routes/spontaneous.routes.js';
import groupSessionRoutes from './routes/groupSession.routes.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/mnt/user/journeytogether/uploads';

export function createApp(): express.Application {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Serve uploaded files
  app.use('/uploads', express.static(path.join(UPLOAD_DIR)));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Routes
  app.use('/auth', authRoutes);
  app.use('/journeys', journeyRoutes);
  app.use('/sessions', sessionRoutes);
  app.use('/users', userRoutes);
  app.use('/upload', uploadRoutes);
  app.use('/journeys', reactionRoutes);
  app.use('/spontaneous', spontaneousRoutes);
  app.use('/sessions/group', groupSessionRoutes);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
