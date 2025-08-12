import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/launch-tracker/',   // EXACTLY your repo name with slashes
  build: { outDir: 'dist' },
});
