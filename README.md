# Nagpur HealthGrid 🚨🏥

> **One emergency. One coordinated response.**

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/rodrixdcruz/naghealthgrid)

Nagpur HealthGrid is an emergency healthcare coordination platform that organizes ambulance,
hospital, resource, blood-bank and navigation workflows around a single emergency case.

▶ **Try it live:** [https://healthgrid-frontend.onrender.com](https://healthgrid-frontend.onrender.com)
(deployed on Render · emergency cases stored in a shared [Neon](https://neon.tech) Postgres database —
cases created on one device appear on every other device. Free tier sleeps after inactivity;
first load may take ~30 s.)

## The problem

In an emergency, patients and families bounce between disconnected tools: one app to find a
hospital, another for an ambulance, phone calls for blood banks — with no shared state between
any of them. Hospital finders list facilities; none of them **run the emergency response**. In
the critical first minutes, information exists but coordination doesn't.

## The solution: Emergency Case Orchestration

Nagpur HealthGrid is **not a hospital finder, ambulance finder, or blood-bank finder**. It is an
**Emergency Case Orchestrator**: every report creates a single case (`NGP-1001`, `NGP-1002`, …)
that becomes the backbone for the entire response. Each workflow step — hospital matching, bed
confirmation, ambulance dispatch, blood reservation — reads from and writes to that one case, so
the whole response stays in sync on one dashboard.

**What makes it different from a finder app:**

| Finder apps | Nagpur HealthGrid |
| --- | --- |
| List hospitals/ambulances/blood banks | Coordinates all of them around one case |
| You do the calling and tracking | The case tracks every step's status automatically |
| Static directory data | Explainable allocation: *why* each resource was chosen |
| No memory between steps | Every step persists against the same case ID |

## Core workflow

```
Emergency Request → Coordination → Ambulance → Hospital/Resource → Blood/Services → Navigation
      ✅ live          ✅ live        ✅ live         ✅ live             ✅ live         🔜 Commit 3
```

Priority drives the **coordination order only** (never clinical urgency): Emergency/High cases
dispatch the ambulance first, Normal cases secure a hospital bed first. Every allocation shows
its reasoning on the dashboard ("Why these resources?") — deterministic, explainable, and
explicitly **not** clinical advice.

## ⚠️ Demo data disclaimer

All hospital, ambulance and blood-bank data is **DEMO / SIMULATED**. There is **no real-time bed
data, no live ambulance GPS, and no government or hospital-network integration** — those require
verified APIs and are roadmap items, not features. Nothing here must be used for real medical
decisions. For real emergencies in India call **112** / **108**.

### Live (real) data sources that ARE integrated

Two free, key-less OpenStreetMap-based services provide real data today:

- **OSRM** — real **driving distance & duration** for the Navigation step, the location panel's
  "Nearby hospitals" list, hospital detail pages, AND **hospital matching**:
  `selectBestHospital` ranks candidates by live road time from the patient's coordinates
  (fetched during the search stage, cached, capped at 4 s) instead of straight-line distance —
  falling back to the haversine heuristic offline or when OSRM is unreachable.
  Instances are configurable via `VITE_OSRM_BASE_URL` (comma-separated, tried in order, with a
  60 s per-instance cool-off on failure); unset, it uses the public `router.project-osrm.org`
  demo server as final safety net. Self-hosting instructions live in `.env.example`.
- **Nominatim** (`nominatim.openstreetmap.org`) — real **reverse geocoding**: "use my location"
  produces a genuine area label (road / suburb / city) instead of the nearest-demo-area guess.

Both are cached in `localStorage`, rate-limit friendly (single-flight, ≤200 entries), and degrade
gracefully to the original heuristics when unreachable. Everything else (beds, ambulances, blood
stock) remains simulated.

## Implemented features

- **Emergency request intake** — validated form (patient name, age, emergency type, 10-digit
  contact, location, optional description & blood group, priority) generating a unique case ID
  (`NGP-1001`, `NGP-1002`, …) with a confirmation page.
- **Hospital discovery** — 12 demo Nagpur hospitals with emergency availability, ICU / general /
  oxygen beds, contact, distance, and detail pages. Filter by emergency/ICU/general-bed/area plus
  name-area search.
- **Ambulance coordination** — 10-unit demo Nagpur fleet (ALS / BLS / PTV) with Available,
  Assigned, Busy and Offline states; deterministic dispatch matching (availability, ALS-for-
  Emergency, proximity) with simulated ETA, persisted against the case. Once assigned, the case
  dashboard's map draws the unit's **route to the hospital as a dashed OSRM-geometry polyline
  with an animated marker** — the movement is demo simulation (no live GPS), the road geometry
  is real, and the animation progress is **persisted per case**: re-opening a dashboard resumes
  the drive mid-route (or clamps to the destination if the traversal finished) instead of restarting.
  Hospital pins cluster at low zoom; clicking a **cluster bubble opens a picker popup
  listing the hidden hospitals by name** (with a "Zoom to area" action) instead of the default
  spiderfy, so a hospital can be chosen — and its directions drawn — without zooming in.
- **Blood-bank availability** — 8 demo Nagpur blood banks covering all 8 blood groups; search by
  group, unit count and distance; deterministic selection with a simulated reservation on the case.
- **Emergency resource allocation** — deterministic, explainable coordination combining priority,
  type, location and resource availability into a plan whose reasons render on the dashboard.
- **Emergency case dashboard** — live workflow steps (Hospital → Bed → Ambulance → Blood →
  Navigation) with status transitions, an allocation-explanation panel, and a location panel
  interactive Leaflet map with dark-tile theme, clustered hospital pins (with a tiny zoom/cluster
  debug overlay in the corner), clickable directions
  (blue OSRM route + live ETA panel), browser geolocation with manual-area fallback, and
  Google Maps deep links).
- **Persistence** — cases and fleet state survive reloads via localStorage; every service is
  swap-ready for real APIs later.
- **72 automated tests** (Vitest + Testing Library) covering services, matching, persistence and
  the dashboard workflow, plus live-API contract smoke tests (`npm run test:smoke`) that guard
  against OSRM/Nominatim response-shape changes.

## Demo

### Screenshots

All screenshots were captured from the running app with **simulated demo data** — the case shown
(NGP-1001) is a seeded example, not a live emergency.

| | |
| --- | --- |
| ![Landing page with emergency CTA and network summary](docs/screenshots/01-landing.png) | ![Emergency request form with priority and blood group](docs/screenshots/02-emergency-form.png) |
| *Landing — one emergency, one coordinated response.* | *Emergency request form with priority & blood group.* |
| ![Hospital discovery with filters](docs/screenshots/03-hospitals.png) | ![Emergency case dashboard with full workflow](docs/screenshots/04-case-dashboard.png) |
| *Hospital discovery — filters, beds, distance.* | *Case dashboard — Hospital → Bed → Ambulance → Blood orchestrated.* |
| ![Case dashboard on mobile](docs/screenshots/05-case-dashboard-mobile.png) | ![Landing on mobile](docs/screenshots/06-mobile-home.png) |
| *Mobile case dashboard (390px).* | *Mobile landing (390px).* |

### Run it yourself

**Live demo:** [healthgrid-frontend.onrender.com](https://healthgrid-frontend.onrender.com) ·
API: [healthgrid-api.onrender.com/api/health](https://healthgrid-api.onrender.com/api/health)

```bash
npm install && npm run dev   # → http://localhost:5173
```

Suggested walkthrough: report an emergency (try priority **Emergency** with blood group **O+**)
→ watch the case dashboard progress Hospital → Bed → Ambulance → Blood → revisit **My Cases**.

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

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | Strict TypeScript check |
| `npm test` | Run all unit/integration tests once (hermetic — no network) |
| `npm run test:watch` | Watch mode |
| `npm run test:smoke` | Live-API contract checks: one real request each to OSRM & Nominatim; skips when unreachable, fails on response-shape drift |

## Project structure

```
src/
├── components/     # Reusable UI (Header, HospitalCard, LocationPanel, AllocationPanel, ui primitives)
├── constants/      # Emergency types, priorities, Nagpur areas, map helpers
├── data/           # DEMO datasets: hospitals, ambulances, blood banks (swap with real feeds later)
├── models/         # Domain types — the contract between UI and services
├── pages/          # Route pages (home, form, confirmation, hospitals, detail, cases, dashboard)
├── services/       # emergency, hospital, location, ambulance, bloodBank, resourceAllocation (+ tests)
├── styles.css      # Design system
└── test/           # Vitest setup
```

**Architecture note:** the layering is deliberately simple — UI components render from typed
models and call services; services own all business logic and are the only place demo datasets
are imported, so each one can be swapped for a real API without touching the UI. (No architecture
diagram yet — intentionally, until the system earns one.)

## Roadmap

- **Commit 3:** AI emergency assistant, smart coordination, real-time communication, navigation,
  and the final polished dashboard.

## Team

- **Rodrix Dcruz**
- **Rina Neware**
- **Bhushan Lede**
- **Sujal Khobragade**

---

For real emergencies in India, call **112** / **108**. This is a hackathon prototype with
simulated data.
