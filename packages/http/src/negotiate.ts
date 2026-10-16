import { MEDIA_TYPE } from "@flattype/core";

/** The `Accept` header clients send: Flat Notation first, JSON as the fallback. */
export const ACCEPT = `${MEDIA_TYPE}, application/json;q=0.9, */*;q=0.1`;

/** `Content-Type` for Flat Notation responses. */
export const CONTENT_TYPE = `${MEDIA_TYPE}; charset=utf-8`;

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
