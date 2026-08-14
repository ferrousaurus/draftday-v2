import { NumberInput, Stack } from '@mantine/core';

export type NumberStepperProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
};

/** Free numeric stepper; validation-only bounds (never UI-blocking, §3.2). */
export function NumberStepper({
  label,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  onChange,
}: Readonly<NumberStepperProps>) {
  return (
    <Stack gap={0}>
      <div>{label}</div>
      <NumberInput
        size="xs"
        value={value}
        min={min}
        max={max}
        step={step}
        allowDecimal={step % 1 !== 0}
        disabled={disabled}
        clampBehavior="blur"
        onChange={(v) => {
          if (typeof v === 'number' && Number.isFinite(v)) {
            onChange(v);
          }
        }}
      />
    </Stack>
  );
}
