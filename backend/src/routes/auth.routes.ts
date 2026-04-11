import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getDb } from '../config/database.js';
import { requireAuth, generateToken, AuthUser } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(2).max(50),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// POST /auth/register
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, username, password } = registerSchema.parse(req.body);
    const db = getDb();

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      throw new AppError(409, 'Email already registered', 'EMAIL_EXISTS');
    }

    const password_hash = await bcrypt.hash(password, 10);
    const id = uuidv4();

    db.prepare(
      'INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)'
    ).run(id, email, password_hash, username);

    const user: AuthUser = { id, email, display_name: username, role: 'user' };
    const token = generateToken(user);

    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const db = getDb();

    const row = db.prepare(
      'SELECT id, email, password_hash, display_name, role FROM users WHERE email = ?'
    ).get(email) as { id: string; email: string; password_hash: string; display_name: string; role: string } | undefined;

    if (!row) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const user: AuthUser = {
      id: row.id,
      email: row.email,
      display_name: row.display_name,
      role: row.role,
    };
    const token = generateToken(user);

    res.json({ user, token });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me
router.get('/me', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const user = db.prepare(
    'SELECT id, email, display_name, avatar_url, role, created_at FROM users WHERE id = ?'
  ).get(req.user!.id) as Record<string, unknown> | undefined;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(user);
});

// PUT /auth/me
router.put('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { display_name, avatar_url } = req.body as { display_name?: string; avatar_url?: string };

    const updates: string[] = [];
    const values: unknown[] = [];

    if (display_name !== undefined) {
      updates.push('display_name = ?');
      values.push(display_name);
    }
    if (avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      values.push(avatar_url);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(req.user!.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const user = db.prepare(
      'SELECT id, email, display_name, avatar_url, role FROM users WHERE id = ?'
    ).get(req.user!.id);

    res.json(user);
  } catch (err) {
    next(err);
  }
});

export default router;
