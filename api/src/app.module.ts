import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { DbService } from "./db.service";
import { SolarController } from "./solar.controller";
import { UsageService } from "./usage.service";

@Module({ controllers: [SolarController, AuthController], providers: [DbService, UsageService] })
export class AppModule {}
