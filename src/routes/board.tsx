import { type AdpQueryResult, useAdp } from '../lib/query.ts';
import { Alert, Badge, Button, Chip, Container, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import type { AppSettings, BoardPlayer, PlayerRecord, Position } from '../lib/types.ts';
import { type BoardSearch, POSITIONS, parseBoardSearch } from '../lib/board-search.ts';
import { type BoardSort, BoardTable } from '../components/BoardTable.tsx';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { type PlayerFlag, useDraftStore, useFlagsStore, usePlayersStore, useSettingsStore } from '../lib/store.ts';
import { boardToCsv, downloadCsv } from '../lib/board-export.ts';
import { useMemo, useState } from 'react';
import { DEFAULT_SETTINGS } from '../lib/settings.ts';
import { SegmentedField } from '../components/SegmentedField.tsx';
import { adpModeLabel } from '../lib/adp.ts';
import { buildBoard } from '../lib/analysis.ts';
import { clearAll } from '../lib/storage.ts';
import { matchAdp } from '../lib/matching.ts';

export const Route = createFileRoute('/board')({
  component: BoardPage,
  validateSearch: parseBoardSearch,
});

export type BoardPageProps = Record<string, never>;

export function BoardPage(_props: Readonly<BoardPageProps>) {
  const navigate = useNavigate({ from: '/board' });
  const search = Route.useSearch();

  const players = usePlayersStore((s) => s.players);
  const settings = useSettingsStore((s) => s.settings);
  const drafted = useDraftStore((s) => s.drafted);
  const toggleDrafted = useDraftStore((s) => s.toggleDrafted);
  const clearDrafted = useDraftStore((s) => s.clearDrafted);
  const flags = useFlagsStore((s) => s.flags);
  const toggleFlag = useFlagsStore((s) => s.toggleFlag);
  const clearFlags = useFlagsStore((s) => s.clearFlags);

  const adp = useAdp(settings);

  const [showUnmatched, setShowUnmatched] = useState(false);

  const matched = useMemo(() => matchAdp(players ?? [], adp.records), [players, adp.records]);

  const board = useMemo(() => {
    if (players === null) {
      return { rows: [], notes: [] };
    }
    return buildBoard(players, settings, matched);
  }, [players, settings, matched]);

  const flagsMap = useMemo(() => {
    const map = new Map<string, PlayerFlag>();
    for (const [id, flag] of Object.entries(flags)) {
      if (flag !== undefined) {
        map.set(id, flag);
      }
    }
    return map;
  }, [flags]);

  const filtered = useMemo(() => {
    const q = search.q.trim().toLowerCase();
    const positions = search.pos === '' ? null : new Set(search.pos.split(','));
    return board.rows.filter((row) => {
      if (positions !== null && !positions.has(row.player.position)) {
        return false;
      }
      if (q !== '' && !row.player.name.toLowerCase().includes(q) && !row.player.team.toLowerCase().includes(q)) {
        return false;
      }
      if (search.steals === 'steals' && flagsMap.get(row.player.id) !== 'steal') {
        return false;
      }
      if (search.steals === 'reaches' && flagsMap.get(row.player.id) !== 'reach') {
        return false;
      }
      if (search.steals === 'none' && flagsMap.get(row.player.id) !== undefined) {
        return false;
      }
      return true;
    });
  }, [board.rows, flagsMap, search.q, search.pos, search.steals]);

  const draftedSet = useMemo(() => new Set(drafted), [drafted]);

  const summary = useMemo(() => {
    const steals = filtered.filter((r) => flagsMap.get(r.player.id) === 'steal').length;
    const reaches = filtered.filter((r) => flagsMap.get(r.player.id) === 'reach').length;
    const noAdp = filtered.filter((r) => r.adp === null);
    return { steals, reaches, noAdp };
  }, [filtered, flagsMap]);

  const counters = useMemo(() => computeCounters(drafted, players, settings), [drafted, players, settings]);

  const flexSurplus = useMemo(() => computeFlexSurplus(counters, settings), [counters, settings]);

  const sortState: BoardSort = search.sort === '' ? null : { id: search.sort, desc: search.dir === 'desc' };

  const updateSearch = (patch: Partial<BoardSearch>) => {
    void navigate({ search: { ...search, ...patch } });
  };

  const startOver = async () => {
    await clearAll();
    clearDrafted();
    clearFlags();
    usePlayersStore.getState().setPlayers(null);
    useSettingsStore.getState().replaceSettings({ ...DEFAULT_SETTINGS });
    void navigate({ to: '/' });
  };

  const handleExport = () => {
    downloadCsv('draft-board.csv', boardToCsv(filtered, sortState, draftedSet, flagsMap));
  };

  const beatAdpEmpty = adp.mode.kind === 'beatadp' && adp.records.length === 0 && !adp.isLoading && !adp.isError;
  const adpLoading = adp.isLoading || (adp.isFetching && adp.records.length === 0);

  if (players === null) {
    return (
      <Container py="xl">
        <Stack align="center" gap="sm">
          <Title order={2}>No workbook loaded</Title>
          <Button component={Link} to="/">
            Upload a projections workbook
          </Button>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="xl" py="lg">
      <Stack gap="md">
        {renderHeader(settings, players.length, filtered.length, handleExport, startOver)}
        {renderAdpStatus(adp)}
        {renderAlerts(adp, beatAdpEmpty)}
        {renderFilterBar(search, updateSearch, filtered.length, summary)}
        {renderDraftSummary(counters, flexSurplus)}
        {board.notes.length > 0 ? (
          <Alert color="blue" title="Notes">
            {board.notes.map((note) => (
              <Text key={note} size="xs">
                {note}
              </Text>
            ))}
          </Alert>
        ) : null}
        {renderUnmatched(summary.noAdp, showUnmatched, setShowUnmatched)}
        <Paper withBorder p={0}>
          <BoardTable
            rows={filtered}
            drafted={draftedSet}
            onToggleDrafted={toggleDrafted}
            flags={flagsMap}
            onToggleFlag={toggleFlag}
            sort={sortState}
            onSortChange={(sort) =>
              updateSearch(
                sort === null ? { sort: '', dir: 'asc' } : { sort: sort.id, dir: sort.desc ? 'desc' : 'asc' },
              )
            }
            adpLoading={adpLoading}
            platform={settings.platform}
          />
        </Paper>
      </Stack>
    </Container>
  );
}

type PositionCounters = Record<'qb' | 'rb' | 'wr' | 'te' | 'dst', { drafted: number; starting: number }>;

function computeCounters(
  drafted: readonly string[],
  players: PlayerRecord[] | null,
  settings: AppSettings,
): PositionCounters {
  const byPos = new Map<Position, number>();
  for (const id of drafted) {
    const player = players?.find((p) => p.id === id);
    if (player !== undefined) {
      byPos.set(player.position, (byPos.get(player.position) ?? 0) + 1);
    }
  }
  const startingByPos: Record<Position, number> = {
    QB: settings.roster.startingQb,
    RB: settings.roster.startingRb,
    WR: settings.roster.startingWr,
    TE: settings.roster.startingTe,
    DST: settings.roster.startingDst,
  };
  const posOf = (p: Position) => ({ drafted: byPos.get(p) ?? 0, starting: startingByPos[p] });
  return {
    qb: posOf('QB'),
    rb: posOf('RB'),
    wr: posOf('WR'),
    te: posOf('TE'),
    dst: posOf('DST'),
  };
}

function computeFlexSurplus(counters: PositionCounters, settings: AppSettings) {
  const flexEligible =
    Math.max(0, counters.rb.drafted - counters.rb.starting) +
    Math.max(0, counters.wr.drafted - counters.wr.starting) +
    Math.max(0, counters.te.drafted - counters.te.starting);
  const sfEligible = Math.max(0, counters.qb.drafted - counters.qb.starting);
  return {
    flex: Math.min(flexEligible, settings.roster.flex),
    flexMax: settings.roster.flex,
    sf: Math.min(sfEligible, settings.roster.superflex),
    sfMax: settings.roster.superflex,
  };
}

function renderHeader(
  settings: AppSettings,
  playerCount: number,
  filteredCount: number,
  handleExport: () => void,
  startOver: () => Promise<void>,
) {
  return (
    <Group justify="space-between">
      <div>
        <Title order={1}>Draft Board</Title>
        <Text size="sm" c="dimmed">
          {playerCount} players · {settings.platform}
          {settings.leagueAware ? ' · league-aware' : ''} · {settings.draftType} · {settings.leagueSize} teams
        </Text>
      </div>
      <Group>
        <Button size="xs" variant="outline" onClick={handleExport} disabled={filteredCount === 0}>
          Export CSV
        </Button>
        <Button size="xs" variant="outline" component={Link} to="/">
          Change file / settings
        </Button>
        <Button size="xs" variant="subtle" color="red" onClick={() => void startOver()}>
          Start over
        </Button>
      </Group>
    </Group>
  );
}

function renderAdpStatus(adp: AdpQueryResult) {
  return (
    <Paper withBorder p="sm">
      <Group justify="space-between">
        <Text size="sm">
          ADP: <b>{adpModeLabel(adp.mode)}</b>
          {adp.fetchedAt === null ? '' : ` · fetched ${formatTime(adp.fetchedAt)}`}
          {adp.degraded ? (
            <Badge ml="xs" color="orange" variant="light">
              degraded
            </Badge>
          ) : null}
        </Text>
        <Button size="xs" onClick={() => void adp.refresh()} loading={adp.isFetching}>
          Refresh ADP
        </Button>
      </Group>
      {adp.mode.kind === 'beatadp' ? (
        <Text size="xs" c="dimmed" mt={4}>
          Team defenses aren&apos;t tracked by BeatADP (§5.2)
        </Text>
      ) : null}
      {hasConsensus(adp.records) ? (
        <Text size="xs" c="dimmed" mt={4}>
          <sup>†</sup> Consensus ADP — not available for {adp.mode.kind === 'beatadp' ? adp.mode.platform : 'ESPN'}
        </Text>
      ) : null}
    </Paper>
  );
}

function renderAlerts(adp: AdpQueryResult, beatAdpEmpty: boolean) {
  return (
    <>
      {adp.degraded ? (
        <Alert color="orange" title="League-aware credentials were cleared">
          Showing BeatADP&apos;s ESPN ADP. Reconnect your league in{' '}
          <Link to="/" style={{ textDecoration: 'underline' }}>
            settings
          </Link>
          .
        </Alert>
      ) : null}
      {adp.isError ? (
        <Alert color="red" title="ADP fetch failed">
          {adp.error?.message ?? 'Unknown error'}
          <Button size="xs" ml="sm" variant="outline" onClick={() => void adp.refetch()}>
            Retry
          </Button>
        </Alert>
      ) : null}
      {beatAdpEmpty && adp.mode.kind === 'beatadp' ? (
        <Alert color="yellow" title="BeatADP has no ADP data">
          No ADP data for {adp.mode.qbType}/{adp.mode.scoringFormat} — try 1QB or another scoring format (§5.2).
        </Alert>
      ) : null}
    </>
  );
}

function renderFilterBar(
  search: BoardSearch,
  updateSearch: (patch: Partial<BoardSearch>) => void,
  filteredCount: number,
  summary: { steals: number; reaches: number },
) {
  return (
    <Paper withBorder p="sm">
      <Group gap="md" align="flex-end">
        <TextInput
          label="Search"
          size="xs"
          value={search.q}
          onChange={(e) => updateSearch({ q: e.currentTarget.value })}
          style={{ flex: 1 }}
        />
        {renderPositionChips(search, updateSearch)}
        <SegmentedField
          label="Steals / reaches"
          value={search.steals}
          data={[
            { value: 'all', label: 'All' },
            { value: 'steals', label: 'Steals' },
            { value: 'reaches', label: 'Reaches' },
            { value: 'none', label: 'None' },
          ]}
          onChange={(v) => updateSearch({ steals: v })}
        />
        <Text size="xs" c="dimmed">
          {filteredCount} players · {summary.steals} steals · {summary.reaches} reaches
        </Text>
      </Group>
    </Paper>
  );
}

function renderPositionChips(search: BoardSearch, updateSearch: (patch: Partial<BoardSearch>) => void) {
  return (
    <div>
      <Text size="xs">Position</Text>
      <Group gap={4}>
        {POSITIONS.map((p) => {
          const active = search.pos.split(',').includes(p);
          return (
            <Chip
              key={p}
              size="xs"
              checked={active}
              onChange={(checked) => {
                const set = new Set(search.pos === '' ? [] : search.pos.split(','));
                if (checked) {
                  set.add(p);
                } else {
                  set.delete(p);
                }
                updateSearch({ pos: [...set].join(',') });
              }}
            >
              {p}
            </Chip>
          );
        })}
      </Group>
    </div>
  );
}

function renderDraftSummary(
  counters: Record<'qb' | 'rb' | 'wr' | 'te' | 'dst', { drafted: number; starting: number }>,
  flexSurplus: { flex: number; flexMax: number; sf: number; sfMax: number },
) {
  return (
    <Paper withBorder p="sm">
      <Group gap="lg">
        <Text size="sm">
          Drafted:{' '}
          {(['qb', 'rb', 'wr', 'te', 'dst'] as const)
            .map((key) => {
              const c = counters[key];
              return `${key.toUpperCase()} ${c.drafted}/${c.starting}`;
            })
            .join(' · ')}
          {flexSurplus.flexMax > 0 ? ` · FLEX ${flexSurplus.flex}/${flexSurplus.flexMax}` : ''}
          {flexSurplus.sfMax > 0 ? ` · SF ${flexSurplus.sf}/${flexSurplus.sfMax}` : ''}
        </Text>
        <Text size="xs" c="dimmed">
          Use the Drafted button in the Flag column to mark drafted; click again to undo (§8.1)
        </Text>
      </Group>
    </Paper>
  );
}

function renderUnmatched(noAdp: BoardPlayer[], showUnmatched: boolean, setShowUnmatched: (v: boolean) => void) {
  if (noAdp.length === 0) {
    return null;
  }
  return (
    <Paper withBorder p="sm">
      <Text
        size="xs"
        onClick={() => setShowUnmatched(!showUnmatched)}
        style={{ cursor: 'pointer', textDecoration: 'underline' }}
      >
        {noAdp.length} players without ADP — {showUnmatched ? 'hide' : 'show'} list
      </Text>
      {showUnmatched ? (
        <Text size="xs" c="dimmed" mt={4}>
          {noAdp.map((r) => `${r.player.name} (${r.player.team} · ${r.player.position})`).join(', ')}
        </Text>
      ) : null}
    </Paper>
  );
}

function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function hasConsensus(records: readonly { source: string }[]): boolean {
  return records.some((r) => r.source === 'consensus');
}
