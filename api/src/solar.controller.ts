import { BadRequestException, Body, Controller, Get, Post } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The pipeline is plain ESM in ../lib; Node 24 can require() it directly.
/* eslint-disable @typescript-eslint/no-require-imports */
const lib = join(__dirname, "../../lib");
const { connect } = require(join(lib, "db.mjs"));
const { answerQuestion } = require(join(lib, "answer.mjs"));

type Entry = { body: string; subject: string; type: string; title: string; url: string; date: string };

@Controller()
export class SolarController {
  private db?: Promise<any>;
  private topics?: Record<string, Record<string, { title: string; url: string; date: string; subject: string }[]>>;

  private getDb() {
    return (this.db ??= connect());
  }

  @Post("ask")
  async ask(@Body() { question }: { question?: string }) {
    const q = question?.trim();
    if (!q || q.length > 500) throw new BadRequestException("question must be 1-500 characters");
    const { answer, refused, sources, focus } = await answerQuestion(await this.getDb(), q);
    return { answer, refused, sources, focus };
  }

  // body -> type -> items, built from data/manifest.json
  @Get("topics")
  getTopics() {
    if (!this.topics) {
      const { files } = JSON.parse(readFileSync(join(lib, "../data/manifest.json"), "utf8")) as { files: Entry[] };
      this.topics = {};
      for (const f of files) {
        ((this.topics[f.body] ??= {})[f.type] ??= []).push({ title: f.title, url: f.url, date: f.date, subject: f.subject });
      }
      for (const types of Object.values(this.topics)) types.news?.sort((a, b) => b.date.localeCompare(a.date));
    }
    return this.topics;
  }
}
