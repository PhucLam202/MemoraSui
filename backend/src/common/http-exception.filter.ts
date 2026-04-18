import {
  ArgumentsHost,
  Catch,
  Logger,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { redactSensitive } from './redaction';
import type { RequestWithCorrelationId } from './request-context';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithCorrelationId>();
    const response = context.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = isHttpException
      ? exception.message
      : 'Internal server error';

    this.logger.error(
      `FAIL ${request.method} ${redactSensitive(request.originalUrl)} ${statusCode} correlationId=${request.correlationId ?? 'n/a'} message=${message}`,
      isHttpException && exception instanceof Error ? exception.stack : undefined,
    );

    response.status(statusCode).json({
      success: false,
      error: {
        message,
        correlationId: request.correlationId ?? null,
        path: request.originalUrl,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
