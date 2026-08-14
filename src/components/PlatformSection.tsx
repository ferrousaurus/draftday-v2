import { Alert, Button, Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import { deriveQbType, deriveScoringFormat } from '../lib/settings.ts';
import { draftTypeOptions, platformHasLeagueAware, scoringFormatLabel } from '../lib/adp.ts';
import type { AppSettings } from '../lib/types.ts';
import { SegmentedField } from './SegmentedField.tsx';

type PlatformSectionProps = {
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  locked: boolean;
  connecting: boolean;
  connectError: string | null;
  onConnect: () => void;
};

/** Platform selector, league-aware toggle + fields, draftType (§8.1, §5.4). */
export function PlatformSection({
  settings,
  onChange,
  locked,
  connecting,
  connectError,
  onConnect,
}: PlatformSectionProps) {
  const patch = (partial: Partial<AppSettings>) => onChange({ ...settings, ...partial });
  const leagueAwareAvailable = platformHasLeagueAware(settings.platform);
  const draftTypes = draftTypeOptions(settings.platform);

  const qbType = deriveQbType(settings.roster);
  const scoringFormat = deriveScoringFormat({
    rb: settings.scoring.receptionsRb,
    wr: settings.scoring.receptionsWr,
    te: settings.scoring.receptionsTe,
  });

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Text fw={600}>Platform</Text>
        <SegmentedField
          label="Platform"
          value={settings.platform}
          data={[
            { value: 'ESPN', label: 'ESPN' },
            { value: 'Yahoo', label: 'Yahoo' },
            { value: 'Sleeper', label: 'Sleeper' },
          ]}
          onChange={(v) => patch({ platform: v, leagueAware: false })}
          disabled={locked}
        />
        {leagueAwareAvailable ? (
          <SegmentedField
            label="League-aware"
            value={settings.leagueAware ? 'on' : 'off'}
            data={[
              { value: 'off', label: 'Off' },
              { value: 'on', label: 'On' },
            ]}
            // Un-toggling league-aware always stays possible: it unlocks
            // everything with values preserved (§5.4).
            onChange={(v) => patch({ leagueAware: v === 'on' })}
            description={
              settings.platform === 'ESPN'
                ? 'Requires leagueId + espn_s2/SWID cookies (§5.5)'
                : 'Uses the public Sleeper league API (leagueId only)'
            }
          />
        ) : null}

        {settings.leagueAware ? (
          <Stack gap="sm">
            <TextInput
              label="League ID"
              value={settings.leagueId}
              onChange={(e) => patch({ leagueId: e.currentTarget.value })}
              placeholder="e.g. 12345678"
              disabled={locked}
            />
            {settings.platform === 'ESPN' ? (
              <Group grow>
                <TextInput
                  label="espn_s2 (cookie)"
                  value={settings.espnS2}
                  onChange={(e) => patch({ espnS2: e.currentTarget.value })}
                  type="password"
                  autoComplete="off"
                  disabled={locked}
                />
                <TextInput
                  label="SWID (cookie)"
                  value={settings.swid}
                  onChange={(e) => patch({ swid: e.currentTarget.value })}
                  type="password"
                  autoComplete="off"
                  disabled={locked}
                />
              </Group>
            ) : null}
            <Group>
              <Button size="xs" onClick={onConnect} loading={connecting} disabled={locked || settings.leagueId === ''}>
                {locked ? 'Connected' : 'Connect league'}
              </Button>
              <Text size="xs" c="dimmed">
                {settings.platform === 'ESPN'
                  ? 'Credentials are transmitted per request and never stored server-side (§5.5).'
                  : 'The Sleeper league API is public.'}
              </Text>
            </Group>
            {connectError === null ? null : (
              <Alert color="red" title="League connection failed">
                {connectError}
              </Alert>
            )}
          </Stack>
        ) : null}

        <Select
          label="Draft type"
          size="xs"
          value={settings.draftType}
          data={draftTypes.map((t) => ({ value: t, label: t }))}
          onChange={(v) => {
            const match = draftTypes.find((t) => t === v);
            if (match !== undefined) {
              patch({ draftType: match });
            }
          }}
          disabled={locked || settings.platform === 'ESPN'}
          description={settings.platform === 'ESPN' ? 'ESPN only exposes redraft' : undefined}
        />

        <Text size="xs" c="dimmed">
          Derived: qbType = <b>{qbType}</b> · scoringFormat = <b>{scoringFormatLabel(scoringFormat)}</b>
        </Text>
      </Stack>
    </Paper>
  );
}

export { DRAFT_TYPES_BY_PLATFORM } from '../lib/settings.ts';
