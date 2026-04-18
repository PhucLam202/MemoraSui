import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { RequestWithCorrelationId } from './request-context';

export function correlationIdMiddleware(
  request: RequestWithCorrelationId,
  response: Response,
  next: NextFunction,
) {
  const headerValue = request.header('x-correlation-id');
  const correlationId = headerValue && headerValue.trim().length > 0 ? headerValue : randomUUID();

  request.correlationId = correlationId;
  response.setHeader('x-correlation-id', correlationId);

  next();
}
