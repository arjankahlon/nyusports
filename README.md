# Prospective Studies (Sports)

Tracker for the NYU Langone Orthopedics sports research prospective studies, built from the Friday research meeting slides.

## What's here

- `public/index.html` - the whole site in one file (styles, code, logo and photos are built in)
- `public/apple-touch-icon.png`, `public/icon-512.png` - home-screen and browser icons
- `netlify/functions/slides.mjs` - Netlify function at `/api/slides` that pulls the deck from Google and keeps a shared copy, so each Refresh becomes the starting data for the next visitor
- `package.json`, `netlify.toml` - tell Netlify how to set up the function
- `DEPLOY.txt` - deploy steps
- `sheet/` - Apps Script for the master Google Sheet, which reads the deck with the same rules as the site (setup in `sheet/SETUP.md`). Not deployed with the site.

## Working on it

- `main` is the master copy. Build features on a branch and open a pull request.
- Pull the latest `main` before starting, so nobody overwrites anyone else's work.
- The site reads the master Google Sheet (`CONFIG.sheet` in `public/index.html`), which syncs itself from the slides. Manual adjustments (status overrides, nicknames, criteria, OR/Office labels, hidden studies, procedures) are the sheet's purple columns.
- If the sheet can't be reached, the site reads the slides directly and uses the fallback lists in `public/index.html` instead: search for `STUDY_OVERRIDES`, `CRITERIA`, `STUDY_SETTINGS`.

## Deploying (manual)

Deploys are done by hand to save Netlify credits:

1. Download the latest `main` (Code > Download ZIP) and unzip it.
2. Drag the whole folder onto the Netlify site's Deploys page. Always the whole folder, never just `index.html`.

## Previewing locally

Refresh only works when the page has a web address. From this folder:

```
cd public && python3 -m http.server 8000
```

then open http://localhost:8000. Without the Netlify function, Refresh falls back to reading Google directly.
