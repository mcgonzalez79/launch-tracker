import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',            // <- robust for any branch/subpath
  build: { outDir: 'dist' },
});
