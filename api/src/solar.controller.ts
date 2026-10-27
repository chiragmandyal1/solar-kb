import { BadRequestException, Body, Controller, Get, HttpException, Post, Req } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Request } from "express";
import { DbService } from "./db.service";
import { answerQuestion, libDir } from "./solar-lib";
import { UsageService } from "./usage.service";

type Entry = { body: string; subject: string; type: string; title: string; url: string; date: string };

@Controller()
export class SolarController {
  private topics?: Record<string, Record<string, { title: string; url: string; date: string; subject: string }[]>>;

  constructor(private readonly dbs: DbService, private readonly usage: UsageService) {}

  @Post("ask")
  async ask(@Req() req: Request, @Body() { question }: { question?: string }) {
    const q = question?.trim();
    if (!q || q.length > 500) throw new BadRequestException("question must be 1-500 characters");

    const who = await this.usage.who(req);
    const taken = await this.usage.take(who);
    if (taken !== "ok") {
      throw new HttpException({ message: "limit", code: taken === "site" ? "SITE" : "LIMIT", loggedIn: !!who.user, max: who.max }, 403);
    }
    try {
      const { answer, refused, sources, focus } = await answerQuestion(await this.dbs.get(), q, { waitOnLimit: false, fallback: true });
      return { answer, refused, sources, focus, limit: await this.usage.state(who) };
    } catch (e: any) {
      await this.usage.refund(who); // a failed answer doesn't use up a question
      // model rate limit: tell the page how long to wait instead of holding the request
      if (e?.status === 429) throw new HttpException({ message: "busy", retryAfter: e.retryAfter }, 429);
      throw e;
    }
  }

  // body -> type -> items, built from data/manifest.json
  @Get("topics")
  getTopics() {
    if (!this.topics) {
      const { files } = JSON.parse(readFileSync(join(libDir, "../data/manifest.json"), "utf8")) as { files: Entry[] };
      this.topics = {};
      for (const f of files) {
        ((this.topics[f.body] ??= {})[f.type] ??= []).push({ title: f.title, url: f.url, date: f.date, subject: f.subject });
      }
      for (const types of Object.values(this.topics)) types.news?.sort((a, b) => b.date.localeCompare(a.date));
    }
    return this.topics;
  }
}
