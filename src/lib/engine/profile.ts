import { prisma } from "@/lib/db";
import {
  LEVELS_PER_FLOOR,
  levelInfo,
  weaponFor,
  type Rarity,
  type Slot,
  type WeaponKind,
} from "@/lib/content/idle";
import { combatScore, derive, parseCatSkins, parseRelics, parseUpgrades } from "./idle";

/**
 * A PLAYER, AS EVERYONE ELSE SEES THEM
 *
 * The leaderboard names people and says one number about them, which is enough
 * to rank a stranger and nothing like enough to be curious about one. This is
 * what a name opens onto: the cat itself, wearing what it was wearing, and the
 * handful of numbers that say what kind of player produced that rank.
 *
 * Deliberately narrow. It reads the idle profile, the worn pieces and a linked
 * Farcaster name — never an email, never a wallet, never anything a player did
 * not put on a public board themselves.
 */

export interface PublicCat {
  skin: string;
  worn: { slot: Slot; shape: string; rarity: Rarity; weapon: WeaponKind; floor: number }[];
}

export interface PublicProfile {
  handle: string;
  joinedAt: string;
  /** The wall the cat stands against. Empty means the plain one. */
  backdrop: string;
  /** The player's own cat, then the Pack and the Pride if they have them. */
  cats: PublicCat[];
  stats: {
    floor: number;
    distance: number;
    lives: number;
    guardians: number;
    chests: number;
    totalGold: number;
    score: number;
  };
  farcaster: { username: string | null; displayName: string | null; avatar: string | null } | null;
}

interface FarcasterMeta {
  username?: unknown;
  displayName?: unknown;
  avatar?: unknown;
}

/** Everything a stranger may see about one player, or null if there is no one. */
export async function getPublicProfile(handle: string): Promise<PublicProfile | null> {
  const user = await prisma.user.findUnique({
    where: { handle },
    select: {
      id: true,
      handle: true,
      createdAt: true,
      idle: true,
      identities: { where: { provider: "FARCASTER" }, select: { metaJson: true }, take: 1 },
    },
  });
  if (!user?.idle) return null;

  const profile = user.idle;
  const items = await prisma.idleItem.findMany({
    where: { userId: user.id, equippedSlot: { not: null } },
  });

  const stats = derive(
    items,
    parseUpgrades(profile.upgradesJson),
    parseRelics(profile.relicsJson),
    profile.rebirths,
  );

  // One list per cat, in the order they were earned. A cat wearing nothing is
  // left out rather than drawn bare: a stranger's profile is not the place to
  // advertise an empty slot.
  const coats = parseCatSkins(profile.catSkinsJson);
  const cats: PublicCat[] = [];
  for (const cat of [0, 1, 2]) {
    const worn = items
      .filter((item) => {
        const slot = item.equippedSlot ?? "";
        if (cat === 0) return !slot.includes(":");
        return slot.startsWith(cat === 1 ? "PACK:" : "PACK2:");
      })
      .map((item) => ({
        slot: item.slot as Slot,
        shape: item.shape,
        rarity: item.rarity as Rarity,
        weapon: weaponFor(item.id),
        floor: item.floor,
      }));
    if (worn.length === 0) continue;
    cats.push({ skin: (cat === 0 ? profile.skinKey : coats[cat - 1]) || profile.skinKey, worn });
  }

  // Cosmetic, and treated as such: the name and picture a Farcaster client
  // handed us at sign-in. The account behind them was proved by a signed token;
  // these two strings never were, so they decorate and identify nothing.
  let farcaster: PublicProfile["farcaster"] = null;
  const meta = user.identities[0];
  if (meta) {
    try {
      const parsed = JSON.parse(meta.metaJson) as FarcasterMeta;
      const text = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);
      const avatar = text(parsed.avatar);
      farcaster = {
        username: text(parsed.username),
        displayName: text(parsed.displayName),
        // Only ever an https image, never a data: or javascript: URL that
        // happened to arrive in a field nobody validated.
        avatar: avatar && /^https:\/\//.test(avatar) ? avatar : null,
      };
    } catch {
      farcaster = null;
    }
  }

  return {
    handle: user.handle,
    joinedAt: user.createdAt.toISOString(),
    backdrop: profile.backdropKey,
    cats,
    stats: {
      floor: levelInfo(profile.highestLevel).floor,
      distance: Math.floor(profile.totalLevels / LEVELS_PER_FLOOR),
      lives: profile.rebirths,
      guardians: profile.bossKills,
      chests: profile.chestsOpened,
      totalGold: profile.totalGold,
      score: combatScore(stats),
    },
    farcaster,
  };
}
