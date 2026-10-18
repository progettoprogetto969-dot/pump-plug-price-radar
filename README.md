# Pump Plug Price Radar

### 🚗 DASHBOARD: Monitoraggio Carburanti, Elettrico e News Benzina

*Obiettivo:*

Creare una web app reattiva con mappa interattiva (OpenStreetMap, no API key) per il monitoraggio dei prezzi dei carburanti (dati MIMIT, con indicatori verde/giallo/rosso) e colonnine elettriche (API Open Charge Map). Il sistema deve includere un pulsante di download PWA e un riquadro per news quotidiane esclusivamente legate al mondo della benzina e del petrolio a livello globale.

---

### 🗺️ FUNZIONALITÀ DELLA MAPPA E INTERFACCIA:

1. *Switch Principale e Selezione Carburante:*

   - Inserire in alto due grandi pulsanti per alternare la vista: "Pompe di benzina" e "Colonnine elettriche".

   - Per le pompe di benzina, includere filtri rapidi per il tipo di carburante (Benzina, Diesel, GPL, Metano).

2. *Dati Geografici e Dettagli stazioni:*

   - Mostrare i distributori attivi nella porzione di territorio visualizzata con icone personalizzate.

   - Cliccando su ogni marcatore, aprire un pannello con i dettagli dei prezzi e un pulsante per le indicazioni stradali.

3. *Funzionalità Mobili e News Settoriali:*

   - Implementare nella parte superiore un pulsante dedicato per il download dell'applicazione su mobile (PWA).

   - Accanto al pulsante di download, aggiungere un riquadro grafico dedicato alle notizie quotidiane sulla benzina, prelevate aggregando flussi da ANSA, TG1, TG5, La7, Rai 24 Ore, Sky TG24 e altre testate internazionali.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://pump-plug-price-radar.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1b1f7ef6-ebf6-47d5-a6fa-9ac05861b538).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
