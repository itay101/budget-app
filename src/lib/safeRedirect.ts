/**
 * Validates that `next` is a same-origin relative path before it's used as
 * a post-sign-in redirect target (#106). `next` is attacker-controlled
 * (freely settable on the callback URL, and round-tripped unmodified
 * through `signInWithGoogle`'s OAuth `redirectTo`), and the callback route
 * builds its redirect via string concatenation (`${origin}${next}`), not
 * `new URL(next, origin)` — so a naive `startsWith("/")` check alone isn't
 * enough. Values like `//evil.com` (scheme-relative) or `@evil.com/`
 * (parsed as userinfo by some browsers once concatenated after `origin`)
 * need to be rejected too. Resolving `next` against a fixed placeholder
 * origin and requiring the resolved origin come back unchanged catches all
 * of these, since only a genuine same-origin relative path resolves back
 * to the placeholder.
 */
export function safeRedirectPath(next: string | null | undefined): string {
  if (!next || !/^\/(?!\/|\\)/.test(next)) {
    return "/";
  }
  try {
    const resolved = new URL(next, "http://localhost");
    return resolved.origin === "http://localhost" ? next : "/";
  } catch {
    return "/";
  }
}
