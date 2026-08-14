import { Group, Paper, Stack, Text } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';

type DropzoneCardProps = {
  onFile: (file: File) => void;
  disabled?: boolean;
};

/** The landing dropzone (§8.1): accepts an Athletic projections `.xlsx`. */
export function DropzoneCard({ onFile, disabled = false }: DropzoneCardProps) {
  return (
    <Paper withBorder p="md">
      <Dropzone
        onDrop={(files) => {
          const [file] = files;
          if (file !== undefined) {
            onFile(file);
          }
        }}
        accept={['.xlsx']}
        maxSize={20 * 1024 * 1024}
        disabled={disabled}
      >
        <Group justify="center" gap="sm" style={{ pointerEvents: 'none', minHeight: 140 }}>
          <Stack gap={4} align="center">
            <Text size="lg" fw={600}>
              Drop your projections workbook
            </Text>
            <Text size="sm" c="dimmed">
              The Athletic projections file (.xlsx) — parsed entirely in your browser
            </Text>
          </Stack>
        </Group>
      </Dropzone>
    </Paper>
  );
}
