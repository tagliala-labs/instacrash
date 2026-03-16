# 📱🚗 Instacrash — Infraction Tracker

A mobile-first web app for tracking smartphone use while driving. Record male and female driver infractions in real time with live stats, charts, and session history.

**Live demo:** https://tagliala-labs.github.io/instacrash/

---

## Features

- **Live session tracking** — start a timer and tap a button for every vehicle you observe
- **Gender breakdown** — separate counters for male and female drivers, with and without a phone
- **Live doughnut chart** — real-time infraction breakdown by category
- **Combo system** — tracks consecutive infractions with a 🔥 flame badge
- **Session history** — saves all past measurements with detailed charts and stats
- **All-time totals** — aggregate infraction rates across all saved sessions
- **Sound effects** — optional police-siren audio cue on each infraction (Web Audio API)
- **Bilingual UI** — full Italian and English support, auto-detected from browser locale
- **Help modal** — in-app instructions in both Italian and English
- **PWA-ready** — works offline, installable on mobile

---

## How to use / Come funziona

### 🇬🇧 English

1. Tap **Start** to begin a new measurement session — the timer will start counting.
2. For each vehicle you observe, tap the appropriate button:
   - 😊 **Male driver** / 😊 **Female driver** — driver is not using a phone.
   - 📱 **Male + phone** / 📱 **Female + phone** — driver is using a phone (infraction).
3. Use the **↺ Undo** button to remove the last recorded entry.
4. Tap **Pause** to pause the timer, then **Resume** to continue.
5. Tap the **🏁 End** button to save the session and view the results.
6. Tap any saved session in the history to see its detailed breakdown and chart.
7. Use the 🔊 icon to toggle sound effects and **EN / IT** to switch the interface language.

### 🇮🇹 Italiano

1. Premi **Inizia** per avviare una nuova sessione di misurazione — il timer inizierà a scorrere.
2. Per ogni veicolo osservato, premi il pulsante appropriato:
   - 😊 **Guida uomo** / 😊 **Guida donna** — il conducente non usa il telefono.
   - 📱 **Uomo + telefono** / 📱 **Donna + telefono** — il conducente sta usando il telefono (infrazione).
3. Usa il pulsante **↺ Annulla** per rimuovere l'ultima voce registrata.
4. Premi **Pausa** per mettere in pausa il timer, poi **Riprendi** per continuare.
5. Premi il pulsante **🏁 Fine** per salvare la sessione e visualizzare i risultati.
6. Tocca una sessione salvata nella cronologia per vedere il dettaglio e il grafico.
7. Usa l'icona 🔊 per attivare/disattivare i suoni e **EN / IT** per cambiare la lingua dell'interfaccia.

---

## Tech stack

| Tool                                          | Purpose                   |
| --------------------------------------------- | ------------------------- |
| [React 19](https://react.dev/)                | UI framework              |
| [TypeScript](https://www.typescriptlang.org/) | Type safety               |
| [Vite](https://vitejs.dev/)                   | Build tool & dev server   |
| [Tailwind CSS 4](https://tailwindcss.com/)    | Utility-first styling     |
| [Chart.js](https://www.chartjs.org/)          | Doughnut charts           |
| Web Audio API                                 | Synthesised sound effects |

---

## Development

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:3000)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Check code formatting
npm run lint

# Auto-format code
npm run format
```

---

## License

MIT
