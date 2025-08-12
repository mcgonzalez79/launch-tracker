import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Either use your repo path:
  // base: '/launch-tracker/',
  // or use relative paths (more robust if you ever rename the repo):
  base: './',
  build: { outDir: 'dist' },
});
