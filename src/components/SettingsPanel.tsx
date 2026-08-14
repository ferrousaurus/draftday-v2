import { Collapse, Divider, Group, Paper, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import type { AppSettings } from '../lib/types.ts';
import { NumberStepper } from './NumberStepper.tsx';
import { PprChip } from './PprChip.tsx';
import { SegmentedField } from './SegmentedField.tsx';
import { useState } from 'react';

type SettingsPanelProps = {
  settings: AppSettings;
  locked: boolean;
  onChange: (next: AppSettings) => void;
};

/** The settings panel (§3.2, §5.4): app-owned defaults or league-locked values; never from the workbook. */
export function SettingsPanel({ settings, locked, onChange }: Readonly<SettingsPanelProps>) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const { scoring, roster } = settings;

  const patch = (partial: Partial<AppSettings>) => onChange({ ...settings, ...partial });
  const patchScoring = (partial: Partial<AppSettings['scoring']>) =>
    onChange({ ...settings, scoring: { ...scoring, ...partial } });
  const patchRoster = (partial: Partial<AppSettings['roster']>) =>
    onChange({ ...settings, roster: { ...roster, ...partial } });

  return (
    <Stack gap="md">
      {renderCoreSection(settings, locked, patch, patchScoring)}
      {renderScoringSection(scoring, locked, advancedOpen, () => setAdvancedOpen((o) => !o), patchScoring)}
      {renderRosterSection(roster, locked, patchRoster)}
      {renderSeasonSection(settings, patch)}
    </Stack>
  );
}

function renderCoreSection(
  settings: AppSettings,
  locked: boolean,
  patch: (partial: Partial<AppSettings>) => void,
  patchScoring: (partial: Partial<AppSettings['scoring']>) => void,
) {
  const { scoring } = settings;
  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Text fw={600}>Core</Text>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <PprChip
            receptions={{ rb: scoring.receptionsRb, wr: scoring.receptionsWr, te: scoring.receptionsTe }}
            onChange={(receptions) =>
              patchScoring({ receptionsRb: receptions.rb, receptionsWr: receptions.wr, receptionsTe: receptions.te })
            }
            disabled={locked}
          />
          <NumberStepper
            label="League size (teams)"
            value={settings.leagueSize}
            min={2}
            max={32}
            disabled={locked}
            onChange={(v) => patch({ leagueSize: v })}
          />
          <SegmentedField
            label="Pass TD"
            value={String(scoring.passTd)}
            data={[
              { value: '4', label: '4' },
              { value: '6', label: '6' },
            ]}
            onChange={(v) => patchScoring({ passTd: Number(v) })}
            disabled={locked}
          />
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}

function renderScoringSection(
  scoring: AppSettings['scoring'],
  locked: boolean,
  advancedOpen: boolean,
  onToggleAdvanced: () => void,
  patchScoring: (partial: Partial<AppSettings['scoring']>) => void,
) {
  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600}>Scoring</Text>
          {renderAdvancedToggle(advancedOpen, onToggleAdvanced)}
        </Group>
        {renderScoringGrid(scoring, locked, patchScoring)}
        <Collapse expanded={advancedOpen}>{renderAdvancedScoring(scoring, patchScoring)}</Collapse>
      </Stack>
    </Paper>
  );
}

function renderAdvancedToggle(advancedOpen: boolean, onToggleAdvanced: () => void) {
  return (
    <UnstyledButton onClick={onToggleAdvanced}>
      <Text size="xs" c="blue">
        {advancedOpen ? 'Hide advanced' : 'Advanced'}
      </Text>
    </UnstyledButton>
  );
}

