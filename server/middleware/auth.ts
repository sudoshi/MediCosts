import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Request, Response, NextFunction } from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface JwtPayload {
  id: number;
  email: string;
  role: string;
  mustChangePassword: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      validatedBody?: unknown;
      _startAt?: number;
    }
  }
}

// Use after requireAuth has already run (e.g. as an additional guard on admin routes)
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      mustChangePassword: payload.mustChangePassword,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
