import { safeRedirectPath } from "./safeRedirect";

describe("safeRedirectPath", () => {
  it("accepts a plain relative path", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
  });

  it("accepts a relative path with a query string", () => {
    expect(safeRedirectPath("/budgets/123?tab=transactions")).toBe(
      "/budgets/123?tab=transactions",
    );
  });

  it("defaults to / for null, undefined, and empty string", () => {
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
  });

  it("rejects an absolute URL", () => {
    expect(safeRedirectPath("https://evil.com")).toBe("/");
  });

  it("rejects a scheme-relative URL", () => {
    expect(safeRedirectPath("//evil.com")).toBe("/");
  });

  it("rejects the backslash host-confusion trick", () => {
    expect(safeRedirectPath("/\\evil.com")).toBe("/");
  });

  it("rejects the userinfo host-confusion trick", () => {
    expect(safeRedirectPath("@evil.com/")).toBe("/");
  });

  it("rejects a path missing its leading slash", () => {
    expect(safeRedirectPath("dashboard")).toBe("/");
  });
});
