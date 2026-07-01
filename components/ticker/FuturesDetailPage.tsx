import { InteractivePriceChart } from "@/components/InteractivePriceChart";
import { LocalTime } from "@/components/LocalTime";
import { MetricCard } from "@/components/MetricCard";
import { Panel } from "@/components/Panel";
import { TerminalShell } from "@/components/TerminalShell";
import { TickerLink } from "@/components/TickerLink";
import { getFuturesPageData } from "@/lib/futures-service";
import type { NewsItem } from "@/lib/news-service";

export async function FuturesDetailPage({ symbol: rawSymbol }: { symbol: string }) {
  const symbol = decodeURIComponent(rawSymbol).trim().toUpperCase();
  const pageData = await getFuturesPageData(symbol);

  if (!pageData) {
    return (
      <TerminalShell active="" title="Future not found" subtitle="The requested futures symbol could not be resolved.">
        <Panel title="Future not found">
          <div className="rounded-lg border border-white/10 bg-white/[0.045] p-6 text-sm text-terminal-muted">Ticker not found</div>
        </Panel>
      </TerminalShell>
    );
  }

  const { overview, profile, chart, sessionSnapshot, contractSpecs, marketDrivers, relatedMarkets, feedItems } = pageData;

  return (
    <TerminalShell
      active=""
      title={`${profile.symbol} Futures`}
      subtitle="Futures contract view with chart, session data, contract specs, market drivers, related markets, and news."
    >
      <div className="grid gap-3">
        <Panel title={`${profile.symbol} — ${profile.name}`}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Last Price" value={overview.price > 0 ? `$${overview.price.toFixed(2)}` : "Data unavailable"} change={overview.price > 0 ? overview.change : undefined} />
            <MetricCard label="Asset Type" value="Future" detail={profile.category} />
            <MetricCard label="Contract" value={profile.contractCode} detail={profile.contractMonth} />
            <MetricCard label="Exchange" value={profile.exchange} />
          </div>
        </Panel>

        <InteractivePriceChart
          title={`${profile.symbol} Futures Chart`}
          symbol={profile.symbol}
          candlesByTimeframe={chart}
          currentPrice={overview.price}
          timezoneLabel="Futures chart times shown in your local timezone."
        />

        <Panel title="Session Snapshot">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {sessionSnapshot.map((item) => (
              <InfoTile key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
        </Panel>

        <div className="grid gap-3 xl:grid-cols-[0.95fr_1.05fr]">
          <Panel title="Contract Specs">
            <div className="grid gap-2 sm:grid-cols-2">
              {contractSpecs.map((item) => (
                <InfoTile key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          </Panel>

          <Panel title="Market Drivers">
            <div className="grid gap-2">
              {marketDrivers.map((driver) => (
                <div key={driver} className="rounded-lg border border-white/10 bg-white/[0.045] p-3 text-sm leading-6 text-terminal-text">
                  <span className="mr-2 text-terminal-cyan">-</span>
                  {driver}
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Panel title="Related Markets">
          <div className="flex flex-wrap gap-2">
            {relatedMarkets.map((related) => (
              <TickerLink key={related} symbol={related} />
            ))}
          </div>
        </Panel>

        <Panel title="Futures Feed" action={<span className="font-mono text-xs text-terminal-muted">Times shown in your local timezone</span>}>
          <div className="grid gap-2">
            {feedItems.map((item) => (
              <FuturesFeedCard key={item.id} item={item} />
            ))}
          </div>
        </Panel>

        <div className="px-1 text-xs leading-5 text-terminal-muted">
          <p>Futures are leveraged products and can involve substantial risk. This page is for research and education only, not trading advice.</p>
        </div>
      </div>
    </TerminalShell>
  );
}

function FuturesFeedCard({ item }: { item: NewsItem }) {
  const impact = item.impactLevel ?? "Medium";

  return (
    <article className="rounded-lg border border-white/10 bg-white/[0.045] p-3">
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-terminal-muted">
        <LocalTime value={publishedAtForDisplay(item.publishedAt)} />
        <span>/</span>
        <span>{item.sourceName}</span>
        <span>/</span>
        <span>{item.category}</span>
        <span className={impact === "High" ? "text-terminal-red" : "text-terminal-amber"}>{impact}</span>
      </div>
      <h3 className="mt-2 text-sm font-semibold leading-5 text-terminal-text">{item.headline}</h3>
      <p className="mt-2 text-xs leading-5 text-terminal-muted">{item.snippet}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        {item.relatedTickers.map((symbol) => (
          <TickerLink key={symbol} symbol={symbol} />
        ))}
        <a href={item.url} target="_blank" rel="noreferrer" className="text-terminal-cyan underline-offset-4 hover:underline">
          Read source
        </a>
      </div>
    </article>
  );
}

function InfoTile({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.045] p-3">
      <div className="font-mono text-xs text-terminal-muted">{label}</div>
      <div className="mt-2 text-lg font-semibold text-terminal-text">{value || "-"}</div>
    </div>
  );
}

function publishedAtForDisplay(time: string) {
  if (time.includes("T")) {
    return time;
  }

  const [hour = "0", minute = "0"] = time.replace(" PT", "").split(":");
  return `2026-06-27T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:00-07:00`;
}
