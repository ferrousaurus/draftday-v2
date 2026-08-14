import { Tooltip } from '@mantine/core';

/** ADP cell for platforms BeatADP prices by consensus fallback (§5.2). */
export function ConsensusAdp({ value }: { value: number }) {
  return (
    <Tooltip label="Consensus ADP — not available for this platform" withArrow>
      <span>
        {value.toFixed(1)}
        <sup>†</sup>
      </span>
    </Tooltip>
  );
}
