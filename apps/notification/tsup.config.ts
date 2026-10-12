import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

export default defineConfig({
  entry: ['src/server.ts', 'src/instrumentation.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  clean: true,
  sourcemap: true,
  // Shared code (e.g. @repo/telemetry state) must be one module across both entries.
  splitting: true,
  // `node dist/server.js` has no npm_package_version; bake it in.
  env: { npm_package_version: version },
  // JIT workspace packages ship TypeScript source, so they must be compiled into the bundle.
  // Everything else stays external: OTel can only patch modules loaded from node_modules.
  noExternal: [/^@repo\//],
  skipNodeModulesBundle: true,
});
