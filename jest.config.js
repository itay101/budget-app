// next/jest handles the Next.js-specific transforms (SWC, CSS/image
// mocking, env vars) so this config doesn't need its own babel/ts-jest
// setup - see https://nextjs.org/docs/app/building-your-application/testing/jest
const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const customJestConfig = {
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // Scoped to src/lib - the pure-logic layer these unit tests actually
  // exercise (see src/lib/*.test.ts). Server components/actions and UI
  // components aren't unit-tested today (that's what e2e/ is for), so
  // including them here would just report a permanently-low number
  // rather than a meaningful one. No coverageThreshold on purpose: this
  // is a visibility report (`npm run test:coverage`), not a gate - see
  // CLAUDE.md/the CI workflow for why tests don't block deploys.
  collectCoverageFrom: ["src/lib/**/*.{ts,tsx}", "!src/lib/**/*.test.{ts,tsx}"],
  coverageDirectory: "coverage",
};

module.exports = createJestConfig(customJestConfig);
