import { Tooltip } from '@mantine/core';

export type ConsensusAdpProps = {
  value: number;
};

/** ADP cell for platforms BeatADP prices by consensus fallback (§5.2). */
export function ConsensusAdp({ value }: Readonly<ConsensusAdpProps>) {
  return (
    <Tooltip label="Consensus ADP — not available for this platform" withArrow>
      <span>
        {value.toFixed(1)}
        <sup>†</sup>
      </span>
    </Tooltip>
  );
}
