import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // behind nginx the real visitor IP is in X-Forwarded-For; only trust it when we know a proxy sets it
  if (process.env.TRUST_PROXY) app.set("trust proxy", 1);
  app.enableCors();
  await app.listen(process.env.PORT || 3100);
}
bootstrap();
