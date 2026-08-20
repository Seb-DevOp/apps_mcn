import { ok, fail, withUser, rateLimit } from "@/lib/api";
import { startRun } from "@/lib/engine/game";

export async function POST() {
  return withUser(async (user) => {
    if (!rateLimit(`run:${user.id}`, 20, 5 * 60_000)) {
      return fail("RATE_LIMITED", 429, { retryAfterSeconds: 300 });
    }

    const result = await startRun(user.id);
    if (!result.ok) {
      return fail(result.error ?? "FAILED", 429, {
        retryAfterSeconds: result.retryAfterSeconds ?? 600,
      });
    }
    // The seed is public by necessity — the client has to render the pattern.
    // It is useless on its own: the server re-derives and re-scores the same run.
    // The modifiers are sent so the run *looks* like it plays; the server reads
    // the worn equipment again at submission and never trusts these values back.
    return ok({
      sessionId: result.sessionId,
      seed: result.seed,
      targets: result.targets,
      modifiers: result.modifiers,
      ability: result.ability ?? null,
    });
  });
}
