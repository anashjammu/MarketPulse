import { cn } from "@/lib/utils";

export function Panel({
  title,
  action,
  children,
  className
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-white/[0.09] bg-white/[0.035] shadow-[0_10px_28px_rgba(0,0,0,0.12)]", className)}>
      <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3.5">
        <h2 className="text-sm font-semibold tracking-[-0.01em] text-terminal-text">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
