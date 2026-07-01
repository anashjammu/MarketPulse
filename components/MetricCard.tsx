import { cn, formatChange } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  change,
  detail,
  selected,
  onClick
}: {
  label: React.ReactNode;
  value: string;
  change?: number;
  detail?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const positive = (change ?? 0) >= 0;
  const className = cn(
    "min-w-0 rounded-lg border border-white/[0.10] bg-white/[0.035] p-4 transition hover:border-white/[0.18] hover:bg-white/[0.05]",
    selected && "border-terminal-cyan/40 bg-terminal-cyan/[0.09]"
  );
  const content = (
    <>
      <div className="truncate text-xs font-medium text-terminal-muted">{label}</div>
      <div className="mt-2 flex min-w-0 items-end justify-between gap-3">
        <div className="min-w-0 truncate text-2xl font-semibold tracking-tight text-terminal-text">{value}</div>
        {typeof change === "number" ? (
          <div className={cn("font-mono text-sm", positive ? "text-terminal-green" : "text-terminal-red")}>
            {formatChange(change)}
          </div>
        ) : null}
      </div>
      {detail ? <div className="mt-2 text-xs text-terminal-muted">{detail}</div> : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={selected} className={cn(className, "text-left")}>
        {content}
      </button>
    );
  }

  return (
    <div className={className}>
      {content}
    </div>
  );
}
