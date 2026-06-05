import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';
import { AppModule } from './app.module';

// Handler serverless para Vercel.
// La app Nest se construye UNA sola vez y queda cacheada en la instancia
// (warm) para que las siguientes invocaciones no la reboteen.
const server = express();
let ready: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    // Vercel ya captura los logs; dejamos los niveles utiles
    logger: ['error', 'warn', 'log'],
  });
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
  server.get('/health', (_req, res) => res.json({ status: 'ok' }));
  await app.init();
}

export default async function handler(req: express.Request, res: express.Response) {
  if (!ready) ready = bootstrap();
  await ready;
  server(req, res);
}
