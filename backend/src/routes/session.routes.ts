import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// POST /sessions/solo/start — start a solo session
router.post('/solo/start', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { journey_id } = req.body as { journey_id: string };

    if (!journey_id) {
      res.status(400).json({ error: 'journey_id is required' });
      return;
    }

    const journey = db.prepare('SELECT * FROM journeys WHERE id = ?').get(journey_id) as Record<string, unknown> | undefined;
    if (!journey) {
      res.status(404).json({ error: 'Journey not found' });
      return;
    }

    // Check for existing active solo session
    const existing = db.prepare(`
      SELECT * FROM active_sessions
      WHERE owner_id = ? AND journey_id = ? AND status != 'completed' AND is_group = 0
    `).get(req.user!.id, journey_id);
    if (existing) {
      res.status(409).json({ error: 'Active session already exists', code: 'SESSION_EXISTS' });
      return;
    }

    const sessionId = uuidv4();
    const inviteCode = generateInviteCode();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO active_sessions (id, journey_id, owner_id, invite_code, status, current_stop_index, is_group, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', 0, 0, ?, ?)
    `).run(sessionId, journey_id, req.user!.id, inviteCode, now, now);

    db.prepare(`
      INSERT INTO session_members (session_id, user_id, role, current_stop_index, completed_stop_ids)
      VALUES (?, ?, 'owner', 0, '[]')
    `).run(sessionId, req.user!.id);

    const stops = db.prepare('SELECT * FROM stops WHERE journey_id = ? ORDER BY "order"').all(journey_id);

    res.status(201).json({
      id: sessionId,
      journey_id,
      owner_id: req.user!.id,
      invite_code: inviteCode,
      status: 'active',
      current_stop_index: 0,
      is_group: false,
      stops,
    });
  } catch (err) {
    next(err);
  }
});

// POST /sessions/solo/:id/stops/:stopId/complete
router.post('/solo/:id/stops/:stopId/complete', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const sessionId = String(req.params.id);
    const stopId = String(req.params.stopId);

    const session = db.prepare('SELECT * FROM active_sessions WHERE id = ?').get(sessionId) as Record<string, unknown> | undefined;
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.owner_id !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    if (session.status === 'completed') {
      res.status(400).json({ error: 'Session already completed' });
      return;
    }

    const member = db.prepare('SELECT * FROM session_members WHERE session_id = ? AND user_id = ?').get(sessionId, req.user!.id) as Record<string, unknown> | undefined;
    if (!member) {
      res.status(403).json({ error: 'Not a member of this session' });
      return;
    }

    const stop = db.prepare('SELECT * FROM stops WHERE id = ? AND journey_id = ?').get(stopId, session.journey_id) as Record<string, unknown> | undefined;
    if (!stop) {
      res.status(404).json({ error: 'Stop not found in this journey' });
      return;
    }

    const completedIds: string[] = JSON.parse((member.completed_stop_ids as string) || '[]');
    if (!completedIds.includes(stopId)) {
      completedIds.push(stopId);
      db.prepare('UPDATE session_members SET completed_stop_ids = ? WHERE session_id = ? AND user_id = ?').run(
        JSON.stringify(completedIds),
        sessionId,
        req.user!.id
      );
    }

    // Advance to next stop
    const nextIndex = (session.current_stop_index as number) + 1;
    db.prepare('UPDATE active_sessions SET current_stop_index = ?, updated_at = ? WHERE id = ?').run(
      nextIndex,
      Math.floor(Date.now() / 1000),
      sessionId
    );

    const stops = db.prepare('SELECT * FROM stops WHERE journey_id = ? ORDER BY "order"').all(session.journey_id);
    const updatedSession = db.prepare('SELECT * FROM active_sessions WHERE id = ?').get(sessionId);
    const updatedMember = db.prepare('SELECT * FROM session_members WHERE session_id = ? AND user_id = ?').get(sessionId, req.user!.id);

    res.json({ session: updatedSession, member: updatedMember, stops });
  } catch (err) {
    next(err);
  }
});

// POST /sessions/solo/:id/end
router.post('/solo/:id/end', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id: sessionId } = req.params;

    const session = db.prepare('SELECT * FROM active_sessions WHERE id = ?').get(sessionId) as Record<string, unknown> | undefined;
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.owner_id !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    db.prepare("UPDATE active_sessions SET status = 'completed', updated_at = ? WHERE id = ?").run(now, sessionId);

    // Create completion record for solo sessions
    const completionId = uuidv4();
    const durationMinutes = Math.floor((now - (session.created_at as number)) / 60);
    db.prepare(`
      INSERT INTO journey_completions (id, user_id, journey_id, session_id, completed_at, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(completionId, req.user!.id, session.journey_id, sessionId, now, durationMinutes);

    res.json({ message: 'Session ended', completion_id: completionId });
  } catch (err) {
    next(err);
  }
});

// GET /sessions/active — get user's active session
router.get('/active', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();

    const session = db.prepare(`
      SELECT s.*, j.title as journey_title
      FROM active_sessions s
      JOIN journeys j ON s.journey_id = j.id
      WHERE s.owner_id = ? AND s.is_group = 0 AND s.status != 'completed'
      ORDER BY s.created_at DESC
      LIMIT 1
    `).get(req.user!.id) as Record<string, unknown> | undefined;

    if (!session) {
      res.json(null);
      return;
    }

    const stops = db.prepare('SELECT * FROM stops WHERE journey_id = ? ORDER BY "order"').all(session.journey_id);
    const member = db.prepare('SELECT * FROM session_members WHERE session_id = ? AND user_id = ?').get(session.id, req.user!.id);

    res.json({ ...session, stops, member });
  } catch (err) {
    next(err);
  }
});

export default router;
