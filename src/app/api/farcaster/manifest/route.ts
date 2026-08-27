import { NextResponse } from "next/server";

/**
 * The Mini App manifest, served at /.well-known/farcaster.json by a rewrite.
 *
 * A route rather than a static file for one reason: `accountAssociation` is a
 * signature produced by the owner's Farcaster account, and it belongs in
 * environment variables rather than in the repository — so it can be pasted in
 * (or rotated) without a code change.
 *
 * Without that signature the manifest is still valid JSON and the app still
 * runs; it simply cannot be published, because nothing proves who owns the
 * domain. The response says which of the two states it is in via the header.
 */
export const dynamic = "force-dynamic";

const ORIGIN = process.env.APP_ORIGIN ?? "https://apps-mcn.vercel.app";

export async function GET() {
  const header = process.env.FARCASTER_HEADER;
  const payload = process.env.FARCASTER_PAYLOAD;
  const signature = process.env.FARCASTER_SIGNATURE;
  const signed = Boolean(header && payload && signature);

  /**
   * Every string here is a store listing, and the store has limits: 32 for the
   * name, 30 for the subtitle and the tagline, 170 for the description, 100 for
   * the OG line, five lowercase tags. Overrunning them does not fail loudly — it
   * truncates in someone else's client, which is worse.
   *
   * The entrance is the home, not the arena. A player arriving from Farcaster is
   * signed in by the gate at "/" and pushed to the descent; pointing straight at
   * the descent would send them through a redirect back to the gate and forward
   * again, to arrive in the same place one round trip later.
   */
  const manifest: Record<string, unknown> = {
    miniapp: {
      version: "1",
      name: "MCN Idle",
      iconUrl: `${ORIGIN}/icons/icon-1024.png`,
      homeUrl: ORIGIN,
      splashImageUrl: `${ORIGIN}/icons/splash-200.png`,
      splashBackgroundColor: "#05080F",
      subtitle: "Your cat descends alone",
      description:
        "A Maine Coon fights its way down the Vault while you are away. Six slots to fill, eight rarities to find, and a Vault with no bottom.",
      primaryCategory: "games",
      tags: ["idle", "rpg", "cat", "mcn", "base"],
      tagline: "It fights while you sleep",
      ogTitle: "MCN Idle",
      ogDescription:
        "A Maine Coon descends the Vault while you are away. Six slots, eight rarities, no bottom.",
      ogImageUrl: `${ORIGIN}/share/embed.png`,
      heroImageUrl: `${ORIGIN}/share/embed.png`,
      noindex: process.env.NODE_ENV !== "production",
    },
  };

  if (signed) {
    manifest.accountAssociation = { header, payload, signature };
  }

  return NextResponse.json(manifest, {
    headers: {
      "x-mcn-manifest-signed": String(signed),
      "cache-control": "public, max-age=300",
    },
  });
}
