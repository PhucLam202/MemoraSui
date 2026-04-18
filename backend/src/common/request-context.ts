import type { Request } from 'express';

export interface RequestWithCorrelationId extends Request {
  correlationId?: string;
}
