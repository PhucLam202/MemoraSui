import "dotenv/config";
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiResponseInterceptor } from './common/api-response.interceptor';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { correlationIdMiddleware } from './common/correlation-id.middleware';
import { RequestLoggingInterceptor } from './common/request-logging.interceptor';
import { backendEnv } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.enableCors({
    origin: backendEnv.frontendOrigin,
    credentials: true,
  });
  app.use(correlationIdMiddleware);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor(), new ApiResponseInterceptor());
  app.setGlobalPrefix(backendEnv.apiPrefix);

  await app.listen(backendEnv.port);

  Logger.log(
    `${backendEnv.appName} listening on http://localhost:${backendEnv.port}/${backendEnv.apiPrefix}`,
    'Bootstrap',
  );
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  Logger.error(message, 'Bootstrap');
  process.exit(1);
});
