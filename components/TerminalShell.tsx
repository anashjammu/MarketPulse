import Link from "next/link";
import { Activity, BriefcaseBusiness, Landmark, Orbit, Rss, SunMedium } from "lucide-react";
import { TerminalStatus } from "@/components/TerminalStatus";
import { footerResearchDisclaimer } from "@/lib/research-engine";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/morning-market-brief", label: "Morning Market Brief", icon: SunMedium },
  { href: "/market-dashboard", label: "Market Dashboard", icon: Activity },
  { href: "/live-market-feed", label: "Articles", icon: Rss },
  { href: "/macro-dashboard", label: "Macro Dashboard", icon: Landmark },
  { href: "/portfolio-analysis", label: "Portfolio Analysis", icon: BriefcaseBusiness }
];

export function TerminalShell({
  active,
  title,
  subtitle,
  children
}: {
  active: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="terminal-grid min-h-screen p-2 text-terminal-text md:p-6">
      <div className="glass-panel mx-auto flex min-h-[calc(100vh-16px)] w-full min-w-0 max-w-[1540px] overflow-hidden rounded-2xl border border-white/[0.10] shadow-glow md:min-h-[calc(100vh-48px)]">
        <aside className="hidden w-64 shrink-0 border-r border-white/[0.08] bg-black/[0.10] lg:block">
          <div className="border-b border-white/[0.08] p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-terminal-cyan/20 bg-terminal-cyan/[0.08] text-terminal-cyan">
                <Orbit className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-bold tracking-tight text-terminal-text">StockerView</div>
                <div className="text-[11px] text-terminal-muted">Market research dashboard</div>
              </div>
            </div>
          </div>
          <nav className="space-y-1 p-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const selected = active === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-terminal-muted transition",
                    selected && "bg-terminal-cyan/[0.12] text-terminal-text shadow-[inset_0_0_0_1px_rgba(98,184,211,0.26)]",
                    !selected && "hover:bg-white/[0.05] hover:text-terminal-text"
                  )}
                >
                  {selected ? <span className="absolute left-0 h-5 w-1 rounded-full bg-terminal-cyan/80" /> : null}
                  <Icon className={cn("h-4 w-4", selected && "text-terminal-cyan")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-white/[0.08] bg-white/[0.02]">
            <div className="flex flex-col gap-5 px-5 py-6 md:flex-row md:items-center md:justify-between md:px-6">
              <div>
                <div className="inline-flex rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-1 text-xs font-medium text-terminal-muted">
                  StockerView
                </div>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-terminal-text md:text-[2rem]">{title}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-terminal-muted">{subtitle}</p>
              </div>
              <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
                <TerminalStatus />
              </div>
            </div>
            <nav className="grid grid-cols-2 border-t border-white/[0.08] bg-black/[0.04] lg:hidden">
              {navItems.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 border-r border-white/[0.08] px-3 py-2.5 text-xs text-terminal-muted last:border-r-0",
                      active === item.href && "bg-terminal-cyan/[0.10] text-terminal-text"
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5", active === item.href && "text-terminal-cyan")} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </header>

          <div className="terminal-scrollbar min-w-0 flex-1 overflow-y-auto p-4 md:p-5">
            {children}
            <footer className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 text-xs leading-5 text-terminal-muted">
              {footerResearchDisclaimer}
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}
