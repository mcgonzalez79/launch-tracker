import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // For GitHub Pages only: set base to "/<your-repo-name>/" and uncomment:
  // base: "/launch-tracker/",
});
