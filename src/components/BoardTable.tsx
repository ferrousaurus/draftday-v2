/* oxlint-disable react/no-multi-comp -- BoardRow (memoized row renderer) is deliberately co-located with BoardTable per docs/plans/optimize-steal-and-reach.md: a separate file would need to export table internals (features, cellContent, flagButtons, rowAccent) and create a circular import. */
import { Badge, Button, Group, Skeleton, Table } from '@mantine/core';
import type { BoardPlayer, Platform } from '../lib/types.ts';
import { memo, useMemo } from 'react';
import {
  type Cell,
  FlexRender,
  type Header,
  type Row,
  type SortFn,
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { ConsensusAdp } from './ConsensusAdp.tsx';
import { type PlayerFlag } from '../lib/store.ts';
import { positionBadgeColor } from '../lib/position-colors.ts';

export type BoardSort = { id: string; desc: boolean } | null;

export type BoardTableProps = {
  rows: BoardPlayer[];
  drafted: ReadonlySet<string>;
  onToggleDrafted: (playerId: string) => void;
  flags: ReadonlyMap<string, PlayerFlag>;
  onToggleFlag: (playerId: string, flag: PlayerFlag) => void;
  sort: BoardSort;
  onSortChange: (sort: BoardSort) => void;
  adpLoading: boolean;
  platform: Platform;
};

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

/** ADP/xADP/delta sort with nulls always last, regardless of direction (§6.4). */
const nullableSortFn = (getValue: (row: BoardPlayer) => number | null) =>
  ((rowA, rowB) => {
    const a = getValue(rowA.original);
    const b = getValue(rowB.original);
    if (a === null && b === null) {
      return 0;
    }
    if (a === null) {
      return 1;
    }
    if (b === null) {
      return -1;
    }
    return a - b;
  }) satisfies SortFn<typeof features, BoardPlayer>;

const helper = createColumnHelper<typeof features, BoardPlayer>();

function sortIndicator(sorted: false | 'asc' | 'desc') {
  if (sorted === 'asc') {
    return ' ▲';
  }
  if (sorted === 'desc') {
    return ' ▼';
  }
  return '';
}

function rowAccent(isDrafted: boolean, flag: PlayerFlag | undefined) {
  if (isDrafted) {
    return { opacity: 0.45, textDecoration: 'line-through' };
  }
  if (flag === 'steal') {
    return { fontWeight: 'bolder', fontStyle: 'italic' };
  }
  if (flag === 'reach') {
    return { fontWeight: 'lighter' };
  }
  return {};
}

function flagButtons(
  id: string,
  name: string,
  current: PlayerFlag | undefined,
  isDrafted: boolean,
  onToggleDrafted: (playerId: string) => void,
  onToggleFlag: (playerId: string, flag: PlayerFlag) => void,
) {
  return (
    <Group gap={4} wrap="nowrap">
      <Button.Group>
        <Button
          size="xs"
          variant={current === 'steal' ? 'filled' : 'outline'}
          style={{ width: 'auto', paddingInline: 6 }}
          onClick={() => onToggleFlag(id, 'steal')}
          aria-label={current === 'steal' ? `Unflag ${name} as steal` : `Flag ${name} as steal`}
        >
          Steal
        </Button>
        <Button
          size="xs"
          variant={current === 'reach' ? 'filled' : 'outline'}
          style={{ width: 'auto', paddingInline: 6 }}
          onClick={() => onToggleFlag(id, 'reach')}
          aria-label={current === 'reach' ? `Unflag ${name} as reach` : `Flag ${name} as reach`}
        >
          Reach
        </Button>
      </Button.Group>
      <Button
        size="xs"
        variant={isDrafted ? 'filled' : 'outline'}
        style={{ width: 'auto', paddingInline: 6 }}
        onClick={() => onToggleDrafted(id)}
        aria-label={isDrafted ? `Unmark ${name} as drafted` : `Mark ${name} as drafted`}
      >
        Drafted
      </Button>
    </Group>
  );
}

function headerContent(header: Header<typeof features, BoardPlayer>) {
  return (
    <>
      <FlexRender header={header} />
      {sortIndicator(header.column.getIsSorted())}
    </>
  );
}

const cellContent = (cell: Cell<typeof features, BoardPlayer>, adpLoading: boolean) =>
  cell.column.id === 'adp' && adpLoading ? <Skeleton height={14} width={32} /> : <FlexRender cell={cell} />;

type BoardRowProps = {
  row: Row<typeof features, BoardPlayer>;
  flag: PlayerFlag | undefined;
  isDrafted: boolean;
  adpLoading: boolean;
  onToggleDrafted: (playerId: string) => void;
  onToggleFlag: (playerId: string, flag: PlayerFlag) => void;
};

/**
 * Memo comparator for BoardRow. TanStack creates fresh Row/Cell objects on
 * every table render, so the comparator keys on row.id + row.original identity
 * (stable via the board.tsx useMemo chain) plus the flag/drafted/adpLoading
 * values and the stable zustand action references. A flag or drafted toggle
 * re-renders exactly one row; a sort reorders rows by key without re-rendering
 * them. adpLoading changes still re-render all rows (intended; only during ADP
 * fetches).
 */
const boardRowPropsEqual = (prev: BoardRowProps, next: BoardRowProps) =>
  prev.row.id === next.row.id &&
  prev.row.original === next.row.original &&
  prev.flag === next.flag &&
  prev.isDrafted === next.isDrafted &&
  prev.adpLoading === next.adpLoading &&
  prev.onToggleDrafted === next.onToggleDrafted &&
  prev.onToggleFlag === next.onToggleFlag;

/** Plain row renderer; wrapped in memo() below so a toggle re-renders exactly this row. */
function BoardRowInner({ row, flag, isDrafted, adpLoading, onToggleDrafted, onToggleFlag }: Readonly<BoardRowProps>) {
  const accent = rowAccent(isDrafted, flag);
  return (
    <Table.Tr style={accent}>
      {row.getAllCells().map((cell) => (
        <Table.Td key={cell.id}>
          {cell.column.id === 'flag'
            ? flagButtons(
                row.original.player.id,
                row.original.player.name,
                flag,
                isDrafted,
                onToggleDrafted,
                onToggleFlag,
              )
            : cellContent(cell, adpLoading)}
        </Table.Td>
      ))}
    </Table.Tr>
  );
}

const BoardRow = memo(BoardRowInner, boardRowPropsEqual);

/** Flag buttons render from the memoized BoardRow, so the column cell stays null to keep columns stable across toggles. */
const buildColumns = (platform: Platform) =>
  helper.columns([
    helper.display({
      id: 'flag',
      header: 'Flag',
      cell: () => null,
    }),
    helper.accessor((row) => row.adp, {
      id: 'adp',
      header: 'ADP',
      sortFn: nullableSortFn((r) => r.adp),
      cell: ({ getValue, row }) => {
        const value = getValue();
        const source = row.original.adpSource;
        if (value === null) {
          return null;
        }
        return source === 'consensus' ? <ConsensusAdp value={value} /> : <span>{value.toFixed(1)}</span>;
      },
    }),
    helper.accessor((row) => row.player.name, {
      id: 'name',
      header: 'Name',
      cell: ({ getValue }) => getValue(),
    }),
    helper.accessor((row) => row.player.position, {
      id: 'position',
      header: 'Pos',
      cell: ({ getValue }) => {
        const position = getValue();
        return (
          <Badge color={positionBadgeColor(platform, position)} variant="light" size="xs">
            {position}
          </Badge>
        );
      },
    }),
    helper.accessor((row) => row.player.team, {
      id: 'team',
      header: 'Team',
      cell: ({ getValue }) => getValue(),
    }),
    helper.accessor((row) => row.projectedPoints, {
      id: 'projectedPoints',
      header: 'Proj Pts',
      cell: ({ getValue }) => getValue().toFixed(1),
    }),
    helper.accessor((row) => row.vorp, {
      id: 'vorp',
      header: 'VORP',
      cell: ({ getValue }) => getValue().toFixed(1),
    }),
    helper.accessor((row) => row.xadp, {
      id: 'xadp',
      header: 'xADP',
      sortFn: nullableSortFn((r) => r.xadp),
      cell: ({ getValue }) => {
        const value = getValue();
        if (value === null) {
          return null;
        }
        return <span>{value.toFixed(1)}</span>;
      },
    }),
    helper.accessor((row) => row.delta, {
      id: 'delta',
      header: 'Delta',
      sortFn: nullableSortFn((r) => r.delta),
      cell: ({ getValue }) => {
        const value = getValue();
        if (value === null) {
          return null;
        }
        const sign = value > 0 ? '+' : '';
        return <span>{sign + value.toFixed(1)}</span>;
      },
    }),
  ]);

export function BoardTable({
  rows,
  drafted,
  onToggleDrafted,
  flags,
  onToggleFlag,
  sort,
  onSortChange,
  adpLoading,
  platform,
}: Readonly<BoardTableProps>) {
  const columns = useMemo(() => buildColumns(platform), [platform]);

  const currentSorting = sort === null ? [] : [sort];
  const table = useTable(
    {
      features,
      columns,
      data: rows,
      getRowId: (row) => row.player.id,
      state: { sorting: currentSorting },
      onSortingChange: (updater) => {
        const next = typeof updater === 'function' ? updater(currentSorting) : updater;
        const [first] = next;
        onSortChange(first === undefined ? null : { id: first.id, desc: first.desc });
      },
    },
    (state) => ({ sorting: state.sorting }),
  );

  return (
    <Table.ScrollContainer minWidth={760}>
      <Table stickyHeader highlightOnHover withTableBorder verticalSpacing="xs" horizontalSpacing="sm">
        <Table.Thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <Table.Tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <Table.Th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  {headerContent(header)}
                </Table.Th>
              ))}
            </Table.Tr>
          ))}
        </Table.Thead>
        <Table.Tbody>
          {table.getRowModel().rows.map((row) => (
            <BoardRow
              key={row.id}
              row={row}
              flag={flags.get(row.original.player.id)}
              isDrafted={drafted.has(row.original.player.id)}
              adpLoading={adpLoading}
              onToggleDrafted={onToggleDrafted}
              onToggleFlag={onToggleFlag}
            />
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
