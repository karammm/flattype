export const samples: Record<string, unknown> = {
  list: {
    page: 1,
    total: 3,
    data: [
      { id: "1", full_name: "Alice Martin", created_at: "2026-01-01T09:00:00Z", role: "admin", address: { city: "Paris", zip: "75001" } },
      { id: "2", full_name: "Bob Singh", created_at: "2026-01-02T10:30:00Z", role: "editor", address: { city: "Delhi", zip: "110001" } },
      { id: "3", full_name: "Chen Wei", created_at: "2026-01-03T08:15:00Z", role: "viewer", address: { city: "Tokyo", zip: "100-0001" } },
    ],
  },
  nested: {
    id: 42,
    name: "John",
    age: 30,
    city: "New York",
    settings: { theme: "dark", notifications: { email: true, push: false } },
    tags: ["admin", "beta"],
  },
  mixed: {
    events: [
      { type: "push", repo: "org/api", commits: [{ sha: "a1b2", message: "fix: typo" }] },
      { type: "star", repo: "org/web", user: { login: "zoe" } },
    ],
    note: "Mixed arrays use indexed paths instead of tables.",
  },
};
