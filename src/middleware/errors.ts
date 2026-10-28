import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  void _next;
  if (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400
  ) {
    res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON',
      },
    });
    return;
  }
  if (error instanceof HttpError) {
    res
      .status(error.status)
      .json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    res.status(409).json({
      error: {
        code: 'DUPLICATE_TRANSACTION',
        message:
          'A transaction with this reference_id already exists for this account',
      },
    });
    return;
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  ) {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Requested resource was not found',
      },
    });
    return;
  }
  console.error(error);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}

export function validate<T>(
  result: {
    success: boolean;
    data?: T;
    error?: { issues: Array<{ path: PropertyKey[]; message: string }> };
  },
  label: string,
): T {
  if (!result.success) {
    throw new HttpError(400, `${label} validation failed`, 'VALIDATION_ERROR');
  }
  return result.data as T;
}
