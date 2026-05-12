import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/server.ts',
    'src/app.ts',
    'src/plugins/*.ts',
    'src/modules/**/*.route.ts',
  ],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  minify: false,
  splitting: true,
  dts: false,
  noExternal: [/^@repo\//],
});
