# Nagpur HealthGrid 🚨🏥

> **One emergency. One coordinated response.**

A hackathon MVP (Commit 1) for emergency healthcare coordination in Nagpur, Maharashtra, India.
Patients report an emergency in seconds and instantly discover Nagpur hospitals with available
emergency care, ICU, general and oxygen beds — with a case dashboard that tracks coordination.

## ⚠️ Demo data disclaimer

All hospital, bed-availability and case-coordination data in this MVP is **DEMO / SIMULATED**.
It is **not real-time** and must not be used for real medical decisions. For real emergencies in
India call **112** / **108**.

## Features (Commit 1)

- **Landing / emergency home** — hero with large emergency CTA, network summary, medical services, roadmap status.
- **Emergency request form** — patient name, age, emergency type, contact, location (browser geolocation
  with manual fallback), optional description, priority (Emergency / High / Normal), full validation,
  unique case ID (`NGP-1001`, `NGP-1002`, …).
- **Hospital discovery** — 12 demo Nagpur hospitals with emergency availability, ICU / general /
  oxygen beds, contact, distance, and a "View Details" page.
- **Filtering & search** — emergency available, ICU available, general bed available, area filter,
  plus free-text search by hospital name/area.
- **Emergency case dashboard** — case facts + workflow steps: Hospital (Searching → Selected),
  Bed (Checking → Available/Unavailable), and scaffolded Ambulance / Blood / Navigation steps
  marked "Not Assigned Yet" for later commits.
- **Location panel** — schematic map (no paid API), patient location, hospital pins, straight-line
  distances, "Use my location" (graceful fallback to manual entry), Google Maps deep links.
- **Ambulance coordination (Commit 2)** — demo Nagpur fleet with Available/Assigned/Busy/Offline
  states, deterministic matching (availability, ALS-for-Emergency, proximity), assignment + ETA
  persisted with the case.
- **Blood-bank availability (Commit 2)** — demo Nagpur blood banks with per-group stock, search by
  blood group / units / distance, deterministic selection and simulated reservation.
- **Resource allocation (Commit 2)** — deterministic, explainable coordination: priority affects
  ORDER only (no clinical advice), with a "Why these resources?" panel on the dashboard.

## Tech stack

- [Vite](https://vitejs.dev/) + [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) (strict)
- [React Router 6](https://reactrouter.com/)
- Plain CSS design system (no UI framework), mobile-first responsive
- [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) (unit + integration)

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | Strict TypeScript check |
| `npm test` | Run all unit/integration tests once |
| `npm run test:watch` | Watch mode |

## Project structure

```
src/
├── components/     # Reusable UI (Header, HospitalCard, LocationPanel, AllocationPanel, ui primitives)
├── constants/      # Emergency types, priorities, Nagpur areas, map helpers
├── data/           # DEMO datasets: hospitals, ambulances, blood banks (swap with real feeds later)
├── models/         # Domain types — the contract Commit 3 will extend
├── pages/          # Route pages (home, form, confirmation, hospitals, detail, cases, dashboard)
├── services/       # emergency, hospital, location, ambulance, bloodBank, resourceAllocation (+ tests)
├── styles.css      # Design system
└── test/           # Vitest setup
```

## Roadmap

- **Commit 2 (done):** ambulance coordination, blood-bank availability, emergency resource
  allocation — all plugged into the existing `EmergencyCase` model as new services + dashboard
  steps.
- **Commit 3:** AI emergency assistant, smart coordination, real-time communication, final
  polished dashboard.
