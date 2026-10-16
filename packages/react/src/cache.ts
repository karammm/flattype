import type { JsonValue } from "@flattype/core";

type Entry =
  | { status: "pending"; promise: Promise<void> }
  | { status: "done"; value: JsonValue }
  | { status: "error"; error: unknown };

/** Response cache for `useFlatSuspense`. Keys are resolved URLs; values are the decoded bodies. */
export class FlatCache {
  private entries = new Map<string, Entry>();

  /** @internal Returns the decoded body, or throws (a promise while loading, the error if it failed). */
  read(key: string, load: () => Promise<JsonValue>): JsonValue {
    let entry = this.entries.get(key);
    if (!entry) {
      const promise = load().then(
        (value) => void this.entries.set(key, { status: "done", value }),
        (error: unknown) => void this.entries.set(key, { status: "error", error }),
      );
      entry = { status: "pending", promise };
      this.entries.set(key, entry);
    }
    if (entry.status === "pending") throw entry.promise;
    if (entry.status === "error") throw entry.error;
    return entry.value;
  }

  /** Forgets one URL, every URL starting with a prefix (`"/api/users"`), or everything. */
  invalidate(match?: string | ((key: string) => boolean)): void {
    for (const key of [...this.entries.keys()]) {
      if (match === undefined || (typeof match === "string" ? key.startsWith(match) : match(key))) this.entries.delete(key);
    }
  }

  /** Puts a value in the cache, e.g. data the server already sent with the HTML. */
  set(key: string, value: JsonValue): void {
    this.entries.set(key, { status: "done", value });
  }
}
