import { randomUUID } from "node:crypto";

type Scope = { userId: string; timeframe: string; timeId: string };
type Ticket = { scope: string; expiresAt: number };

const scopeKey = ({ userId, timeframe, timeId }: Scope) =>
  JSON.stringify([userId, timeframe, timeId]);

/**
 * A read-only visit can never acquire one of these capabilities. The browser
 * must explicitly request an intent before the start route accepts an AI job.
 * Old browser bundles calling /start automatically cannot pass this gate.
 *
 * Both steps are short-lived and scope-bound. An in-flight generation can take
 * much longer than the initial user action, so its save capability lasts longer.
 */
export function createManualWrappedIntentGate(now = () => Date.now()) {
  const intents = new Map<string, Ticket>();
  const generations = new Map<string, Ticket>();
  const prune = () => {
    const at = now();
    for (const [id, t] of intents) if (t.expiresAt < at) intents.delete(id);
    for (const [id, t] of generations) if (t.expiresAt < at) generations.delete(id);
  };
  return {
    issue(scope: Scope): string {
      prune();
      const intentId = randomUUID();
      intents.set(intentId, { scope: scopeKey(scope), expiresAt: now() + 120_000 });
      return intentId;
    },
    begin(scope: Scope, intentId: unknown): string | null {
      prune();
      if (typeof intentId !== "string") return null;
      const pending = intents.get(intentId);
      if (!pending || pending.scope !== scopeKey(scope)) return null;
      intents.delete(intentId); // one use only, including when retries race
      const requestId = randomUUID();
      generations.set(requestId, { scope: scopeKey(scope), expiresAt: now() + 3_600_000 });
      return requestId;
    },
    canSave(scope: Scope, requestId: unknown): boolean {
      prune();
      return typeof requestId === "string" &&
        generations.get(requestId)?.scope === scopeKey(scope);
    },
    complete(requestId: string): void {
      generations.delete(requestId);
    },
  };
}
