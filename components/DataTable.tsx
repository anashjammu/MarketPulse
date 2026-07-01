import { cn } from "@/lib/utils";

type Align = "left" | "right";

export type Column<T> = {
  key: string;
  header: string;
  align?: Align;
  render: (row: T) => React.ReactNode;
};

export function DataTable<T>({ columns, rows }: { columns: Column<T>[]; rows: T[] }) {
  return (
    <div className="terminal-scrollbar w-full min-w-0 max-w-full overflow-x-auto rounded-lg border border-white/[0.08] bg-white/[0.015]">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] bg-white/[0.03] text-xs text-terminal-muted">
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn("whitespace-nowrap px-3 py-2.5 font-semibold", column.align === "right" ? "text-right" : "text-left")}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.035]">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn("px-3 py-3 align-top", column.align === "right" ? "text-right" : "text-left")}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
