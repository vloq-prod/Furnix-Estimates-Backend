import type { Response } from 'express';

/**
 * Every endpoint answers with the same envelope, so the web client has exactly
 * one shape to unwrap and exactly one place to read errors from.
 */
export interface ApiMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  message: string;
  meta?: ApiMeta;
  error?: { code: string; details?: unknown };
  timestamp: string;
}

export function ok<T>(res: Response, data: T, message = 'OK', meta?: ApiMeta): Response {
  const body: ApiEnvelope<T> = {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
  };
  if (meta) body.meta = meta;
  return res.status(200).json(body);
}

export function created<T>(res: Response, data: T, message = 'Created'): Response {
  return res.status(201).json({
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
  } satisfies ApiEnvelope<T>);
}

export function noContent(res: Response, message = 'Done'): Response {
  return res.status(200).json({
    success: true,
    data: null,
    message,
    timestamp: new Date().toISOString(),
  } satisfies ApiEnvelope<null>);
}

export function buildMeta(page: number, pageSize: number, total: number): ApiMeta {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}
