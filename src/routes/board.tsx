import { Alert, Badge, Button, Chip, Container, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { BoardTable, type BoardSort } from '../components/BoardTable.tsx';
import { boardToCsv, downloadCsv } from '../lib/board-export.ts';
import { buildBoard } from '../lib/analysis.ts';
import { adpModeLabel } from '../lib/adp.ts';
import { parseBoardSearch, POSITIONS, type BoardSearch } from '../lib/board-search.ts';
import { DEFAULT_SETTINGS } from '../lib/settings.ts';
import { matchAdp } from '../lib/matching.ts';
import { useAdp } from '../lib/query.ts';
import { clearAll } from '../lib/storage.ts';
import { useDraftStore, usePlayersStore, useSettingsStore } from '../lib/store.ts';
import type { Position } from '../lib/types.ts';
import { SegmentedField } from '../components/SegmentedField.tsx';

export const Route = createFileRoute('/board')({
  component: BoardPage,
  validateSearch: parseBoardSearch,
});

function BoardPage() {
  const navigate = useNavigate({ from: '/board' });
  const search = Route.useSearch();

  const players = usePlayersStore((s) => s.players);
  const settings = useSettingsStore((s) => s.settings);
  const drafted = useDraftStore((s) => s.drafted);
  const toggleDrafted = useDraftStore((s) => s.toggleDrafted);
  const clearDrafted = useDraftStore((s) => s.clearDrafted);

  const adp = useAdp(settings);

  const [showUnmatched, setShowUnmatched] = useState(false);

  const matched = useMemo(() => matchAdp(players ?? [], adp.records), [players, adp.records]);

  const board = useMemo(() => {
    if (players === null) return { rows: [], regressions: new Map(), notes: [] };
    return buildBoard(players, settings, matched);
  }, [players, settings, matched]);

  const filtered = useMemo(() => {
    const q = search.q.trim().toLowerCase();
    const positions = search.pos === '' ? null : new Set(search.pos.split(','));
    return board.rows.filter((row) => {
      if (positions !== null && !positions.has(row.player.position)) return false;
      if (q !== '' && !row.player.name.toLowerCase().includes(q) && !row.player.team.toLowerCase().includes(q))
        return false;
      if (search.steals === 'steals' && !row.steal) return false;
      if (search.steals === 'reaches' && !row.reach) return false;
      if (search.steals === 'none' && (row.steal || row.reach)) return false;
      return true;
    });
  }, [board.rows, search.q, search.pos, search.steals]);

  const draftedSet = useMemo(() => new Set(drafted), [drafted]);

  const summary = useMemo(() => {
    const steals = filtered.filter((r) => r.steal).length;
    const reaches = filtered.filter((r) => r.reach).length;
    const noAdp = filtered.filter((r) => r.adp === null);
    return { steals, reaches, noAdp };
  }, [filtered]);

  const counters = useMemo(() => {
    const byPos = new Map<Position, number>();
    for (const id of drafted) {
      const player = players?.find((p) => p.id === id);
      if (player !== undefined) byPos.set(player.position, (byPos.get(player.position) ?? 0) + 1);
    }
    const posOf = (p: Position) => {
      let starting: number;
      switch (p) {
        case 'QB':
          starting = settings.roster.startingQb;
          break;
        case 'RB':
          starting = settings.roster.startingRb;
          break;
        case 'WR':
          starting = settings.roster.startingWr;
          break;
        case 'TE':
          starting = settings.roster.startingTe;
          break;
        default:
          starting = settings.roster.startingDst;
          break;
      }
      return { drafted: byPos.get(p) ?? 0, starting };
    };
    return {
      qb: posOf('QB'),
      rb: posOf('RB'),
      wr: posOf('WR'),
      te: posOf('TE'),
      dst: posOf('DST'),
    };
  }, [drafted, players, settings.roster]);

  const flexSurplus = useMemo(() => {
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
  }, [counters, settings.roster]);

  const sortState: BoardSort = search.sort === '' ? null : { id: search.sort, desc: search.dir === 'desc' };

  const updateSearch = (patch: Partial<BoardSearch>) => {
    void navigate({ search: { ...search, ...patch } });
  };

  const startOver = async () => {
    await clearAll();
    clearDrafted();
    usePlayersStore.getState().setPlayers(null);
    useSettingsStore.getState().replaceSettings({ ...DEFAULT_SETTINGS });
    void navigate({ to: '/' });
  };

  const handleExport = () => {
    downloadCsv('draft-board.csv', boardToCsv(filtered, sortState, draftedSet));
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
        <Group justify="space-between">
          <div>
            <Title order={1}>Draft Board</Title>
            <Text size="sm" c="dimmed">
              {players.length} players · {settings.platform}
              {settings.leagueAware ? ' · league-aware' : ''} · {settings.draftType} · {settings.leagueSize} teams
            </Text>
          </div>
          <Group>
            <Button size="xs" variant="outline" onClick={handleExport} disabled={filtered.length === 0}>
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

        <Paper withBorder p="sm">
          <Group justify="space-between">
            <Text size="sm">
              ADP: <b>{adpModeLabel(adp.mode)}</b>
              {adp.fetchedAt !== null ? ` · fetched ${formatTime(adp.fetchedAt)}` : ''}
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

        <Paper withBorder p="sm">
          <Group gap="md" align="flex-end">
            <TextInput
              label="Search"
              size="xs"
              value={search.q}
              onChange={(e) => updateSearch({ q: e.currentTarget.value })}
              style={{ flex: 1 }}
            />
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
                        if (checked) set.add(p);
                        else set.delete(p);
                        updateSearch({ pos: [...set].join(',') });
                      }}
                    >
                      {p}
                    </Chip>
                  );
                })}
              </Group>
            </div>
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
              {filtered.length} players · {summary.steals} steals · {summary.reaches} reaches
            </Text>
          </Group>
        </Paper>

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
              Click a row to mark drafted; click again to undo (§8.1)
            </Text>
          </Group>
        </Paper>

        {board.notes.length > 0 ? (
          <Alert color="blue" title="Notes">
            {board.notes.map((note) => (
              <Text key={note} size="xs">
                {note}
              </Text>
            ))}
          </Alert>
        ) : null}

        {summary.noAdp.length > 0 ? (
          <Paper withBorder p="sm">
            <Text
              size="xs"
              onClick={() => setShowUnmatched((v) => !v)}
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
            >
              {summary.noAdp.length} players without ADP — {showUnmatched ? 'hide' : 'show'} list
            </Text>
            {showUnmatched ? (
              <Text size="xs" c="dimmed" mt={4}>
                {summary.noAdp.map((r) => `${r.player.name} (${r.player.team} · ${r.player.position})`).join(', ')}
              </Text>
            ) : null}
          </Paper>
        ) : null}

        <Paper withBorder p={0}>
          <BoardTable
            rows={filtered}
            drafted={draftedSet}
            onToggleDrafted={toggleDrafted}
            sort={sortState}
            onSortChange={(sort) =>
              updateSearch(
                sort === null ? { sort: '', dir: 'asc' } : { sort: sort.id, dir: sort.desc ? 'desc' : 'asc' },
              )
            }
            adpLoading={adpLoading}
          />
        </Paper>
      </Stack>
    </Container>
  );
}

function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function hasConsensus(records: ReadonlyArray<{ source: string }>): boolean {
  return records.some((r) => r.source === 'consensus');
}
