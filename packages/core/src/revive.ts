import type { Reviver } from "@flattype/shared";

interface Frame {
  holder: object;
  key: string;
  value: object;
  /** Object keys, or `undefined` for an array. */
  keys: string[] | undefined;
  i: number;
  /** The key whose revived value is waiting to be stored. */
  child: string | undefined;
}

function store(container: object, key: string, v: unknown): void {
  if (v === undefined) delete (container as Record<string, unknown>)[key];
  else if (key === "__proto__") Object.defineProperty(container, key, { value: v, writable: true, enumerable: true, configurable: true });
  else (container as Record<string, unknown>)[key] = v;
}

/**
 * Calls `reviver` for every value, children first, the way `JSON.parse` does, and returns the result.
 * Iterative, so deep documents can't overflow the stack. A shared object (from `refs`) is revived once, and
 * every place that points to it gets the same result; inside a cycle the object itself is seen.
 */
export function revive(root: unknown, reviver: Reviver): unknown {
  const done = new Map<object, unknown>();
  const frames: Frame[] = [];
  let ret: unknown;

  /** Pushes a frame for a container, or sets `ret` for anything already final. */
  const enter = (holder: object, key: string): void => {
    const v = (holder as Record<string, unknown>)[key];
    if (v === null || typeof v !== "object") {
      ret = reviver.call(holder, key, v);
    } else if (done.has(v)) {
      ret = done.get(v);
    } else {
      done.set(v, v);
      frames.push({ holder, key, value: v, keys: Array.isArray(v) ? undefined : Object.keys(v), i: 0, child: undefined });
    }
  };

  enter({ "": root }, "");
  while (frames.length > 0) {
    const f = frames[frames.length - 1]!;
    if (f.child !== undefined) {
      store(f.value, f.child, ret);
      f.child = undefined;
    }
    const n = f.keys ? f.keys.length : (f.value as unknown[]).length;
    if (f.i < n) {
      f.child = f.keys ? f.keys[f.i]! : String(f.i);
      f.i++;
      enter(f.value, f.child);
      continue;
    }
    frames.pop();
    ret = reviver.call(f.holder, f.key, f.value);
    done.set(f.value, ret);
  }
  return ret;
}