function renderScoringGrid(
  scoring: AppSettings['scoring'],
  locked: boolean,
  patchScoring: (partial: Partial<AppSettings['scoring']>) => void,
) {
  return (
    <SimpleGrid cols={{ base: 2, sm: 4 }}>
      <SegmentedField
        label="Pass yards"
        value={String(scoring.passYards)}
        data={[
          { value: '0.04', label: '0.04' },
          { value: '0.05', label: '0.05' },
          { value: '0.1', label: '0.1' },
        ]}
        onChange={(v) => patchScoring({ passYards: Number(v) })}
        disabled={locked}
      />
      <NumberStepper
        label="Interceptions"
        value={scoring.interceptions}
        min={-5}
        max={0}
        step={0.5}
        disabled={locked}
        onChange={(v) => patchScoring({ interceptions: v })}
      />
      <NumberStepper
        label="Rush yards"
        value={scoring.rushYards}
        min={0.01}
        max={0.2}
        step={0.01}
        disabled={locked}
        onChange={(v) => patchScoring({ rushYards: v })}
      />
      <NumberStepper
        label="Rush TDs"
        value={scoring.rushTd}
        min={0}
        max={10}
        disabled={locked}
        onChange={(v) => patchScoring({ rushTd: v })}
      />
      <NumberStepper
        label="Recv yards"
        value={scoring.recvYards}
        min={0.01}
        max={0.2}
        step={0.01}
        disabled={locked}
        onChange={(v) => patchScoring({ recvYards: v })}
      />
      <NumberStepper
        label="Recv TDs"
        value={scoring.recvTd}
        min={0}
        max={10}
        disabled={locked}
        onChange={(v) => patchScoring({ recvTd: v })}
      />
      <NumberStepper
        label="DEF sacks"
        value={scoring.defSacks}
        min={0}
        max={10}
        disabled={locked}
        onChange={(v) => patchScoring({ defSacks: v })}
      />
      <NumberStepper
        label="DEF INT"
        value={scoring.defInt}
        min={0}
        max={10}
        disabled={locked}
        onChange={(v) => patchScoring({ defInt: v })}
      />
      <NumberStepper
        label="DEF force fumble"
        value={scoring.defForceFumble}
        min={0}
        max={10}
        disabled={locked}
        onChange={(v) => patchScoring({ defForceFumble: v })}
      />
      <NumberStepper
        label="DEF recover fumble"
        value={scoring.defRecoverFumble}
        min={0}
        max={10}
        disabled={locked}
        onChange={(v) => patchScoring({ defRecoverFumble: v })}
      />
      <NumberStepper
        label="DEF safeties"
        value={scoring.defSafeties}
        min={0}
        max={10}
        disabled={locked}
        onChange={(v) => patchScoring({ defSafeties: v })}
      />
      <NumberStepper
        label="DEF touchdown"
        value={scoring.defTd}
        min={0}
        max={10}
        disabled={locked}
        onChange={(v) => patchScoring({ defTd: v })}
      />
    </SimpleGrid>
  );
}

function renderAdvancedScoring(
  scoring: AppSettings['scoring'],
  patchScoring: (partial: Partial<AppSettings['scoring']>) => void,
) {
  return (
    <Stack gap="sm">
      <Divider />
      <Text size="sm" c="dimmed">
        Advanced — these price at 0 in the default table but remain formula-respectful (§3.2).
      </Text>
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <NumberStepper
          label="PASS ATTEMPTS"
          value={scoring.passAttempts}
          min={0}
          max={10}
          onChange={(v) => patchScoring({ passAttempts: v })}
        />
        <NumberStepper
          label="COMPLETIONS"
          value={scoring.completions}
          min={0}
          max={10}
          onChange={(v) => patchScoring({ completions: v })}
        />
        <NumberStepper
          label="TARGETS"
          value={scoring.targets}
          min={0}
          max={10}
          onChange={(v) => patchScoring({ targets: v })}
        />
      </SimpleGrid>
    </Stack>
  );
}

function renderRosterSection(
  roster: AppSettings['roster'],
  locked: boolean,
  patchRoster: (partial: Partial<AppSettings['roster']>) => void,
) {
  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Text fw={600}>Roster</Text>
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <NumberStepper
            label="STARTING QB"
            value={roster.startingQb}
            min={0}
            max={5}
            disabled={locked}
            onChange={(v) => patchRoster({ startingQb: v })}
          />
          <NumberStepper
            label="STARTING RB"
            value={roster.startingRb}
            min={0}
            max={8}
            disabled={locked}
            onChange={(v) => patchRoster({ startingRb: v })}
          />
          <NumberStepper
            label="STARTING WR"
            value={roster.startingWr}
            min={0}
            max={10}
            disabled={locked}
            onChange={(v) => patchRoster({ startingWr: v })}
          />
          <NumberStepper
            label="STARTING TE"
            value={roster.startingTe}
            min={0}
            max={6}
            disabled={locked}
            onChange={(v) => patchRoster({ startingTe: v })}
          />
          <NumberStepper
            label="STARTING DST"
            value={roster.startingDst}
            min={0}
            max={3}
            disabled={locked}
            onChange={(v) => patchRoster({ startingDst: v })}
          />
          <NumberStepper
            label="FLEX"
            value={roster.flex}
            min={0}
            max={10}
            disabled={locked}
            onChange={(v) => patchRoster({ flex: v })}
          />
          <NumberStepper
            label="SUPERFLEX"
            value={roster.superflex}
            min={0}
            max={5}
            disabled={locked}
            onChange={(v) => patchRoster({ superflex: v })}
          />
          <NumberStepper
            label="AUCTION BUDGET"
            value={roster.auctionBudget}
            min={50}
            max={500}
            step={25}
            onChange={(v) => patchRoster({ auctionBudget: v })}
          />
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}

function renderSeasonSection(settings: AppSettings, patch: (partial: Partial<AppSettings>) => void) {
  return (
    <Paper withBorder p="md">
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <NumberStepper
          label="Season"
          value={settings.season}
          min={2020}
          max={2035}
          onChange={(v) => patch({ season: v })}
        />
      </SimpleGrid>
    </Paper>
  );
}
