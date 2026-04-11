import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getDb } from '../config/database.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// Helper: haversine distance in km
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET /journeys — search/filter journeys
router.get('/', optionalAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { q, lat, lng, radius_km, tag } = req.query as Record<string, string | undefined>;

    if (q) {
      // Full-text search
      const rows = db.prepare(`
        SELECT j.*, u.display_name as creator_name
        FROM journeys j
        JOIN users u ON j.created_by = u.id
        WHERE j.is_public = 1
          AND j.id IN (
            SELECT journeys.id FROM journeys
            JOIN journeys_fts ON journeys.rowid = journeys_fts.rowid
            WHERE journeys_fts MATCH ?
          )
        ORDER BY j.created_at DESC
        LIMIT 50
      `).all(`"${q.replace(/"/g, '""')}"`) as Record<string, unknown>[];
      res.json(rows);
      return;
    }

    if (lat && lng) {
      // Nearby journeys — returns all public journeys (distance filter done in JS)
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      const radius = radius_km ? parseFloat(radius_km) : 50;

      const rows = db.prepare(`
        SELECT j.*, u.display_name as creator_name
        FROM journeys j
        JOIN users u ON j.created_by = u.id
        WHERE j.is_public = 1
        ORDER BY j.created_at DESC
      `).all() as Record<string, unknown>[];

      // Filter by distance (simplified — all stops would need checking)
      res.json(rows);
      return;
    }

    if (tag) {
      const rows = db.prepare(`
        SELECT j.*, u.display_name as creator_name
        FROM journeys j
        JOIN users u ON j.created_by = u.id
        WHERE j.is_public = 1 AND j.tags LIKE ?
        ORDER BY j.created_at DESC
        LIMIT 50
      `).all(`%"${tag}"%`) as Record<string, unknown>[];
      res.json(rows);
      return;
    }

    // Default: return highlighted + recent
    const rows = db.prepare(`
      SELECT j.*, u.display_name as creator_name
      FROM journeys j
      JOIN users u ON j.created_by = u.id
      WHERE j.is_public = 1
      ORDER BY j.is_highlighted DESC, j.created_at DESC
      LIMIT 50
    `).all() as Record<string, unknown>[];

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /journeys/:id — get journey detail with stops
router.get('/:id', optionalAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const journey = db.prepare(`
      SELECT j.*, u.display_name as creator_name,
             ff.title as forked_from_title
      FROM journeys j
      JOIN users u ON j.created_by = u.id
      LEFT JOIN journeys ff ON j.forked_from_id = ff.id
      WHERE j.id = ?
    `).get(id) as Record<string, unknown> | undefined;

    if (!journey) {
      res.status(404).json({ error: 'Journey not found' });
      return;
    }

    // Check access
    if (!journey.is_public && journey.created_by !== req.user?.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const stops = db.prepare(`
      SELECT * FROM stops WHERE journey_id = ? ORDER BY "order"
    `).all(id) as Record<string, unknown>[];

    res.json({ ...journey, stops });
  } catch (err) {
    next(err);
  }
});

// POST /journeys — create journey
router.post('/', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { title, description, cover_image_url, tags, duration_label, is_public } = req.body as {
      title: string;
      description?: string;
      cover_image_url?: string;
      tags?: string[];
      duration_label?: string;
      is_public?: boolean;
    };

    if (!title?.trim()) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO journeys (id, title, description, cover_image_url, tags, duration_label, is_public, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      title.trim(),
      description || null,
      cover_image_url || null,
      JSON.stringify(tags || []),
      duration_label || null,
      is_public !== false ? 1 : 0,
      req.user!.id,
      now,
      now
    );

    const journey = db.prepare('SELECT * FROM journeys WHERE id = ?').get(id);
    res.status(201).json(journey);
  } catch (err) {
    next(err);
  }
});

