// The week grid's geometry (design-system §6.8): 07:00 to 20:00, 48 px per hour. Pure, so it's unit-tested.
export const FIRST_HOUR = 7;
export const LAST_HOUR = 20;
export const HOUR_PX = 48;
export const GRID_HEIGHT = (LAST_HOUR - FIRST_HOUR) * HOUR_PX;
const MIN_PX = HOUR_PX / 2; // a short or clipped class stays readable

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toPx = (m: number) => ((m - FIRST_HOUR * 60) * HOUR_PX) / 60;

export type Block<T> = { item: T; top: number; height: number; lane: number; lanes: number; cutStart: boolean; cutEnd: boolean };

/** One day's classes as blocks: clipped to the grid (and marked), overlapping ones side by side in lanes. */
export function layoutDay<T extends { startTime: string; endTime: string }>(items: T[]): Block<T>[] {
  const sorted = [...items].sort((a, b) => a.startTime.localeCompare(b.startTime) || b.endTime.localeCompare(a.endTime));
  const blocks: Block<T>[] = [];
  let group: Block<T>[] = [];
  let laneEnds: number[] = []; // per lane, when its last class ends
  let groupEnd = -1;
  const close = () => {
    for (const b of group) b.lanes = laneEnds.length;
    group = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    const start = minutes(item.startTime);
    const end = minutes(item.endTime);
    if (start >= groupEnd) close(); // no overlap with the current group: a new one starts
    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane === -1) lane = laneEnds.push(end) - 1;
    else laneEnds[lane] = end;
    groupEnd = Math.max(groupEnd, end);

    const top = Math.min(Math.max(toPx(start), 0), GRID_HEIGHT - MIN_PX);
    const bottom = Math.min(Math.max(toPx(end), 0), GRID_HEIGHT);
    const block = { item, top, height: Math.max(bottom - top, MIN_PX), lane, lanes: 1, cutStart: toPx(start) < 0, cutEnd: toPx(end) > GRID_HEIGHT };
    blocks.push(block);
    group.push(block);
  }
  close();
  return blocks;
}

/** Where the current-time line goes, or null outside 07:00–20:00. */
export function nowOffset(hhmm: string) {
  const px = toPx(minutes(hhmm));
  return px < 0 || px > GRID_HEIGHT ? null : px;
}
