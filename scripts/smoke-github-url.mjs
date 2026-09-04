// src/github-url.ts
var UrlParseError = class extends Error {
  constructor(messageKey, detail) {
    super(detail ?? messageKey);
    this.messageKey = messageKey;
    this.detail = detail;
    this.name = "UrlParseError";
  }
};
var OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
var REPO_RE = /^[A-Za-z0-9._-]+$/;
var SHA_RE = /^[0-9a-f]{7,40}$/i;
function assertOwnerRepo(owner, repo) {
  if (!OWNER_RE.test(owner)) throw new UrlParseError("badOwner", owner);
  if (!REPO_RE.test(repo)) throw new UrlParseError("badRepo", repo);
}
function parseGitHubTarget(input) {
  const raw = input.trim();
  if (raw === "") throw new UrlParseError("emptyInput");
  const shorthand = raw.startsWith("github:") ? raw.slice("github:".length) : raw;
  const url = tryParseUrl(shorthand);
  if (url !== void 0) {
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new UrlParseError("badProtocol", url.protocol);
    }
    const host = url.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com") {
      throw new UrlParseError("badHost", host);
    }
    const segments = url.pathname.split("/").filter((segment) => segment !== "");
    if (segments.length < 2) throw new UrlParseError("badPath", url.pathname);
    const [owner2, repoRaw] = segments;
    const repo2 = repoRaw.replace(/\.git$/u, "");
    assertOwnerRepo(owner2, repo2);
    if (segments.length === 2) return { kind: "default", owner: owner2, repo: repo2 };
    if (segments[2] === "archive") {
      if (segments.length < 5) throw new UrlParseError("badPath", url.pathname);
      if (segments[3] !== "refs") throw new UrlParseError("badPath", url.pathname);
      const kind = segments[4] === "tags" ? "tag" : "branch";
      let ref2 = decodeURIComponent(segments.slice(5).join("/"));
      ref2 = ref2.replace(/\.(?:zip|tar\.gz|tgz|tarball)$/iu, "");
      if (ref2 === "") throw new UrlParseError("badPath", url.pathname);
      return { kind, owner: owner2, repo: repo2, ref: ref2 };
    }
    if (segments[2] === "tree" || segments[2] === "blob") {
      const ref2 = decodeURIComponent(segments[3] ?? "");
      if (ref2 === "") throw new UrlParseError("badPath", url.pathname);
      return { kind: SHA_RE.test(ref2) ? "commit" : "branch", owner: owner2, repo: repo2, ref: ref2 };
    }
    if (segments[2] === "releases") {
      if (segments[3] === "tag" && segments.length >= 4) {
        const ref2 = decodeURIComponent(segments[4] ?? "");
        if (ref2 !== "") return { kind: "tag", owner: owner2, repo: repo2, ref: ref2 };
      }
      return { kind: "default", owner: owner2, repo: repo2 };
    }
    return { kind: "default", owner: owner2, repo: repo2 };
  }
  const at = shorthand.lastIndexOf("@");
  const base = at > 0 ? shorthand.slice(0, at) : shorthand;
  const ref = at > 0 ? shorthand.slice(at + 1) : void 0;
  const parts = base.split("/").filter((segment) => segment !== "");
  if (parts.length !== 2) throw new UrlParseError("badShorthand", shorthand);
  const [owner, repo] = parts;
  const cleanRepo = repo.replace(/\.git$/u, "");
  assertOwnerRepo(owner, cleanRepo);
  if (ref === void 0 || ref === "") return { kind: "default", owner, repo: cleanRepo };
  return { kind: SHA_RE.test(ref) ? "commit" : "branch", owner, repo: cleanRepo, ref };
}
function tryParseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return void 0;
  }
}
function codeloadZipUrl(target) {
  const ref = "ref" in target ? target.ref : void 0;
  if (ref === void 0) {
    return `https://codeload.github.com/${target.owner}/${target.repo}/zip/HEAD`;
  }
  const shape = target.kind === "tag" ? "tags" : "heads";
  return `https://codeload.github.com/${target.owner}/${target.repo}/zip/refs/${shape}/${encodeURIComponent(ref)}`;
}
function archiveZipUrl(target) {
  if (!("ref" in target)) {
    return `https://github.com/${target.owner}/${target.repo}/archive/HEAD.zip`;
  }
  const shape = target.kind === "tag" ? "tags" : "heads";
  return `https://github.com/${target.owner}/${target.repo}/archive/refs/${shape}/${encodeURIComponent(target.ref)}.zip`;
}
function targetLabel(target) {
  const base = `${target.owner}/${target.repo}`;
  return "ref" in target ? `${base}@${target.ref}` : base;
}
function looksLikeGitHub(input) {
  const raw = input.trim().toLowerCase();
  if (raw === "") return false;
  if (raw.startsWith("github:") || raw.startsWith("https://github.com/") || raw.startsWith("http://github.com/")) return true;
  return /^[a-z0-9][a-z0-9-]*\/[a-z0-9._-]+(@[\w.-]+)?$/u.test(raw.replace(/^github\//u, ""));
}
export {
  UrlParseError,
  archiveZipUrl,
  codeloadZipUrl,
  looksLikeGitHub,
  parseGitHubTarget,
  targetLabel
};
