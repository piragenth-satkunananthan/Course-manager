// The week grid's geometry (design-system §6.8): 07:00 to 20:00, 48 px per hour. Pure, so it's unit-tested.
export const FIRST_HOUR = 7;
export const LAST_HOUR = 20;
export const HOUR_PX = 48;
export const GRID_HEIGHT = (LAST_HOUR - FIRST_HOUR) * HOUR_PX;
const MIN_PX = 40; // every block is a 40 px tap target (design-system §11); short classes show their times on the block

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toPx = (m: number) => ((m - FIRST_HOUR * 60) * HOUR_PX) / 60;

export type Block<T> = { item: T; top: number; height: number; lane: number; lanes: number; cutStart: boolean; cutEnd: boolean };

/** One day's classes as blocks: clipped to the grid (and marked), overlapping boxes side by side in lanes. */
export function layoutDay<T extends { startTime: string; endTime: string }>(items: T[]): Block<T>[] {
  // Boxes first, as drawn (clipped, at least MIN_PX): lanes come from what is drawn, so no two boxes cover each other.
  const boxes = items
    .map((item) => {
      const start = toPx(minutes(item.startTime));
      const end = toPx(minutes(item.endTime));
      const top = Math.min(Math.max(start, 0), GRID_HEIGHT - MIN_PX);
      const bottom = Math.min(Math.max(end, top + MIN_PX), GRID_HEIGHT);
      return { item, top, height: Math.max(bottom - top, MIN_PX), cutStart: start < 0, cutEnd: end > GRID_HEIGHT };
    })
    .sort((a, b) => a.top - b.top || b.height - a.height);

  const blocks: Block<T>[] = [];
  let group: Block<T>[] = [];
  let laneEnds: number[] = []; // per lane, where its last box ends
  let groupEnd = -1;
  const close = () => {
    for (const b of group) b.lanes = laneEnds.length;
    group = [];
    laneEnds = [];
  };
  for (const box of boxes) {
    const bottom = box.top + box.height;
    if (box.top >= groupEnd) close(); // touches nothing in the current group: a new one starts
    let lane = laneEnds.findIndex((e) => e <= box.top);
    if (lane === -1) lane = laneEnds.push(bottom) - 1;
    else laneEnds[lane] = bottom;
    groupEnd = Math.max(groupEnd, bottom);
    const block = { ...box, lane, lanes: 1 };
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
