import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // behind nginx the real visitor IP is in X-Forwarded-For; only trust it when we know a proxy sets it
  // TRUST_PROXY is the number of proxies in front (1 = Caddy alone, 2 = edge Caddy + Caddy)
  if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
  app.enableCors();
  await app.listen(process.env.PORT || 3100);
}
bootstrap();
