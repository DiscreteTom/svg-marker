# SVG Marker

A browser-based SVG marking tool. Open a local SVG, zoom and pan the canvas, add and adjust marker points, then copy the coordinates or export them as JSON. Files never leave the browser. No SVG is bundled with the application.

## Local development

Node.js 20 or newer is required.

```bash
npm install
npm run dev
```

Create and preview a production build:

```bash
npm run build
npm run preview
```

## Features

- Choose a local `.svg` file or drop it onto the canvas
- Use the SVG `viewBox` as the marker coordinate system
- Scroll to zoom, drag to pan, and inspect details with an 8× loupe
- Click to add markers, drag to adjust, use arrow keys to nudge, and right-click to delete
- Set a radius for each marker
- Overlay a local reference image with adjustable opacity
- Copy plain-text coordinates or download `marker-points.json`

## Deploy to GitHub Pages

The repository includes [.github/workflows/deploy.yml](.github/workflows/deploy.yml). Every push to `main` builds the app and deploys `dist`.

Before the first deployment, open the GitHub repository's **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**. You can also run the workflow manually from **Actions → Deploy to GitHub Pages → Run workflow**.

The project uses relative asset paths, so it works at `https://<user>.github.io/<repo>/` and on custom domains.
