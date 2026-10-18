import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Newspaper } from "lucide-react";
import { getNews } from "@/lib/data.functions";
import fallback from "@/assets/news-fallback.jpg";

export function NewsPanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["news"],
    queryFn: () => getNews(),
    staleTime: 15 * 60 * 1000,
  });
  return (
    <section id="notizie" className="px-3 pb-10 pt-6">
      <header className="mb-4 flex flex-wrap items-end gap-2">
        <Newspaper className="h-6 w-6 text-primary" />
        <h2 className="font-display text-2xl font-extrabold">Notizie del giorno su benzina e petrolio</h2>
        <span className="text-xs text-muted-foreground">
          Solo testate italiane: ANSA · TG1/Rai News · TG5/Tgcom24 · La7 · Sky TG24 · Il Sole 24 Ore · Repubblica · Corriere
        </span>
      </header>
      {isLoading && <p className="text-sm text-muted-foreground">Caricamento notizie…</p>}
      {isError && <p className="text-sm text-destructive">Notizie non disponibili al momento.</p>}
      {data?.length === 0 && <p className="text-sm text-muted-foreground">Nessuna notizia sul tema oggi.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data?.map((n) => (
          <article key={n.link} className="news-card">
            <img
              src={n.image ?? fallback}
              onError={(e) => ((e.currentTarget as HTMLImageElement).src = fallback)}
              alt=""
              loading="lazy"
              className="aspect-video w-full object-cover"
            />
            <div className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="news-source">{n.source}</span>
                {n.date && (
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(n.date).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
              <h3 className="font-display text-base font-bold leading-snug">{n.title}</h3>
              <a href={n.link} target="_blank" rel="noreferrer" className="news-link">
                Leggi l'articolo completo <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
