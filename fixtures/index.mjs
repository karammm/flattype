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

export const fixtures = {
  "users (100 rows)": users(100),
  "users (1000 rows)": users(1000),
  "profile (single object)": profile(),
  "events (mixed shapes)": events(50),
};
