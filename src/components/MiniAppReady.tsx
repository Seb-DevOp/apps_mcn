"use client";

import { useEffect } from "react";

/**
 * Tells the Farcaster host that the Vault has finished painting.
 *
 * Until `ready()` is called the client keeps its splash screen up, so forgetting
 * it means every player stares at a loading screen forever. It runs on every
 * page and does nothing at all outside a Farcaster client.
 *
 * The SDK is imported dynamically so that a normal browser never downloads it.
 */
export function MiniAppReady() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        if (cancelled) return;
        if (!(await sdk.isInMiniApp())) return;
        await sdk.actions.ready();
      } catch {
        // Outside a Farcaster client this is expected to do nothing.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
