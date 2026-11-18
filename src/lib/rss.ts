import "server-only";

export type NewsItem = {
  source: string;
  title: string;
  summary: string;
  url: string;
};

const FEEDS = [
  { source: "BBC Science & Environment", url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml" },
  { source: "BBC Technology", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
  { source: "BBC Health", url: "https://feeds.bbci.co.uk/news/health/rss.xml" },
  { source: "The Guardian Environment", url: "https://www.theguardian.com/environment/rss" },
  { source: "The Guardian Science", url: "https://www.theguardian.com/science/rss" },
];

function stripHtml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? stripHtml(m[1]) : "";
}

export async function fetchRecentNews(limitPerFeed = 5): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const res = await fetch(f.url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return [];
      const xml = await res.text();
      const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
      return items.slice(0, limitPerFeed).map((item) => ({
        source: f.source,
        title: tag(item, "title"),
        summary: tag(item, "description").slice(0, 450),
        url: tag(item, "link"),
      }));
    })
  );

  const perFeed = results
    .filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === "fulfilled")
    .map((r) => r.value.filter((x) => x.title && x.summary && x.url));

  // Trộn xen kẽ các nguồn báo (BBC & Guardian) để 5–15 bài đầu luôn đa dạng chủ đề
  const out: NewsItem[] = [];
  const maxLen = Math.max(0, ...perFeed.map((list) => list.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of perFeed) {
      if (list[i]) out.push(list[i]);
    }
  }
  return out;
}
