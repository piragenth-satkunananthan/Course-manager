// The Daily Digest (design file 26). "Check these" joins with #14.
import { addDays, instantToLocal } from "./time";

/** 07:00–08:59 Asia/Colombo. */
export const isDigestWindow = (now: Date) => {
  const { time } = instantToLocal(now);
  return time >= "07:00" && time < "09:00";
};

/** Due soon is today, tomorrow and the day after; Added or moved is what changed since the last digest. Null when there's nothing to say. */
export function selectDigest<T extends { id: string; localDate: string | null }>(open: T[], changedIds: ReadonlySet<string>, today: string) {
  const last = addDays(today, 2);
  const dueSoon = open.filter((d) => d.localDate !== null && d.localDate >= today && d.localDate <= last);
  const addedOrMoved = open.filter((d) => changedIds.has(d.id));
  return dueSoon.length || addedOrMoved.length ? { dueSoon, addedOrMoved } : null;
}
