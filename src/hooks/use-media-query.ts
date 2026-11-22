"use client";
import { useSyncExternalStore } from "react";

/** `serverDefault`: what the server renders, so the wide layout can be drawn first and never flicker on desktop. */
export function useMediaQuery(query: string, serverDefault = false) {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverDefault,
  );
}
