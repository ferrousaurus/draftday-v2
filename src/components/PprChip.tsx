import { PPR_PRESETS, pprPreset, receptionsFromPpr } from '../lib/settings.ts';
import { SegmentedControl, Stack } from '@mantine/core';
import { NumberStepper } from './NumberStepper.tsx';

type PprChipProps = {
  receptions: { rb: number; wr: number; te: number };
  onChange: (receptions: { rb: number; wr: number; te: number }) => void;
  disabled?: boolean;
};

/**
 * The PPR chip (§3.2): a segmented control over 0 / 0.5 / 1 / Custom. Selecting
 * a preset writes all three RECEPTIONS fields at once; Custom reveals a
 * per-position RECEPTIONS stepper. The chip's display value is derived during
 * render from the canonical RECEPTIONS triple (no stored derived state).
 */
export function PprChip({ receptions, onChange, disabled = false }: PprChipProps) {
  const preset = pprPreset(receptions);
  const custom = preset === 'custom';
  return (
    <Stack gap="xs">
      <div>
        <div>PPR</div>
        <SegmentedControl
          size="xs"
          value={String(preset)}
          data={[
            ...PPR_PRESETS.map((p) => ({ value: String(p), label: String(p) })),
            { value: 'custom', label: 'Custom' },
          ]}
          onChange={(v) => {
            if (v !== 'custom') {
              const p = PPR_PRESETS.find((x) => String(x) === v);
              if (p !== undefined) {
                onChange(receptionsFromPpr(p));
              }
            }
          }}
          disabled={disabled}
        />
      </div>
      {custom ? (
        <Stack gap={0}>
          {(['rb', 'wr', 'te'] as const).map((pos) => (
            <NumberStepper
              key={pos}
              label={`RECEPTIONS ${pos.toUpperCase()}`}
              value={receptions[pos]}
              min={0}
              max={2}
              step={0.5}
              disabled={disabled}
              onChange={(v: number) => onChange({ ...receptions, [pos]: v })}
            />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
