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
};

module.exports = createJestConfig(customJestConfig);
