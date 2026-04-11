import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// POST /spontaneous/start
router.post('/start', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { title } = req.body as { title: string };

    if (!title?.trim()) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    // End any existing active spontaneous session
    db.prepare(
      "UPDATE spontaneous_sessions SET status = 'abandoned' WHERE user_id = ? AND status = 'active'"
    ).run(req.user!.id);

    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO spontaneous_sessions (id, user_id, title, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?)
    `).run(id, req.user!.id, title.trim(), now, now);

    res.status(201).json({
      id,
      title: title.trim(),
      user_id: req.user!.id,
      status: 'active',
      stops: [],
      started_at: new Date(now * 1000).toISOString(),
      updated_at: new Date(now * 1000).toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// GET /spontaneous/active
router.get('/active', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();

    const session = db.prepare(`
      SELECT * FROM spontaneous_sessions WHERE user_id = ? AND status = 'active'
    `).get(req.user!.id) as Record<string, unknown> | undefined;

    if (!session) {
      res.json(null);
      return;
    }

    const stops = db.prepare(
      'SELECT * FROM spontaneous_stops WHERE session_id = ? ORDER BY created_at'
    ).all(session.id);

    res.json({
      ...session,
      stops,
    });
  } catch (err) {
    next(err);
  }
});

// POST /spontaneous/:id/stops
router.post('/:id/stops', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { title, location } = req.body as {
      title: string;
      location: { lat: number; lng: number; label?: string };
    };

    const session = db.prepare('SELECT * FROM spontaneous_sessions WHERE id = ? AND status = ?').get(id, 'active') as Record<string, unknown> | undefined;
    if (!session) {
      res.status(404).json({ error: 'Spontaneous session not found' });
      return;
    }
    if (session.user_id !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const stopId = uuidv4();
    db.prepare(`
      INSERT INTO spontaneous_stops (id, session_id, title, location_lat, location_lng, location_label)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(stopId, id, title, location.lat, location.lng, location.label || null);

    const stop = db.prepare('SELECT * FROM spontaneous_stops WHERE id = ?').get(stopId);
    res.status(201).json(stop);
  } catch (err) {
    next(err);
  }
});

// POST /spontaneous/:id/stops/:stopId/complete
router.post('/:id/stops/:stopId/complete', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id: sessionId, stopId } = req.params;

    const session = db.prepare('SELECT * FROM spontaneous_sessions WHERE id = ? AND status = ?').get(sessionId, 'active') as Record<string, unknown> | undefined;
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.user_id !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    db.prepare('UPDATE spontaneous_stops SET checked_in_at = ? WHERE id = ? AND session_id = ?').run(now, stopId, sessionId);

    const updated = db.prepare('SELECT * FROM spontaneous_sessions WHERE id = ?').get(sessionId) as Record<string, unknown>;
    const stops = db.prepare('SELECT * FROM spontaneous_stops WHERE session_id = ? ORDER BY created_at').all(sessionId);

    res.json({ ...updated, stops });
  } catch (err) {
    next(err);
  }
});

// POST /spontaneous/:id/end
router.post('/:id/end', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const sessionId = String(req.params.id);

    const session = db.prepare('SELECT * FROM spontaneous_sessions WHERE id = ?').get(sessionId) as Record<string, unknown> | undefined;
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.user_id !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    db.prepare("UPDATE spontaneous_sessions SET status = 'completed', updated_at = ? WHERE id = ?").run(now, sessionId);

    res.json({ message: 'Session ended' });
  } catch (err) {
    next(err);
  }
});

export default router;
