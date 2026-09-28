import { isAuthorizedCronRequest } from "./cronAuth";

function request(authorization?: string) {
  return new Request("https://example.com/api/cron/keepalive", {
    headers: authorization ? { authorization } : {},
  });
}

describe("isAuthorizedCronRequest", () => {
  it("allows every request when no CRON_SECRET is configured", () => {
    expect(isAuthorizedCronRequest(request(), undefined)).toBe(true);
    expect(isAuthorizedCronRequest(request(), "")).toBe(true);
  });

  it("allows a request carrying the matching bearer token", () => {
    expect(isAuthorizedCronRequest(request("Bearer s3cret"), "s3cret")).toBe(
      true,
    );
  });

  it("rejects a missing or wrong token when a secret is configured", () => {
    expect(isAuthorizedCronRequest(request(), "s3cret")).toBe(false);
    expect(isAuthorizedCronRequest(request("Bearer nope"), "s3cret")).toBe(
      false,
    );
  });
});
