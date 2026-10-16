/** `createdAt` → `created_at`, `userID` → `user_id`. */
export function toSnake(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

/** `created_at` / `created-at` → `createdAt`. */
export function toCamel(s: string): string {
  return s.replace(/[_-]+([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase());
}
