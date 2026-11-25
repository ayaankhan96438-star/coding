# CodeBolt Next.js migration

This project now uses the Next.js App Router. All 25 original HTML views are served as generated App Router routes (including their original `.html` URLs) while their markup, CSS and browser-side SQL/Python engines are preserved. All original runtime assets and lesson/question data live under `public/` so relative imports, workers and lesson fetches remain available.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The root route opens SQL Practice; original routes such as `/lessons.html`, `/dashboard.html`, `/python.html` and `/solutions.html` are also supported.

## Production static export

```bash
npm run build
python3 -m http.server 3000 --directory out
```

Open `http://localhost:3000`. The `out/` folder is the complete deployable site.

## Refresh reset behaviour

A true browser refresh clears SQL question completion state in localStorage and the signed-in Firestore progress record before the practice app hydrates. XP/streaks, bookmarks, profile data, selected topic and the shared SQL editor draft remain. The Python question solved set is in memory and naturally resets on a full reload.

## Notes

- This migration preserves the original front-end and browser-side feature modules; the visual pages are mounted by the Next.js App Router from the original HTML view source. They are not rewritten as individual React component trees yet.
- SQL.js and Firebase SDK modules still load from their configured CDN URLs. The Python runner remains the existing Pyodide worker.
- Premium question access remains the existing front-end gating; production subscription enforcement requires server-side authentication and entitlement validation.


## Deploy to this GitHub Pages repository

The included `.github/workflows/deploy.yml` builds the Next.js static export with `NEXT_PUBLIC_BASE_PATH` set to the repository name (`/coding`) and deploys the `out/` directory on pushes to `main`. In GitHub, open **Settings → Pages** and choose **GitHub Actions** as the build/deployment source. If the repository is renamed, the workflow automatically uses its new repository name as the base path.
