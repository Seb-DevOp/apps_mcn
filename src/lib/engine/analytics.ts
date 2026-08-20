import { prisma } from "@/lib/db";

/**
 * Fire-and-forget analytics.
 *
 * Lives on its own so that both the reward engine and the loadout engine can
 * record events without importing each other.
 */
export async function track(
  name: string,
  userId: string | null,
  props: Record<string, unknown> = {},
) {
  try {
    await prisma.analyticsEvent.create({
      data: { userId, name, propsJson: JSON.stringify(props) },
    });
  } catch {
    // Analytics must never break a player's session.
  }
}
