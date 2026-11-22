"use client";
import { useEffect, useState } from "react";

/** The current time, read only after the page has loaded (so server and browser render the same) and each minute after. */
export function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
