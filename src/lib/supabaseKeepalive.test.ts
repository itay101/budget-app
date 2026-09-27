import { pingSupabaseApi } from "./supabaseKeepalive";

function fakeFetch(status: number) {
  return jest.fn(
    async () => new Response(null, { status }),
  ) as unknown as jest.MockedFunction<typeof fetch>;
}

describe("pingSupabaseApi", () => {
  it("hits the project's auth health endpoint with the publishable key", async () => {
    const fetchImpl = fakeFetch(200);

    await expect(
      pingSupabaseApi("https://abc.supabase.co", "pk_123", fetchImpl),
    ).resolves.toBe(200);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://abc.supabase.co/auth/v1/health",
      expect.objectContaining({ headers: { apikey: "pk_123" } }),
    );
  });

  it("tolerates a trailing slash on the project URL", async () => {
    const fetchImpl = fakeFetch(200);

    await pingSupabaseApi("https://abc.supabase.co/", "pk_123", fetchImpl);

    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://abc.supabase.co/auth/v1/health",
    );
  });

  it("throws on a non-2xx response so the cron run shows as failed", async () => {
    await expect(
      pingSupabaseApi("https://abc.supabase.co", "bad", fakeFetch(401)),
    ).rejects.toThrow(/HTTP 401/);
  });
});
