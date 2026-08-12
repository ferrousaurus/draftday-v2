import { Skeleton, Table, Tooltip } from "@mantine/core";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortFn,
} from "@tanstack/react-table";
import type { CSSProperties } from "react";
import type { BoardPlayer } from "../lib/types.ts";

export type BoardSort = { id: string; desc: boolean } | null;

type BoardTableProps = {
  rows: BoardPlayer[];
  drafted: ReadonlySet<string>;
  onToggleDrafted: (playerId: string) => void;
  sort: BoardSort;
  onSortChange: (sort: BoardSort) => void;
  adpLoading: boolean;
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
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  };
}

const helper = createColumnHelper<typeof features, BoardPlayer>();

const columns = helper.columns([
  helper.accessor((row) => row.adp, {
    id: "adp",
    header: "ADP",
    sortFn: nullableSortFn((r) => r.adp),
    cell: ({ getValue, row }) => {
      const value = getValue();
      const source = row.original.adpSource;
      if (value === null) return null;
      return source === "consensus" ? <ConsensusAdp value={value} /> : <span>{value.toFixed(1)}</span>;
    },
  }),
  helper.accessor((row) => row.player.name, {
    id: "name",
    header: "Name",
    cell: ({ getValue }) => getValue(),
  }),
  helper.accessor((row) => row.player.position, {
    id: "position",
    header: "Pos",
    cell: ({ getValue }) => getValue(),
  }),
  helper.accessor((row) => row.player.team, {
    id: "team",
    header: "Team",
    cell: ({ getValue }) => getValue(),
  }),
  helper.accessor((row) => row.projectedPoints, {
    id: "projectedPoints",
    header: "Proj Pts",
    cell: ({ getValue }) => getValue().toFixed(1),
  }),
  helper.accessor((row) => row.vorp, {
    id: "vorp",
    header: "VORP",
    cell: ({ getValue }) => getValue().toFixed(1),
  }),
  helper.accessor((row) => row.xadp, {
    id: "xadp",
    header: "xADP",
    sortFn: nullableSortFn((r) => r.xadp),
    cell: ({ getValue }) => {
      const value = getValue();
      if (value === null) return null;
      return <span>{value.toFixed(1)}</span>;
    },
  }),
  helper.accessor((row) => row.delta, {
    id: "delta",
    header: "Delta",
    sortFn: nullableSortFn((r) => r.delta),
    cell: ({ getValue }) => {
      const value = getValue();
      if (value === null) return null;
      const sign = value > 0 ? "+" : "";
      return <span>{sign + value.toFixed(1)}</span>;
    },
  }),
]);

function ConsensusAdp({ value }: { value: number }) {
  return (
    <Tooltip label="Consensus ADP — not available for this platform" withArrow>
      <span>
        {value.toFixed(1)}
        <sup>†</sup>
      </span>
    </Tooltip>
  );
}

function sortIndicator(sorted: false | "asc" | "desc"): string {
  if (sorted === "asc") return " ▲";
  if (sorted === "desc") return " ▼";
  return "";
}

function rowAccent(isDrafted: boolean, steal: boolean, reach: boolean): CSSProperties {
  if (isDrafted) return { opacity: 0.45, textDecoration: "line-through" };
  if (steal) return { backgroundColor: "var(--mantine-color-teal-9)" };
  if (reach) return { opacity: 0.6 };
  return {};
}

export function BoardTable({ rows, drafted, onToggleDrafted, sort, onSortChange, adpLoading }: BoardTableProps) {
  const currentSorting = sort === null ? [] : [sort];
  const table = useTable(
    {
      features,
      columns,
      data: rows,
      getRowId: (row) => row.player.id,
      state: { sorting: currentSorting },
      onSortingChange: (updater) => {
        const next = typeof updater === "function" ? updater(currentSorting) : updater;
        const first = next?.[0];
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
                  style={{ cursor: "pointer", userSelect: "none" }}
                >
                  <table.FlexRender header={header} />
                  {sortIndicator(header.column.getIsSorted())}
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
                style={{ cursor: "pointer", ...accent }}
              >
                {row.getAllCells().map((cell) => (
                  <Table.Td key={cell.id}>
                    {cell.column.id === "adp" && adpLoading ? (
                      <Skeleton height={14} width={32} />
                    ) : (
                      <table.FlexRender cell={cell} />
                    )}
                  </Table.Td>
                ))}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
