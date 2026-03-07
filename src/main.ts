import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ValidationPipe, Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  // Centralized Error Handling
  app.useGlobalFilters(new AllExceptionsFilter());

  // Input Validation Pipe Configuration
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true
  }));

  // Allow all origins in development — socket.io polling transport
  // makes HTTP requests that must pass CORS before upgrading to WebSocket
  app.enableCors({
    origin: true,           // reflects the request origin (dev-safe)
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 Backend running on http://localhost:${port}`);
  logger.log(`💬 Chat WebSocket active securely.`);
}
bootstrap();
