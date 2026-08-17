import { NewsItem } from "../types";

interface NewsPanelProps {
  articles: NewsItem[];
}

export default function NewsPanel({ articles }: NewsPanelProps) {
  if (!articles || articles.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase text-gray-500">
        News Articles ({articles.length})
      </h3>
      <div className="space-y-3">
        {articles.map((article, idx) => (
          <article
            key={idx}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-1 block text-sm font-semibold text-gray-900 underline hover:no-underline"
            >
              {article.headline}
            </a>
            <p className="mb-2 text-sm text-gray-700">{article.summary}</p>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span className="font-medium">{article.source}</span>
              <span>{formatDate(article.publishedAt)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}
