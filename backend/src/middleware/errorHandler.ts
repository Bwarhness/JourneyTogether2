import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[Error]', err.message);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    res.status(400).json({
      error: 'Validation failed',
      details: (err as unknown as { errors: unknown[] }).errors,
    });
    return;
  }

  // Multer errors
  if (err.message?.includes('Invalid file type') || err.message?.includes('File too large')) {
    res.status(400).json({ error: err.message });
    return;
  }

  // Default server error
  res.status(500).json({
    error: 'Internal server error',
  });
}
