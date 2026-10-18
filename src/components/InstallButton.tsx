import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type BIP = Event & { prompt: () => Promise<void> };

export function InstallButton() {
  const [evt, setEvt] = useState<BIP | null>(null);
  const [hint, setHint] = useState(false);
  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIP);
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  return (
    <div className="relative">
      <button
        className="btn-install"
        onClick={async () => {
          if (evt) {
            await evt.prompt();
            setEvt(null);
          } else setHint((v) => !v);
        }}
      >
        <Download className="h-5 w-5" /> Scarica l'app
      </button>
      {hint && (
        <div className="absolute left-0 top-full z-[1200] mt-2 w-64 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
          <b>iPhone:</b> tocca Condividi → "Aggiungi a Home".
          <br />
          <b>Android:</b> menu ⋮ → "Installa app" / "Aggiungi a schermata Home".
        </div>
      )}
    </div>
  );
}
