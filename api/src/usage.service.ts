import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import * as jwt from "jsonwebtoken";
import type { Request } from "express";
import { DbService } from "./db.service";

export const COOKIE = "sk_session";
export const USER_LIMIT = Number(process.env.USER_DAILY_LIMIT || 50);
export const SITE_LIMIT = Number(process.env.SITE_DAILY_LIMIT || 1000); // all visitors together, protects the Groq/Claude quota
export const ANON_LIMIT = Number(process.env.ANON_DAILY_LIMIT || 2);
// ponytail: without SESSION_SECRET a random one is made at start, so logins end on restart
const SECRET = process.env.SESSION_SECRET || randomBytes(32).toString("hex");

export type User = { sub: string; email: string; name: string | null; picture: string | null };
export type Who = { key: string; max: number; user: User | null };

export const signSession = (sub: string) => jwt.sign({ sub }, SECRET, { expiresIn: "7d" });

function sessionSub(req: Request): string | null {
  const raw = req.headers.cookie?.split(";").map((c) => c.trim()).find((c) => c.startsWith(COOKIE + "="));
  if (!raw) return null;
  try {
    return (jwt.verify(decodeURIComponent(raw.slice(COOKIE.length + 1)), SECRET) as { sub: string }).sub;
  } catch {
    return null;
  }
}

@Injectable()
export class UsageService {
  constructor(private readonly dbs: DbService) {}

  // logged in -> per Google account; otherwise per (hashed) IP address
  async who(req: Request): Promise<Who> {
    const sub = sessionSub(req);
    if (sub) {
      const db = await this.dbs.get();
      const { rows } = await db.query("SELECT sub, email, name, picture FROM users WHERE sub = $1", [sub]);
      if (rows[0]) return { key: `user:${sub}`, max: USER_LIMIT, user: rows[0] };
    }
    const ip = createHash("sha256").update(`${req.ip}|${SECRET}`).digest("hex").slice(0, 32);
    return { key: `ip:${ip}`, max: ANON_LIMIT, user: null };
  }

  async state(who: Who) {
    const db = await this.dbs.get();
    const { rows } = await db.query("SELECT n FROM ask_counts WHERE key = $1 AND day = CURRENT_DATE", [who.key]);
    const used = rows[0]?.n ?? 0;
    return { used, max: who.max, remaining: Math.max(0, who.max - used) };
  }

  // atomic: counts the question and says no once a limit is reached ("user" = this visitor's, "site" = everyone's)
  private async bump(key: string, max: number): Promise<boolean> {
    const db = await this.dbs.get();
    const { rows } = await db.query(
      `INSERT INTO ask_counts (key, day, n) VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (key, day) DO UPDATE SET n = ask_counts.n + 1 WHERE ask_counts.n < $2
       RETURNING n`,
      [key, max],
    );
    return rows.length > 0;
  }

  private async drop(key: string) {
    const db = await this.dbs.get();
    await db.query("UPDATE ask_counts SET n = GREATEST(n - 1, 0) WHERE key = $1 AND day = CURRENT_DATE", [key]);
  }

  async take(who: Who): Promise<"ok" | "user" | "site"> {
    if (!(await this.bump(who.key, who.max))) return "user";
    if (!(await this.bump("site", SITE_LIMIT))) {
      await this.drop(who.key);
      return "site";
    }
    return "ok";
  }

  async refund(who: Who) {
    await this.drop(who.key);
    await this.drop("site");
  }
}
