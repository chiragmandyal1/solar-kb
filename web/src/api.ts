const BASE = import.meta.env.VITE_API_URL ?? "/api";

export type Item = { title: string; url: string; date: string; subject: string };
export type Topics = Record<string, Record<string, Item[]>>;
export type Answer = {
  answer: string;
  refused: boolean;
  sources: { title: string; url: string; nums: number[] }[];
  focus: { body: string; subject: string | null } | null;
};

export async function getTopics(): Promise<Topics> {
  const r = await fetch(`${BASE}/topics`);
  if (!r.ok) throw new Error("Could not load topics");
  return r.json();
}

export async function ask(question: string): Promise<Answer> {
  const r = await fetch(`${BASE}/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!r.ok) throw new Error(r.status === 429 ? "Too many questions. Try again in a minute." : "The answer service is not responding.");
  return r.json();
}
