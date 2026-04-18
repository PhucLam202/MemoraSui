import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import type { RequestWithCorrelationId } from './request-context';
import { redactSensitive } from './redaction';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<RequestWithCorrelationId>();
    const response = httpContext.getResponse<{ statusCode: number }>();
    const controllerName = context.getClass().name;
    const handlerName = context.getHandler().name;
    const safePath = redactSensitive(request.originalUrl);
    const safeBody = redactSensitive(this.stringifySafe(request.body));
    const safeQuery = redactSensitive(this.stringifySafe(request.query));

    this.logger.log(
      `START ${request.method} ${safePath} controller=${controllerName}.${handlerName} correlationId=${request.correlationId ?? 'n/a'} query=${safeQuery} body=${safeBody}`,
    );

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startedAt;
        this.logger.log(
          `END ${request.method} ${safePath} ${response.statusCode} ${duration}ms controller=${controllerName}.${handlerName} correlationId=${request.correlationId ?? 'n/a'}`,
        );
      }),
      catchError((error: unknown) => {
        const duration = Date.now() - startedAt;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `ERROR ${request.method} ${safePath} ${response.statusCode ?? 500} ${duration}ms controller=${controllerName}.${handlerName} correlationId=${request.correlationId ?? 'n/a'} message=${message}`,
        );
        return throwError(() => error);
      }),
    );
  }

  private stringifySafe(value: unknown) {
    if (value === undefined || value === null) {
      return '';
    }

    try {
      return JSON.stringify(value);
    } catch {
      return '[unserializable]';
    }
  }
}
