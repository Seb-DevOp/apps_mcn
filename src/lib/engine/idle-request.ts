import { cache } from "react";
import { getIdleState } from "./idle";

/**
 * The idle state, once per request.
 *
 * Reading it *is* the tick, and the layout now reads it as well as the page —
 * so without this a single navigation would settle the same elapsed time twice.
 * It costs nothing in rewards (the second pass finds no seconds left to spend)
 * and two round trips to Frankfurt, which is the part worth not paying.
 *
 * Route handlers call `getIdleState` directly: they are one read by definition.
 */
export const idleStateForRequest = cache(getIdleState);
