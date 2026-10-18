import { useQuery } from "@tanstack/react-query";
import { Newspaper } from "lucide-react";
import { getNews } from "@/lib/data.functions";

export function NewsPanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["news"],
    queryFn: () => getNews(),
    staleTime: 15 * 60 * 1000,
  });
  return (
    <section className="news-panel">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Newspaper className="h-4 w-4 text-primary" />
        <h2 className="font-display text-sm font-bold uppercase tracking-wider">Notizie benzina & petrolio</h2>
        <span className="ml-auto text-[10px] text-muted-foreground">ANSA · TG1 · TG5 · La7 · Sole 24 Ore · Sky TG24 · intl.</span>
      </header>
      <ul className="news-ticker">
        {isLoading && <li className="px-4 py-3 text-sm text-muted-foreground">Caricamento notizie…</li>}
        {isError && <li className="px-4 py-3 text-sm text-destructive">Notizie non disponibili.</li>}
        {data?.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">Nessuna notizia oggi.</li>}
        {data?.map((n) => (
          <li key={n.link}>
            <a href={n.link} target="_blank" rel="noreferrer" className="news-item">
              <span className="news-source">{n.source}</span>
              <span className="line-clamp-2">{n.title}</span>
              {n.date && (
                <span className="text-[10px] text-muted-foreground">
                  {new Date(n.date).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
