# CodeBolt — Next.js App Router

CodeBolt is now packaged as a Next.js App Router project with static export support for GitHub Pages. It carries forward the existing SQL course, Python practice track, learner account pages and browser-based tools.

## Requirements

- Node.js 22 or newer
- npm

## Run locally

```bash
cd /home/coding1
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build for deployment

```bash
npm run build
```

The static website is generated in `out/`. To preview that export locally:

```bash
python3 -m http.server 3000 --directory out
```

Then open `http://localhost:3000`.

## GitHub Pages

A GitHub Actions workflow is included at `.github/workflows/deploy.yml`. It builds with the repository name as the base path, then deploys `out/` to GitHub Pages whenever `main` is pushed. In the repository, select **Settings → Pages → Build and deployment → GitHub Actions**.

The current repository is `coding`, so the deployed base path will be `/coding/`. If the repository is renamed, the workflow uses the new repository name automatically.

## Website routes

All 25 existing site views are included: SQL practice, lessons, solutions, dashboard, account/login, profile, rewards, bookmarks, query history, projects, challenges, visualizer, quiz, help, shortcuts, certificates, Premium, Python practice and related pages. Their existing `.html` URLs remain supported. The root route `/` opens SQL Practice.

## Question refresh behaviour

- A full browser refresh clears all SQL question statuses (solved and attempted) in the browser and in the signed-in Firestore progress record.
- The current SQL lesson/topic is remembered, but it reopens at that topic's first question.
- XP, streaks, bookmarks and profile data are preserved. Previously awarded question XP is not awarded a second time.
- Python solved marks are held in memory and therefore also clear on a full browser refresh.
- The shared SQL editor draft is preserved, as before.

## Quality checks

```bash
npm test
npm run test:python
```

These run navigation, question flow, refresh reset, SQL equivalent-answer, all 100 SQL reference-solution and all 95 Python reference-solution tests.

## Implementation notes

The Next.js App Router owns page routing, metadata and static export. The 25 existing page views are currently mounted from their preserved markup, with the original CSS and browser-side modules kept under `public/`, to avoid losing existing SQL.js, Python worker, Firebase, editor and tool behaviour during the framework migration. This is a Next.js migration that preserves the existing front end; the individual screens have not yet been rewritten as separate React component trees.

SQL.js and Firebase SDK modules continue to load from their configured CDN URLs. The Python runner continues to use its browser worker. Premium access remains front-end gated; real subscription enforcement needs server-side entitlement checks.