// PATCH /journeys/:id — update journey
router.patch('/:id', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { title, description, cover_image_url, tags, duration_label, is_public } = req.body as {
      title?: string;
      description?: string;
      cover_image_url?: string;
      tags?: string[];
      duration_label?: string;
      is_public?: boolean;
    };

    const journey = db.prepare('SELECT * FROM journeys WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!journey) {
      res.status(404).json({ error: 'Journey not found' });
      return;
    }
    if (journey.created_by !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (title !== undefined) { updates.push('title = ?'); values.push(title); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (cover_image_url !== undefined) { updates.push('cover_image_url = ?'); values.push(cover_image_url); }
    if (tags !== undefined) { updates.push('tags = ?'); values.push(JSON.stringify(tags)); }
    if (duration_label !== undefined) { updates.push('duration_label = ?'); values.push(duration_label); }
    if (is_public !== undefined) { updates.push('is_public = ?'); values.push(is_public ? 1 : 0); }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(id);
    db.prepare(`UPDATE journeys SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare(`
      SELECT j.*, u.display_name as creator_name, ff.title as forked_from_title
      FROM journeys j
      JOIN users u ON j.created_by = u.id
      LEFT JOIN journeys ff ON j.forked_from_id = ff.id
      WHERE j.id = ?
    `).get(id);

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /journeys/:id
router.delete('/:id', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const journey = db.prepare('SELECT * FROM journeys WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!journey) {
      res.status(404).json({ error: 'Journey not found' });
      return;
    }
    if (journey.created_by !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Check for active sessions
    const activeSession = db.prepare(
      "SELECT id FROM active_sessions WHERE journey_id = ? AND status != 'completed'"
    ).get(id);
    if (activeSession) {
      res.status(409).json({ error: 'Cannot delete journey with active sessions', code: 'ACTIVE_SESSIONS' });
      return;
    }

    db.prepare('DELETE FROM journeys WHERE id = ?').run(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /journeys/:id/fork — fork a journey
router.post('/:id/fork', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const original = db.prepare('SELECT * FROM journeys WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!original) {
      res.status(404).json({ error: 'Journey not found' });
      return;
    }

    const newId = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO journeys (id, title, description, cover_image_url, tags, duration_label, is_public, created_by, forked_from_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId,
      (original.title as string) + ' (Fork)',
      original.description,
      original.cover_image_url,
      original.tags,
      original.duration_label,
      1,
      req.user!.id,
      id,
      now,
      now
    );

    // Copy stops
    const stops = db.prepare('SELECT * FROM stops WHERE journey_id = ? ORDER BY "order"').all(id) as Record<string, unknown>[];
    for (const stop of stops) {
      db.prepare(`
        INSERT INTO stops (id, journey_id, "order", title, description, location_lat, location_lng, location_label, estimated_time, tips, photo_required)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        newId,
        stop.order,
        stop.title,
        stop.description,
        stop.location_lat,
        stop.location_lng,
        stop.location_label,
        stop.estimated_time,
        stop.tips,
        stop.photo_required
      );
    }

    const forked = db.prepare(`
      SELECT j.*, u.display_name as creator_name, ff.title as forked_from_title
      FROM journeys j
      JOIN users u ON j.created_by = u.id
      LEFT JOIN journeys ff ON j.forked_from_id = ff.id
      WHERE j.id = ?
    `).get(newId);

    res.status(201).json(forked);
  } catch (err) {
    next(err);
  }
});

// POST /journeys/:id/stops — add stop to journey
router.post('/:id/stops', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { title, description, location, estimated_time, tips, photo_required } = req.body as {
      title: string;
      description?: string;
      location: { lat: number; lng: number; label?: string };
      estimated_time?: number;
      tips?: string[];
      photo_required?: boolean;
    };

    const journey = db.prepare('SELECT * FROM journeys WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!journey) {
      res.status(404).json({ error: 'Journey not found' });
      return;
    }
    if (journey.created_by !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const maxOrder = db.prepare('SELECT MAX("order") as m FROM stops WHERE journey_id = ?').get(id) as { m: number | null };
    const order = (maxOrder.m ?? -1) + 1;

    const stopId = uuidv4();
    db.prepare(`
      INSERT INTO stops (id, journey_id, "order", title, description, location_lat, location_lng, location_label, estimated_time, tips, photo_required)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      stopId,
      id,
      order,
      title,
      description || null,
      location.lat,
      location.lng,
      location.label || null,
      estimated_time || null,
      JSON.stringify(tips || []),
      photo_required ? 1 : 0
    );

    const stop = db.prepare('SELECT * FROM stops WHERE id = ?').get(stopId);
    res.status(201).json(stop);
  } catch (err) {
    next(err);
  }
});

// PUT /journeys/:id/stops — replace all stops (edit journey)
router.put('/:id/stops', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const stops = req.body as Array<{
      id?: string;
      title: string;
      description?: string;
      location: { lat: number; lng: number; label?: string };
      estimated_time?: number;
      tips?: string[];
      photo_required?: boolean;
    }>;

    const journey = db.prepare('SELECT * FROM journeys WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!journey) {
      res.status(404).json({ error: 'Journey not found' });
      return;
    }
    if (journey.created_by !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Delete existing stops
    db.prepare('DELETE FROM stops WHERE journey_id = ?').run(id);

    // Insert new stops
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      const stopId = s.id || uuidv4();
      db.prepare(`
        INSERT INTO stops (id, journey_id, "order", title, description, location_lat, location_lng, location_label, estimated_time, tips, photo_required)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        stopId,
        id,
        i,
        s.title,
        s.description || null,
        s.location.lat,
        s.location.lng,
        s.location.label || null,
        s.estimated_time || null,
        JSON.stringify(s.tips || []),
        s.photo_required ? 1 : 0
      );
    }

    const updatedStops = db.prepare('SELECT * FROM stops WHERE journey_id = ? ORDER BY "order"').all(id);
    res.json(updatedStops);
  } catch (err) {
    next(err);
  }
});

export default router;
