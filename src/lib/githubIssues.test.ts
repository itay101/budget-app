import { addIssueComment, createIssue, findOpenIssueWithMarker } from "@/lib/githubIssues";

type Call = { url: string; init?: RequestInit };

function fakeFetch(responses: unknown[], status = 200) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const body = responses.shift();
    return new Response(JSON.stringify(body ?? {}), { status });
  }) as unknown as typeof fetch;
  return { calls, config: { token: "t0k", owner: "o", repo: "r", fetchImpl } };
}

const MARKER = "<!-- import-failure:abc -->";

describe("findOpenIssueWithMarker", () => {
  it("finds the open bug issue carrying the marker, skipping PRs", async () => {
    const { calls, config } = fakeFetch([
      [
        { number: 1, html_url: "u1", body: `${MARKER}`, pull_request: {} },
        { number: 2, html_url: "u2", body: "other" },
        { number: 3, html_url: "u3", body: `x ${MARKER} y` },
      ],
    ]);
    await expect(findOpenIssueWithMarker(config, MARKER)).resolves.toMatchObject({ number: 3 });
    expect(calls[0].url).toBe(
      "https://api.github.com/repos/o/r/issues?state=open&labels=bug&per_page=100&page=1",
    );
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe("Bearer t0k");
  });

  it("pages until a short page and returns null when nothing matches", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ number: i, html_url: "", body: null }));
    const { calls, config } = fakeFetch([full, [{ number: 200, html_url: "", body: "no" }]]);
    await expect(findOpenIssueWithMarker(config, MARKER)).resolves.toBeNull();
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain("page=2");
  });

  it("throws on a non-OK response", async () => {
    const { config } = fakeFetch([{}], 401);
    await expect(findOpenIssueWithMarker(config, MARKER)).rejects.toThrow("401");
  });
});

describe("createIssue / addIssueComment", () => {
  it("POSTs the issue with labels", async () => {
    const { calls, config } = fakeFetch([{ number: 9, html_url: "u9" }]);
    await createIssue(config, { title: "T", body: "B", labels: ["bug"] });
    expect(calls[0].url).toBe("https://api.github.com/repos/o/r/issues");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      title: "T",
      body: "B",
      labels: ["bug"],
    });
  });

  it("POSTs a comment to the issue", async () => {
    const { calls, config } = fakeFetch([{}]);
    await addIssueComment(config, 9, "again");
    expect(calls[0].url).toBe("https://api.github.com/repos/o/r/issues/9/comments");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ body: "again" });
  });
});
