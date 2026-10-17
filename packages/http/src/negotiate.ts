import { MEDIA_TYPE, type EncodeOptions, type FlatVersion } from "@flattype/core";

/**
 * The `Accept` header clients send: Flat Notation first (saying they read version 1.1), JSON as the fallback.
 * Clients before 1.14 send no version, so servers write 1.0 text for them.
 */
export const ACCEPT = `${MEDIA_TYPE}; version=1.1, application/json;q=0.9, */*;q=0.1`;

/** `Content-Type` for Flat Notation responses. */
export const CONTENT_TYPE = `${MEDIA_TYPE}; charset=utf-8`;

/**
 * The Flat Notation version a client reads, from the `version` parameter of `text/x-flat` in its `Accept`
 * header: `"1.1"` for `version=1.1` or later, otherwise `"1.0"`.
 */
export function flatVersion(accept: string | null | undefined): FlatVersion {
  for (const part of (accept ?? "").split(",")) {
    const [media, ...params] = part.trim().split(";");
    if (media!.trim().toLowerCase() !== MEDIA_TYPE) continue;
    for (const p of params) {
      const [k, v] = p.split("=");
      const m = k!.trim().toLowerCase() === "version" ? /^\s*"?(\d+)\.(\d+)/.exec(v ?? "") : null;
      if (m && (Number(m[1]) > 1 || Number(m[2]) >= 1)) return "1.1";
    }
  }
  return "1.0";
}

/** The encode options for a response: the server's own, with a `target` the client can read. */
export function responseOptions(accept: string | null | undefined, options?: EncodeOptions): EncodeOptions {
  return { ...options, target: options?.target === "1.0" ? "1.0" : flatVersion(accept) };
}

function quality(accept: string, type: string): number {
  let best = -1;
  for (const part of accept.split(",")) {
    const [media, ...params] = part.trim().split(";");
    if (media!.trim().toLowerCase() !== type) continue;
    let q = 1;
    for (const p of params) {
      const [k, v] = p.split("=");
      if (k!.trim() === "q") q = Number(v);
    }
    best = Math.max(best, Number.isNaN(q) ? 0 : q);
  }
  return best;
}

/**
 * True when the client asked for Flat Notation explicitly and prefers it to JSON.
 * Wildcards (`*\/*`) never count, so ordinary clients keep getting JSON.
 */
export function prefersFlat(accept: string | null | undefined): boolean {
  if (!accept) return false;
  const flat = quality(accept, MEDIA_TYPE);
  return flat > 0 && flat >= quality(accept, "application/json");
}

export function isFlatType(contentType: string | null | undefined): boolean {
  return !!contentType && contentType.toLowerCase().includes(MEDIA_TYPE);
}

/** Adds `Accept` to an existing `Vary` header value. */
export function addVary(current: string | null | undefined): string {
  if (!current) return "Accept";
  return current.split(",").some((v) => v.trim().toLowerCase() === "accept") ? current : `${current}, Accept`;
}
