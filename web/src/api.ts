const BASE = import.meta.env.VITE_API_URL ?? "/api";

export type Item = { title: string; url: string; date: string; subject: string };
export type Topics = Record<string, Record<string, Item[]>>;
export type Me = {
  user: { email: string; name: string | null; picture: string | null } | null;
  limit: { used: number; max: number; remaining: number };
};
export type Answer = {
  answer: string;
  refused: boolean;
  sources: { title: string; url: string; nums: number[] }[];
  focus: { body: string; subject: string | null } | null;
  limit: Me["limit"];
};

export async function getTopics(): Promise<Topics> {
  const r = await fetch(`${BASE}/topics`);
  if (!r.ok) throw new Error("Could not load topics");
  return r.json();
}

export class LimitReached extends Error {
  constructor(public loggedIn: boolean, public max: number, public site = false) { super("limit"); }
}

export class Busy extends Error {
  constructor(public retryAfter: number) { super("busy"); }
}

export async function ask(question: string): Promise<Answer> {
  const r = await fetch(`${BASE}/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (r.status === 403) {
    const j = await r.json().catch(() => ({}));
    throw new LimitReached(!!j.loggedIn, j.max ?? 0, j.code === "SITE");
  }
  if (r.status === 429) throw new Busy((await r.json().catch(() => ({}))).retryAfter ?? 10);
  if (!r.ok) throw new Error("The answer service is not responding.");
  return r.json();
}

export async function getMe(): Promise<Me> {
  const r = await fetch(`${BASE}/me`);
  if (!r.ok) throw new Error("Could not load profile");
  return r.json();
}

export async function signIn(credential: string): Promise<Me> {
  const r = await fetch(`${BASE}/auth/google`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  if (!r.ok) throw new Error("Google sign-in failed");
  return r.json();
}

export async function signOut(): Promise<void> {
  await fetch(`${BASE}/auth/logout`, { method: "POST" });
}
