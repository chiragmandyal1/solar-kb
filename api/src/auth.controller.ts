import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";
import type { Request, Response } from "express";
import { DbService } from "./db.service";
import { COOKIE, USER_LIMIT, UsageService, signSession } from "./usage.service";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const google = new OAuth2Client(CLIENT_ID);

@Controller()
export class AuthController {
  constructor(private readonly dbs: DbService, private readonly usage: UsageService) {}

  private async me(req: Request) {
    const who = await this.usage.who(req);
    const { sub: _sub, ...user } = who.user ?? ({} as any);
    return { user: who.user ? user : null, limit: await this.usage.state(who) };
  }

  @Get("me")
  getMe(@Req() req: Request) {
    return this.me(req);
  }

  // the page sends the Google sign-in credential; we verify it, store the account and start a session
  @Post("auth/google")
  async login(@Body() { credential }: { credential?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!CLIENT_ID || !credential) throw new UnauthorizedException("Google sign-in is not configured");
    let p;
    try {
      p = (await google.verifyIdToken({ idToken: credential, audience: CLIENT_ID })).getPayload();
    } catch {
      throw new UnauthorizedException("Invalid Google sign-in");
    }
    if (!p?.sub || !p.email || !p.email_verified) throw new UnauthorizedException("Google account has no verified email");
    const db = await this.dbs.get();
    await db.query(
      `INSERT INTO users (sub, email, name, picture) VALUES ($1, $2, $3, $4)
       ON CONFLICT (sub) DO UPDATE SET email = $2, name = $3, picture = $4`,
      [p.sub, p.email, p.name ?? null, p.picture ?? null],
    );
    res.cookie(COOKIE, signSession(p.sub), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 3600 * 1000,
    });
    // the cookie isn't on this request yet, so answer for the new account directly
    return { user: { email: p.email, name: p.name ?? null, picture: p.picture ?? null }, limit: await this.usage.state({ key: `user:${p.sub}`, max: USER_LIMIT, user: null }) };
  }

  @Post("auth/logout")
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE);
    return { ok: true };
  }
}
