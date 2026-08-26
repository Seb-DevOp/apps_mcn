/**
 * The four numbers the top bar carries.
 *
 * Its own module because both sides need it: the layout is a server component
 * and the bar is a client one, and a shape exported from a "use client" file
 * cannot be built on the server.
 */
export interface Resources {
  score: number;
  gold: number;
  gems: number;
  relics: number;
}

/** Pull the four out of a full state, so no screen has to remember the shape. */
export function resourcesOf(state: {
  score: number;
  gold: number;
  shop: { gems: number };
  rebirth: { relics: number };
}): Resources {
  return {
    score: state.score,
    gold: state.gold,
    gems: state.shop.gems,
    relics: state.rebirth.relics,
  };
}
