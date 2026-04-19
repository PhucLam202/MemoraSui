import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import type { RequestWithCorrelationId } from './request-context';
import { redactSensitive } from './redaction';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<RequestWithCorrelationId>();
    const controllerName = context.getClass().name;
    const handlerName = context.getHandler().name;
    const safePath = redactSensitive(request.originalUrl);

    return next.handle().pipe(
      catchError((error: unknown) => {
        const duration = Date.now() - startedAt;
        const response = httpContext.getResponse<{ statusCode?: number }>();
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `ERROR ${request.method} ${safePath} ${response?.statusCode ?? 500} ${duration}ms controller=${controllerName}.${handlerName} correlationId=${request.correlationId ?? 'n/a'} message=${message}`,
        );
        return throwError(() => error);
      }),
    );
  }
}
