import { Alert, Button, Container, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { Link, createFileRoute } from '@tanstack/react-router';
import { clearFile, saveFile, savePlayers } from '../lib/storage.ts';
import { useMemo, useState } from 'react';
import { usePlayersStore, useSettingsStore } from '../lib/store.ts';
import { DropzoneCard } from '../components/DropzoneCard.tsx';
import { PlatformSection } from '../components/PlatformSection.tsx';
import { SettingsPanel } from '../components/SettingsPanel.tsx';
import { fetchKonaLeague } from '../server/kona.ts';
import { fetchSleeperLeague } from '../server/sleeper.ts';
import { parseWorkbook } from '../lib/workbook/parser.ts';

function renderWorkbookHeader(fileSummary: string, onReplaceWorkbook: () => void) {
  return (
    <Paper withBorder p="sm">
      <Group justify="space-between">
        <Text size="sm">
          Workbook loaded — {fileSummary}. Settings are app-owned defaults or your saved session; the workbook never
          pre-fills them (§1, §3.2).
        </Text>
        {renderWorkbookActions(onReplaceWorkbook)}
      </Group>
    </Paper>
  );
}

function renderWorkbookActions(onReplaceWorkbook: () => void) {
  return (
    <Group>
      <Button size="xs" variant="outline" onClick={onReplaceWorkbook}>
        Replace workbook
      </Button>
      <Button size="xs" component={Link} to="/board">
        Open draft board
      </Button>
    </Group>
  );
}

export const Route = createFileRoute('/')({
  component: SetupPage,
});

export type SetupPageProps = Record<string, never>;

export function SetupPage(_props: Readonly<SetupPageProps>) {
  const players = usePlayersStore((s) => s.players);
  const setPlayers = usePlayersStore((s) => s.setPlayers);
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const replaceSettings = useSettingsStore((s) => s.replaceSettings);

  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [leagueLocked, setLeagueLocked] = useState(false);

  const fileSummary = useMemo(() => (players === null ? null : `${players.length} players parsed`), [players]);

  const onFile = async (file: File) => {
    setParsing(true);
    setParseError(null);
    try {
      const bytes = await file.arrayBuffer();
      const parsed = parseWorkbook(bytes);
      if (parsed.length === 0) {
        setParseError('The workbook parsed but contained no players.');
        return;
      }
      await Promise.all([saveFile(bytes), savePlayers(parsed)]);
      setPlayers(parsed);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Could not parse the workbook.');
    } finally {
      setParsing(false);
    }
  };

  const replaceWorkbook = async () => {
    await clearFile();
    setPlayers(null);
    setParseError(null);
  };

  const connectLeague = async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      if (settings.platform === 'ESPN') {
        const result = await fetchKonaLeague({
          data: { season: settings.season, leagueId: settings.leagueId, espnS2: settings.espnS2, swid: settings.swid },
        });
        replaceSettings({
          ...settings,
          platform: 'ESPN',
          leagueAware: true,
          leagueId: settings.leagueId,
          espnS2: settings.espnS2,
          swid: settings.swid,
          draftType: result.settings.draftType,
          leagueSize: result.settings.leagueSize,
          scoring: result.settings.scoring,
          roster: result.settings.roster,
        });
      } else {
        const result = await fetchSleeperLeague({ data: { leagueId: settings.leagueId } });
        replaceSettings({
          ...settings,
          platform: 'Sleeper',
          leagueAware: true,
          leagueId: settings.leagueId,
          draftType: result.settings.draftType,
          leagueSize: result.settings.leagueSize,
          scoring: result.settings.scoring,
          roster: result.settings.roster,
        });
      }
      setLeagueLocked(true);
    } catch (error) {
      // League fetch failure: banner + form stays unlocked, never blocked (§5.4).
      setLeagueLocked(false);
      setConnectError(error instanceof Error ? error.message : 'Could not reach the league API.');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Container size="lg" py="lg">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={1}>Draft Day</Title>
          <Text size="sm" c="dimmed">
            Athletic projections × live ADP draft board
          </Text>
        </Group>

        {players === null ? (
          <Stack gap="sm">
            <DropzoneCard onFile={(f) => void onFile(f)} disabled={parsing} />
            {parsing ? <Text size="sm">Parsing workbook…</Text> : null}
            {parseError === null ? null : (
              <Alert color="red" title="Could not load workbook">
                {parseError}
              </Alert>
            )}
          </Stack>
        ) : (
          <Stack gap="md">
            {renderWorkbookHeader(fileSummary ?? '', () => void replaceWorkbook())}

            <PlatformSection
              settings={settings}
              onChange={(next) => {
                setSettings(next);
                // Un-toggling league-aware unlocks everything (§5.4).
                if (!next.leagueAware) {
                  setLeagueLocked(false);
                }
              }}
              locked={leagueLocked}
              connecting={connecting}
              connectError={connectError}
              onConnect={() => void connectLeague()}
            />

            <SettingsPanel settings={settings} onChange={setSettings} locked={leagueLocked} />
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
