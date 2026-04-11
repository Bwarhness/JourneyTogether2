import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

const VALID_EMOJIS = ['❤️', '🔥', '🌟', '😍', '🚀'];

// POST /journeys/:journeyId/reactions — add/toggle reaction
router.post('/:journeyId/reactions', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { journeyId } = req.params;
    const { emoji } = req.body as { emoji: string };

    if (!VALID_EMOJIS.includes(emoji)) {
      res.status(400).json({ error: 'Invalid emoji' });
      return;
    }

    const journey = db.prepare('SELECT * FROM journeys WHERE id = ?').get(journeyId) as Record<string, unknown> | undefined;
    if (!journey) {
      res.status(404).json({ error: 'Journey not found' });
      return;
    }

    const existing = db.prepare(
      'SELECT * FROM journey_reactions WHERE journey_id = ? AND user_id = ? AND emoji = ?'
    ).get(journeyId, req.user!.id, emoji) as Record<string, unknown> | undefined;

    if (existing) {
      // Remove reaction (toggle off)
      db.prepare('DELETE FROM journey_reactions WHERE journey_id = ? AND user_id = ? AND emoji = ?').run(
        journeyId, req.user!.id, emoji
      );
    } else {
      // Add reaction
      db.prepare(
        'INSERT OR REPLACE INTO journey_reactions (journey_id, user_id, emoji) VALUES (?, ?, ?)'
      ).run(journeyId, req.user!.id, emoji);
    }

    // Return updated reactions
    const reactions = db.prepare(`
      SELECT emoji, COUNT(*) as count,
             GROUP_CONCAT(user_id) as user_ids
      FROM journey_reactions
      WHERE journey_id = ?
      GROUP BY emoji
    `).all(journeyId) as Record<string, unknown>[];

    const formatted = reactions.map(r => ({
      emoji: r.emoji,
      count: r.count,
      user_ids: (r.user_ids as string || '').split(',').filter(Boolean),
    }));

    res.json({ reactions: formatted });
  } catch (err) {
    next(err);
  }
});

// GET /journeys/:journeyId/reactions
router.get('/:journeyId/reactions', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { journeyId } = req.params;

    const reactions = db.prepare(`
      SELECT emoji, COUNT(*) as count,
             GROUP_CONCAT(user_id) as user_ids
      FROM journey_reactions
      WHERE journey_id = ?
      GROUP BY emoji
    `).all(journeyId) as Record<string, unknown>[];

    const formatted = reactions.map(r => ({
      emoji: r.emoji,
      count: r.count,
      user_ids: (r.user_ids as string || '').split(',').filter(Boolean),
    }));

    res.json({ reactions: formatted });
  } catch (err) {
    next(err);
  }
});

export default router;
