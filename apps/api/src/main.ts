import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableCors({
    origin: process.env.WEB_URL || true,
    credentials: true,
  });
  app.getHttpAdapter().get('/health', (_req: any, res: any) => res.json({ status: 'ok' }));
  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`API running at http://localhost:${port}`);
}
bootstrap();
