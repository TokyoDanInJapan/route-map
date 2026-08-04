import { fileURLToPath } from 'node:url';

import { defineConfig } from 'astro/config';

// The demo consumes the package straight from source, so a change hot-reloads
// without a build step. Anyone installing from git resolves the same specifiers
// through the package's dist/ exports instead - which is why the aliases spell
// out every entry point rather than pointing at the directory.
const lib = (path) => fileURLToPath(new URL(`../src/${path}`, import.meta.url));

// GitHub Pages serves a project site from a subpath, so the deployed build
// takes its base from the environment. Development leaves it unset and runs at
// the root.
const base = process.env.DEMO_BASE ?? '/';

export default defineConfig({
  base,
  vite: {
    resolve: {
      alias: [
        { find: 'route-map/styles.css', replacement: lib('styles.css') },
        { find: 'route-map/server', replacement: lib('server.ts') },
        { find: 'route-map/client', replacement: lib('client.ts') },
        { find: 'route-map', replacement: lib('index.ts') },
      ],
    },
  },
});
