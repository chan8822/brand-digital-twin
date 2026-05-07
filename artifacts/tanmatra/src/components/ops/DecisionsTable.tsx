import { useMemo, useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown } from "lucide-react";

export interface DecisionRow {
  id: string;
  actionType: string;
  riskScore: number;
  approved: boolean;
  decidedAt: string;
}

interface Props {
  rows: DecisionRow[];
}

export default function DecisionsTable({ rows }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "decidedAt", desc: true }]);

  const columns = useMemo<ColumnDef<DecisionRow>[]>(
    () => [
      {
        accessorKey: "actionType",
        header: ({ column }) => (
          <button
            type="button"
            className="flex items-center gap-1 font-medium"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Action <ArrowUpDown className="w-3 h-3 opacity-60" />
          </button>
        ),
        cell: ({ getValue }) => (
          <span className="capitalize">{String(getValue()).replace(/_/g, " ")}</span>
        ),
      },
      {
        accessorKey: "riskScore",
        header: ({ column }) => (
          <button
            type="button"
            className="flex items-center gap-1 font-medium"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Risk <ArrowUpDown className="w-3 h-3 opacity-60" />
          </button>
        ),
        cell: ({ getValue }) => {
          const v = getValue<number>();
          const tone = v >= 0.7 ? "text-red-400" : v >= 0.4 ? "text-amber-400" : "text-emerald-400";
          return <span className={`tabular-nums ${tone}`}>{v.toFixed(2)}</span>;
        },
      },
      {
        accessorKey: "approved",
        header: "Decision",
        cell: ({ getValue }) => {
          const ok = getValue<boolean>();
          return (
            <Badge
              variant="outline"
              className={`text-[10px] ${
                ok ? "border-green-500/30 text-green-400" : "border-red-500/30 text-red-400"
              }`}
            >
              {ok ? "Approved" : "Rejected"}
            </Badge>
          );
        },
      },
      {
        accessorKey: "decidedAt",
        header: ({ column }) => (
          <button
            type="button"
            className="flex items-center gap-1 font-medium"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            When <ArrowUpDown className="w-3 h-3 opacity-60" />
          </button>
        ),
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">
            {new Date(getValue<string>()).toLocaleTimeString()}
          </span>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No decisions yet.</p>;
  }

  return (
    <div className="max-h-56 overflow-auto rounded-md border border-border/40">
      <table className="w-full text-xs">
        <thead className="bg-muted/30 sticky top-0">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} className="text-left px-2 py-1.5">
                  {h.isPlaceholder
                    ? null
                    : flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-t border-border/20 hover:bg-muted/20">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-2 py-1.5">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
