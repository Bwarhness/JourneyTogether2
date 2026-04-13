import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { getDb } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'journeytogether-secret';

// In-memory map: sessionId -> Set<wsclient>
const sessionClients = new Map<string, Set<{ send: (data: string) => void; userId: string }>>();

export function broadcastToSession(sessionId: string, event: object) {
  const clients = sessionClients.get(sessionId);
  if (!clients) return;
  const msg = JSON.stringify(event);
  for (const client of clients) {
    try {
      client.send(msg);
    } catch {
      // Stale client will be cleaned up on disconnect
    }
  }
}

export function addClientToSession(sessionId: string, client: { send: (data: string) => void; userId: string }) {
  if (!sessionClients.has(sessionId)) {
    sessionClients.set(sessionId, new Set());
  }
  sessionClients.get(sessionId)!.add(client);
}

export function removeClientFromSession(sessionId: string, userId: string) {
  const clients = sessionClients.get(sessionId);
  if (!clients) return;
  for (const client of clients) {
    if (client.userId === userId) {
      clients.delete(client);
      break;
    }
  }
  if (clients.size === 0) {
    sessionClients.delete(sessionId);
  }
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function formatSession(sessionId: string): unknown {
  const db = getDb();

  const session = db.prepare('SELECT * FROM active_sessions WHERE id = ?').get(sessionId) as Record<string, unknown> | undefined;
  if (!session) return null;

  const journey = db.prepare('SELECT * FROM journeys WHERE id = ?').get(session.journey_id) as Record<string, unknown> | undefined;

  const stops = db.prepare('SELECT * FROM stops WHERE journey_id = ? ORDER BY "order"').all(session.journey_id) as Record<string, unknown>[];

  const members = db.prepare('SELECT * FROM session_members WHERE session_id = ?').all(sessionId) as Record<string, unknown>[];

  const participants = members.map((m) => {
    const user = db.prepare('SELECT id, display_name, avatar_url FROM users WHERE id = ?').get(m.user_id) as Record<string, unknown>;
    const completedIds: string[] = JSON.parse((m.completed_stop_ids as string) || '[]');
    const isComplete = completedIds.length === stops.length;
    return {
      id: m.session_id + '_' + m.user_id,
      oduser_id: m.user_id,
      username: user?.display_name || 'Unknown',
      avatar_url: user?.avatar_url || null,
      status: isComplete ? 'checked_in' : (m.role === 'owner' ? 'joined' : 'joined'),
      current_stop_index: m.current_stop_index,
      joined_at: new Date((m.joined_at as number) * 1000).toISOString(),
    };
  });

  return {
    id: session.id,
    journey_id: session.journey_id,
    journey: journey ? {
      ...journey,
      tags: JSON.parse((journey.tags as string) || '[]'),
      is_public: Boolean(journey.is_public),
      is_highlighted: Boolean(journey.is_highlighted),
    } : null,
    stops: stops.map((s) => ({
      ...s,
      location: { lat: s.location_lat, lng: s.location_lng, label: s.location_label || '' },
      estimated_time: s.estimated_time,
      tips: JSON.parse((s.tips as string) || '[]'),
      photo_requirement: Boolean(s.photo_required),
      voice_note_url: s.voice_note_url || null,
      checked_in_at: null,
    })),
    status: session.status,
    participants,
    invite_code: session.invite_code,
    current_stop_index: session.current_stop_index,
    started_at: session.started_at ? new Date((session.started_at as number) * 1000).toISOString() : null,
    updated_at: new Date((session.updated_at as number) * 1000).toISOString(),
  };
}

// ─── POST /sessions/group/create ────────────────────────────────────────────────
router.post('/create', requireAuth, (req: Request, res: Response, next: NextFunction) => {
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

    const sessionId = uuidv4();
    const inviteCode = generateInviteCode();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO active_sessions (id, journey_id, owner_id, invite_code, status, current_stop_index, is_group, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'waiting', 0, 1, ?, ?)
    `).run(sessionId, journey_id, req.user!.id, inviteCode, now, now);

    db.prepare(`
      INSERT INTO session_members (session_id, user_id, role, current_stop_index, completed_stop_ids)
      VALUES (?, ?, 'owner', 0, '[]')
    `).run(sessionId, req.user!.id);

    const result = formatSession(sessionId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// ─── GET /sessions/group/code/:inviteCode ─────────────────────────────────────
router.get('/code/:inviteCode', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { inviteCode } = req.params;

    const session = db.prepare('SELECT * FROM active_sessions WHERE invite_code = ? AND is_group = 1').get(inviteCode) as Record<string, unknown> | undefined;
    if (!session) {
      res.status(404).json({ error: 'Invalid invite code' });
      return;
    }

    const result = formatSession(session.id as string);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /sessions/group/join ─────────────────────────────────────────────────
router.post('/join', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { invite_code } = req.body as { invite_code: string };

    if (!invite_code) {
      res.status(400).json({ error: 'invite_code is required' });
      return;
    }

    const session = db.prepare('SELECT * FROM active_sessions WHERE invite_code = ? AND is_group = 1').get(invite_code.toUpperCase()) as Record<string, unknown> | undefined;
    if (!session) {
      res.status(404).json({ error: 'Invalid invite code' });
      return;
    }

    if (session.status !== 'waiting') {
      res.status(400).json({ error: 'Session has already started' });
      return;
    }

    // Check if already a member
    const existing = db.prepare('SELECT * FROM session_members WHERE session_id = ? AND user_id = ?').get(session.id, req.user!.id);
    if (existing) {
      const result = formatSession(session.id as string);
      res.json(result);
      return;
    }

    db.prepare(`
      INSERT INTO session_members (session_id, user_id, role, current_stop_index, completed_stop_ids)
      VALUES (?, ?, 'member', 0, '[]')
    `).run(session.id, req.user!.id);

    // Broadcast participant_joined
    const user = db.prepare('SELECT id, display_name, avatar_url FROM users WHERE id = ?').get(req.user!.id) as Record<string, unknown>;
    broadcastToSession(session.id as string, {
      type: 'participant_joined',
      payload: {
        participant: {
          id: session.id + '_' + req.user!.id,
          oduser_id: req.user!.id,
          username: user?.display_name || 'Unknown',
          avatar_url: user?.avatar_url || null,
          status: 'joined',
          current_stop_index: 0,
          joined_at: new Date().toISOString(),
        },
      },
    });

    const result = formatSession(session.id as string);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── GET /sessions/group/:id ────────────────────────────────────────────────────
router.get('/:id', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const id = String(req.params.id);

    const session = db.prepare('SELECT * FROM active_sessions WHERE id = ? AND is_group = 1').get(id) as Record<string, unknown> | undefined;
    if (!session) {
      res.status(404).json({ error: 'Group session not found' });
      return;
    }

    const result = formatSession(id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /sessions/group/:id/leave ────────────────────────────────────────────
router.post('/:id/leave', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const sessionId = String(req.params.id);

    const session = db.prepare('SELECT * FROM active_sessions WHERE id = ? AND is_group = 1').get(sessionId) as Record<string, unknown> | undefined;
    if (!session) {
      res.status(404).json({ error: 'Group session not found' });
      return;
    }

    const member = db.prepare('SELECT * FROM session_members WHERE session_id = ? AND user_id = ?').get(sessionId, req.user!.id);
    if (!member) {
      res.status(403).json({ error: 'Not a member of this session' });
      return;
    }

    // If owner leaves, delete the session
    if ((member as Record<string, unknown>).role === 'owner') {
      db.prepare('DELETE FROM active_sessions WHERE id = ?').run(sessionId);
      res.json({ message: 'Session deleted (owner left)' });
      return;
    }

    db.prepare('DELETE FROM session_members WHERE session_id = ? AND user_id = ?').run(sessionId, req.user!.id);

    // Broadcast participant_left
    broadcastToSession(sessionId, {
      type: 'participant_left',
      payload: { participant_id: req.user!.id },
    });

    res.json({ message: 'Left session' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /sessions/group/:id/kick ──────────────────────────────────────────────
router.post('/:id/kick', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const sessionId = String(req.params.id);
    const { oduser_id } = req.body as { oduser_id: string };

    if (!oduser_id) {
      res.status(400).json({ error: 'oduser_id is required' });
      return;
    }

    const session = db.prepare('SELECT * FROM active_sessions WHERE id = ? AND is_group = 1').get(sessionId) as Record<string, unknown> | undefined;
    if (!session) {
      res.status(404).json({ error: 'Group session not found' });
      return;
    }

    if (session.owner_id !== req.user!.id) {
      res.status(403).json({ error: 'Only the host can kick participants' });
      return;
    }

    db.prepare('DELETE FROM session_members WHERE session_id = ? AND user_id = ?').run(sessionId, oduser_id);

    // Broadcast participant_left
    broadcastToSession(sessionId, {
      type: 'participant_left',
      payload: { participant_id: oduser_id },
    });

    res.json({ message: 'Participant kicked' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /sessions/group/:id/start ───────────────────────────────────────────
router.post('/:id/start', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const sessionId = String(req.params.id);

    const session = db.prepare('SELECT * FROM active_sessions WHERE id = ? AND is_group = 1').get(sessionId) as Record<string, unknown> | undefined;
    if (!session) {
      res.status(404).json({ error: 'Group session not found' });
      return;
    }

    if (session.owner_id !== req.user!.id) {
      res.status(403).json({ error: 'Only the host can start the session' });
      return;
    }

    if (session.status !== 'waiting') {
      res.status(400).json({ error: 'Session already started' });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    db.prepare("UPDATE active_sessions SET status = 'active', started_at = ?, updated_at = ? WHERE id = ?").run(now, now, sessionId);

    // Broadcast session_started
    broadcastToSession(sessionId, {
      type: 'session_started',
      payload: { started_at: new Date(now * 1000).toISOString() },
    });

    const result = formatSession(sessionId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /sessions/group/:id/stops/:stopId/complete ──────────────────────────
router.post('/:id/stops/:stopId/complete', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const sessionId = String(req.params.id);
    const stopId = String(req.params.stopId);

    const session = db.prepare('SELECT * FROM active_sessions WHERE id = ? AND is_group = 1').get(sessionId) as Record<string, unknown> | undefined;
    if (!session) {
      res.status(404).json({ error: 'Group session not found' });
      return;
    }

    if (session.status !== 'active') {
      res.status(400).json({ error: 'Session is not active' });
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
    }

    const newStopIndex = (member.current_stop_index as number) + 1;
    db.prepare('UPDATE session_members SET current_stop_index = ?, completed_stop_ids = ? WHERE session_id = ? AND user_id = ?').run(
      newStopIndex,
      JSON.stringify(completedIds),
      sessionId,
      req.user!.id
    );

    // Get updated member and user info
    const updatedMember = db.prepare('SELECT * FROM session_members WHERE session_id = ? AND user_id = ?').get(sessionId, req.user!.id) as Record<string, unknown>;
    const user = db.prepare('SELECT id, display_name, avatar_url FROM users WHERE id = ?').get(req.user!.id) as Record<string, unknown>;
    const allStops = db.prepare('SELECT * FROM stops WHERE journey_id = ? ORDER BY "order"').all(session.journey_id) as Record<string, unknown>[];
    const isComplete = completedIds.length === allStops.length;

    const participant = {
      id: sessionId + '_' + req.user!.id,
      oduser_id: req.user!.id,
      username: user?.display_name || 'Unknown',
      avatar_url: user?.avatar_url || null,
      status: isComplete ? 'checked_in' : 'checked_in',
      current_stop_index: updatedMember.current_stop_index,
      joined_at: new Date((updatedMember.joined_at as number) * 1000).toISOString(),
    };

    // Broadcast stop_completed
    broadcastToSession(sessionId, {
      type: 'stop_completed',
      payload: { participant },
    });

    const result = formatSession(sessionId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /sessions/group/:id/end ────────────────────────────────────────────
router.post('/:id/end', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const sessionId = String(req.params.id);

    const session = db.prepare('SELECT * FROM active_sessions WHERE id = ? AND is_group = 1').get(sessionId) as Record<string, unknown> | undefined;
    if (!session) {
      res.status(404).json({ error: 'Group session not found' });
      return;
    }

    if (session.owner_id !== req.user!.id) {
      res.status(403).json({ error: 'Only the host can end the session' });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    db.prepare("UPDATE active_sessions SET status = 'completed', updated_at = ? WHERE id = ?").run(now, sessionId);

    // Broadcast session_ended
    broadcastToSession(sessionId, {
      type: 'session_ended',
      payload: {},
    });

    res.json({ message: 'Session ended' });
  } catch (err) {
    next(err);
  }
});

// WebSocket auth helper — verifies token and returns userId
export function wsAuth(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    return payload.userId;
  } catch {
    return null;
  }
}

export default router;
