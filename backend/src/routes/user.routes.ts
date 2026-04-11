import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../config/database.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /users/:id — get user profile
router.get('/:id', optionalAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const user = db.prepare(
      'SELECT id, display_name, avatar_url, role, created_at FROM users WHERE id = ?'
    ).get(id) as Record<string, unknown> | undefined;

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Get journey count
    const journeyCount = db.prepare(
      'SELECT COUNT(*) as count FROM journeys WHERE created_by = ?'
    ).get(id) as { count: number };

    // Get completion count
    const completionCount = db.prepare(
      'SELECT COUNT(*) as count FROM journey_completions WHERE user_id = ?'
    ).get(id) as { count: number };

    res.json({
      ...user,
      journey_count: journeyCount.count,
      completion_count: completionCount.count,
    });
  } catch (err) {
    next(err);
  }
});

// GET /users/:id/journeys — get journeys created by a user
router.get('/:id/journeys', optionalAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const rows = db.prepare(`
      SELECT j.*, u.display_name as creator_name,
             ff.title as forked_from_title
      FROM journeys j
      JOIN users u ON j.created_by = u.id
      LEFT JOIN journeys ff ON j.forked_from_id = ff.id
      WHERE j.created_by = ?
      ORDER BY j.created_at DESC
    `).all(id) as Record<string, unknown>[];

    // If requester is the owner, include private journeys too
    const isOwner = req.user?.id === id;

    const publicRows = rows.filter((j) => j.is_public || isOwner);
    res.json(publicRows);
  } catch (err) {
    next(err);
  }
});

// GET /users/me/history — journey history (completions)
router.get('/me/history', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();

    const completions = db.prepare(`
      SELECT c.*, j.title as journey_title, j.cover_image_url
      FROM journey_completions c
      JOIN journeys j ON c.journey_id = j.id
      WHERE c.user_id = ?
      ORDER BY c.completed_at DESC
    `).all(req.user!.id) as Record<string, unknown>[];

    res.json(completions);
  } catch (err) {
    next(err);
  }
});

export default router;
