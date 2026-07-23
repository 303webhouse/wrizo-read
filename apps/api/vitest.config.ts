import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // The integration suite shares one Postgres; keep files sequential so TRUNCATE never races.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
