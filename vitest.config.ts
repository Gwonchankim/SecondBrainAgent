// Vitest config — resolve @mneme/* to package SOURCE (mirrors tsconfig.base paths).
// Without this, a runtime value import of an internal package resolves to its
// package.json `main` (dist/index.js), which is not built during tests. Tests run
// against src, exactly like `npm run typecheck`. No transpiled output required.

import { defineConfig } from "vitest/config";
import * as path from "node:path";

const src = (pkg: string) => path.resolve(__dirname, "packages", pkg, "src", "index.ts");

export default defineConfig({
  resolve: {
    alias: {
      "@mneme/provider": src("provider"),
      "@mneme/ipc": src("ipc"),
      "@mneme/wiki": src("wiki"),
      "@mneme/credential": src("credential"),
      "@mneme/cache": src("cache"),
      "@mneme/core": src("core"),
    },
  },
});
