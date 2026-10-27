import { Injectable, OnModuleInit } from "@nestjs/common";
import { connect } from "./solar-lib";

@Injectable()
export class DbService implements OnModuleInit {
  private db?: Promise<any>;

  get(): Promise<any> {
    return (this.db ??= connect());
  }

  async onModuleInit() {
    const db = await this.get();
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        sub        text PRIMARY KEY,   -- Google account id
        email      text NOT NULL,
        name       text,
        picture    text,
        created_at timestamptz DEFAULT now()
      );
      -- questions asked per day; key is 'user:<sub>' or 'ip:<hash>'
      CREATE TABLE IF NOT EXISTS ask_counts (
        key text NOT NULL,
        day date NOT NULL DEFAULT CURRENT_DATE,
        n   int  NOT NULL DEFAULT 0,
        PRIMARY KEY (key, day)
      );
    `);
  }
}
