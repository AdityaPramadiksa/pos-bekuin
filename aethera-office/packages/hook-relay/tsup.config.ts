import { defineConfig } from 'tsup';

// Dibundel jadi satu file tanpa dependensi runtime: dipanggil hook sebagai `node dist/relay.js`.
export default defineConfig({
  entry: { relay: 'src/relay.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  noExternal: [/.*/],
});
