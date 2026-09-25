import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Bekuin POS API')
    .setDescription('Order, approval, self-order QR meja, stok, HPP, dan laporan keuangan')
    .setVersion('0.2.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = app.get(ConfigService<Env, true>).get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API jalan di http://localhost:${port}/api/v1 — Swagger: /api/docs`, 'Bootstrap');
}

void bootstrap();
