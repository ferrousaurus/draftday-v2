import type { Platform, Position } from './types.ts';

/** Per-platform position badge palettes, mirroring each platform's color conventions. */
export const POSITION_COLORS_BY_PLATFORM: Record<Platform, Record<Position, string>> = {
  ESPN: { QB: 'red', RB: 'blue', WR: 'green', TE: 'orange', DST: 'gray' },
  Yahoo: { QB: 'blue', RB: 'green', WR: 'red', TE: 'grape', DST: 'gray' },
  Sleeper: { QB: 'blue', RB: 'green', WR: 'orange', TE: 'grape', DST: 'gray' },
};

export function positionBadgeColor(platform: Platform, position: Position): string {
  return POSITION_COLORS_BY_PLATFORM[platform][position];
}
