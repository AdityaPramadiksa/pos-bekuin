import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/summarize.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
});
