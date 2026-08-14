import { Badge, Skeleton, Table } from '@mantine/core';
import type { BoardPlayer, Platform } from '../lib/types.ts';
import { type CSSProperties, useMemo } from 'react';
import {
  type Cell,
  FlexRender,
  type Header,
  type SortFn,
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { ConsensusAdp } from './ConsensusAdp.tsx';
import { positionBadgeColor } from '../lib/position-colors.ts';

export type BoardSort = { id: string; desc: boolean } | null;

type BoardTableProps = {
  rows: BoardPlayer[];
  drafted: ReadonlySet<string>;
  onToggleDrafted: (playerId: string) => void;
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
function nullableSortFn(getValue: (row: BoardPlayer) => number | null): SortFn<typeof features, BoardPlayer> {
  return (rowA, rowB) => {
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
  };
}

const helper = createColumnHelper<typeof features, BoardPlayer>();

function sortIndicator(sorted: false | 'asc' | 'desc'): string {
  if (sorted === 'asc') {
    return ' ▲';
  }
  if (sorted === 'desc') {
    return ' ▼';
  }
  return '';
}

function rowAccent(isDrafted: boolean, steal: boolean, reach: boolean): CSSProperties {
  if (isDrafted) {
    return { opacity: 0.45, textDecoration: 'line-through' };
  }
  if (steal) {
    return { fontWeight: 'bolder', fontStyle: 'italic' };
  }
  if (reach) {
    return { fontWeight: 'lighter' };
  }
  return {};
}

function headerContent(header: Header<typeof features, BoardPlayer>) {
  return (
    <>
      <FlexRender header={header} />
      {sortIndicator(header.column.getIsSorted())}
    </>
  );
}

function cellContent(cell: Cell<typeof features, BoardPlayer>, adpLoading: boolean) {
  return cell.column.id === 'adp' && adpLoading ? <Skeleton height={14} width={32} /> : <FlexRender cell={cell} />;
}

export function BoardTable({
  rows,
  drafted,
  onToggleDrafted,
  sort,
  onSortChange,
  adpLoading,
  platform,
}: BoardTableProps) {
  const columns = useMemo(
    () =>
      helper.columns([
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
      ]),
    [platform],
  );

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
          {table.getRowModel().rows.map((row) => {
            const isDrafted = drafted.has(row.original.player.id);
            const accent = rowAccent(isDrafted, row.original.steal, row.original.reach);
            return (
              <Table.Tr
                key={row.id}
                onClick={() => onToggleDrafted(row.original.player.id)}
                style={{ cursor: 'pointer', ...accent }}
              >
                {row.getAllCells().map((cell) => (
                  <Table.Td key={cell.id}>{cellContent(cell, adpLoading)}</Table.Td>
                ))}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
