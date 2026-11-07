/**
 * A minimal GitHub Issues client for the File Import failure reports
 * (#194), over plain `fetch` (no SDK dependency). Authenticates with a
 * fine-grained token (`GITHUB_ISSUES_TOKEN`, Issues: read & write on the
 * repo). `fetchImpl` is injectable so tests don't hit the network.
 */

export type GitHubIssuesConfig = {
  token: string;
  owner: string;
  repo: string;
  fetchImpl?: typeof fetch;
};

type IssueSummary = { number: number; html_url: string; body?: string | null; pull_request?: unknown };

const API = "https://api.github.com";
const MAX_PAGES = 10;

async function call<T>(config: GitHubIssuesConfig, path: string, init?: RequestInit): Promise<T> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const res = await fetchImpl(`${API}/repos/${config.owner}/${config.repo}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${config.token}`,
      "x-github-api-version": "2022-11-28",
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub ${init?.method ?? "GET"} ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

/**
 * The open issue labelled `label` whose body contains `marker`, if any.
 * Lists issues rather than using the search API, whose index lags behind
 * new issues and would let two quick repeats open two issues.
 */
export async function findOpenIssueWithMarker(
  config: GitHubIssuesConfig,
  marker: string,
  label: string = "bug",
): Promise<IssueSummary | null> {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const issues = await call<IssueSummary[]>(
      config,
      `/issues?state=open&labels=${encodeURIComponent(label)}&per_page=100&page=${page}`,
    );
    const match = issues.find((i) => !i.pull_request && i.body?.includes(marker));
    if (match) return match;
    if (issues.length < 100) return null;
  }
  return null;
}

export async function createIssue(
  config: GitHubIssuesConfig,
  issue: { title: string; body: string; labels: string[] },
): Promise<IssueSummary> {
  return call<IssueSummary>(config, "/issues", { method: "POST", body: JSON.stringify(issue) });
}

export async function addIssueComment(
  config: GitHubIssuesConfig,
  issueNumber: number,
  body: string,
): Promise<void> {
  await call(config, `/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}
