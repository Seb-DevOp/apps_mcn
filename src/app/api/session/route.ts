import { z } from "zod";
import { createGuestSession, destroySession, getSessionUser } from "@/lib/auth";
import { ok, fail, rateLimit } from "@/lib/api";
import { track } from "@/lib/engine/rewards";
import { ensureMissions } from "@/lib/engine/missions";
import { grantStarterEquipment } from "@/lib/engine/loadout";

const CreateSchema = z.object({
  handle: z.string().max(40).optional().default(""),
  locale: z.enum(["en", "fr"]).optional().default("en"),
});

export async function POST(request: Request) {
  const existing = await getSessionUser();
  if (existing) return ok({ handle: existing.handle, alreadySignedIn: true });

  const forwarded = request.headers.get("x-forwarded-for") ?? "local";
  if (!rateLimit(`signup:${forwarded}`, 10, 60 * 60_000)) {
    return fail("RATE_LIMITED", 429);
  }

  const body = CreateSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return fail("INVALID_BODY", 400);

  const user = await createGuestSession(body.data.handle, body.data.locale);
  await ensureMissions(user.id, user.rankKey);
  // A new Guardian opens the Armory to a loadout, not an empty room.
  await grantStarterEquipment(user.id);
  await track("player.created", user.id, { locale: user.locale });

  return ok({ handle: user.handle });
}

export async function DELETE() {
  await destroySession();
  return ok({});
}
