import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

function isEnvelope(value: unknown): value is { success: boolean } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'success' in (value as Record<string, unknown>) &&
      typeof (value as { success?: unknown }).success === 'boolean',
  );
}

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value) => {
        if (isEnvelope(value)) {
          return value;
        }

        return {
          success: true,
          data: value,
        };
      }),
    );
  }
}
