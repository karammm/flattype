// Deterministic sample API payloads shared by the benchmarks and `pnpm compare`.
const cities = ["New York", "London", "Paris", "Delhi", "Tokyo", "Berlin"];
const roles = ["admin", "editor", "viewer"];

/** A typical paginated list endpoint: many objects with the same shape. */
export function users(n = 100) {
  return {
    page: 1,
    total: n,
    data: Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      active: i % 3 !== 0,
      role: roles[i % roles.length],
      address: { city: cities[i % cities.length], zip: String(10000 + i) },
      createdAt: new Date(Date.UTC(2026, 0, 1 + (i % 28))).toISOString(),
    })),
  };
}

/** A single detail endpoint: one nested object, no repetition. */
export function profile() {
  return {
    id: 42,
    name: "John",
    age: 30,
    city: "New York",
    settings: { theme: "dark", notifications: { email: true, push: false } },
    tags: ["admin", "beta"],
  };
}

/** Irregular data: arrays of differently shaped objects. */
export function events(n = 50) {
  return Array.from({ length: n }, (_, i) =>
    i % 2 === 0
      ? { type: "push", repo: `org/repo-${i}`, commits: [{ sha: `a${i}`, message: "fix: typo" }] }
      : { type: "star", repo: `org/repo-${i}`, user: { login: `u${i}` } },
  );
}

/** A list where some objects lack some keys: optional phone numbers and addresses. */
export function contacts(n = 1000) {
  return Array.from({ length: n }, (_, i) => {
    const c = { id: i + 1, name: `User ${i + 1}`, email: `user${i + 1}@example.com` };
    if (i % 10 < 3) c.phone = `+1-555-${String(1000 + i).slice(-4)}`;
    c.role = roles[i % roles.length];
    if (i % 2 === 0) c.address = { city: cities[i % cities.length], zip: String(10000 + i) };
    return c;
  });
}

/** An activity feed like GitHub's events API: a shared envelope and a payload whose shape depends on the type. */
export function feed(n = 500) {
  const types = ["PushEvent", "WatchEvent", "IssuesEvent", "PullRequestEvent"];
  return Array.from({ length: n }, (_, i) => {
    const kind = i % 4;
    const payload =
      kind === 0
        ? { ref: "refs/heads/main", size: 1 + (i % 3), commits: Array.from({ length: 1 + (i % 3) }, (_, j) => ({ sha: (i * 7919 + j).toString(16).padStart(10, "0"), message: `Fix #${i}`, distinct: true })) }
        : kind === 1
          ? { action: "started" }
          : kind === 2
            ? { action: "opened", issue: { number: i, title: `Issue ${i}`, state: "open", comments: i % 5 } }
            : { action: "closed", number: i, pull_request: { merged: i % 3 === 0, additions: i % 50, deletions: i % 20 } };
    return {
      id: String(30000000000 + i),
      type: types[kind],
      actor: { id: 1000 + i, login: `user${i}`, avatar_url: `https://avatars.example.com/u/${1000 + i}` },
      repo: { id: 500 + (i % 37), name: `org/repo-${i % 37}` },
      public: true,
      created_at: new Date(Date.UTC(2026, 9, 1 + (i % 28), 12)).toISOString(),
      payload,
    };
  });
}

export const fixtures = {
  "users (100 rows)": users(100),
  "users (1000 rows)": users(1000),
  "profile (single object)": profile(),
  "events (mixed shapes)": events(50),
  "contacts (optional keys, 1000)": contacts(1000),
  "activity feed (500 events)": feed(500),
};
