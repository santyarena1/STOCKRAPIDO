import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * CORS: `WEB_URL` y/o `CORS_ORIGINS` pueden listar varios orígenes separados por coma
 * (ej. Vercel producción + preview + localhost con distintos puertos). Sin ninguno →
 * `true` (refleja el Origin del request), útil en dev; en producción conviene listar URLs explícitas.
 */
function corsOriginOption(): boolean | string | string[] {
  const raw = [process.env.CORS_ORIGINS, process.env.WEB_URL].filter(Boolean).join(',');
  const origins = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
  if (origins.length === 0) return true;
  if (origins.length === 1) return origins[0];
  return origins;
}

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
    origin: corsOriginOption(),
    credentials: true,
  });
  app.getHttpAdapter().get('/health', (_req: any, res: any) =>
    res.json({
      status: 'ok',
      v: 3,
      sha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || 'dev',
    }),
  );
  const port = process.env.PORT || 4002;
  await app.listen(port);
  console.log(`API running at http://localhost:${port}`);
}
bootstrap();
