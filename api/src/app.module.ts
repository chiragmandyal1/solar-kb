import { Module } from "@nestjs/common";
import { SolarController } from "./solar.controller";

@Module({ controllers: [SolarController] })
export class AppModule {}
