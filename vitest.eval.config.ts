import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/** On-demand checks that need real local services (Ollama). Run with `npm run brain:eval`. */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/server/brain/eval/*.eval.ts"],
    testTimeout: 300_000,
  },
});
