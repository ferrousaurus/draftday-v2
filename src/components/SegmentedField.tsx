import { SegmentedControl } from '@mantine/core';

export type SegmentedFieldProps<T extends string> = {
  label: string;
  value: T;
  data: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  description?: string;
};

export function SegmentedField<T extends string>({
  label,
  value,
  data,
  onChange,
  disabled = false,
  description,
}: SegmentedFieldProps<T>) {
  return (
    <div>
      <div>{label}</div>
      <SegmentedControl
        size="xs"
        value={value}
        data={data.map((d) => ({ value: d.value, label: d.label }))}
        onChange={(v) => {
          const match = data.find((d) => d.value === v);
          if (match !== undefined) {
            onChange(match.value);
          }
        }}
        disabled={disabled}
      />
      {description === undefined ? null : (
        <div style={{ fontSize: 12, color: 'var(--mantine-color-dimmed)' }}>{description}</div>
      )}
    </div>
  );
}
