import { LiveMarketFeedHub } from "@/components/LiveMarketFeedHub";
import { TerminalShell } from "@/components/TerminalShell";
import { fetchEconomicCalendar, fetchMarketNewsBundle, normalizeArticle, normalizeFeedItem, summarizeNewsWithAI } from "@/lib/news-service";

export default async function LiveMarketFeedPage() {
  const [newsBundle, calendarItems] = await Promise.all([
    fetchMarketNewsBundle({ range: "today", limit: 100 }),
    fetchEconomicCalendar()
  ]);
  const rawNews = newsBundle.rows;
  const feedItems = rawNews.map(normalizeFeedItem);
  const breakingItems = feedItems.slice(0, 1);
  const articleItems = rawNews.map(normalizeArticle);
  const marketBrief = await summarizeNewsWithAI(rawNews);

  return (
    <TerminalShell
      active="/live-market-feed"
      title="Articles"
      subtitle="Latest market-related articles"
    >
      <LiveMarketFeedHub
        feedItems={feedItems}
        breakingItems={breakingItems}
        articleItems={articleItems}
        calendarItems={calendarItems}
        marketBrief={marketBrief}
        newsStatus={{
          source: newsBundle.source,
          status: newsBundle.status,
          delay: newsBundle.delay,
          updatedAt: newsBundle.updatedAt,
          range: "Today",
          count: rawNews.length
        }}
      />
    </TerminalShell>
  );
}
