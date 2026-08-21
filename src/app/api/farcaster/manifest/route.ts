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

  const manifest: Record<string, unknown> = {
    miniapp: {
      version: "1",
      name: "MCN — The Vault",
      iconUrl: `${ORIGIN}/icons/icon-1024.png`,
      homeUrl: `${ORIGIN}/vault`,
      splashImageUrl: `${ORIGIN}/icons/splash-200.png`,
      splashBackgroundColor: "#05080F",
      subtitle: "Six ranks. One chest a day.",
      description:
        "Return each day, open a chest that improves with your rank, and climb the six ranks of the Guardians. Oria is watching.",
      primaryCategory: "games",
      tags: ["game", "daily", "collection", "mcn", "base"],
      tagline: "The Vault is filling.",
      ogTitle: "MCN — The Vault",
      ogDescription: "Six ranks. One chest a day. Oria is watching.",
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
