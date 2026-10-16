import type { Issue } from "./types.js";

/** Every problem found while mapping, not just the first. */
export class ModelError extends Error {
  constructor(readonly issues: Issue[]) {
    const shown = issues.slice(0, 3).map((i) => `${i.path || "(root)"}: ${i.message}`);
    if (issues.length > 3) shown.push(`…and ${issues.length - 3} more`);
    super(shown.join("; "));
    this.name = "ModelError";
  }
}
