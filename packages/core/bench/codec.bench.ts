import { bench, describe } from "vitest";
// @ts-expect-error -- plain .mjs fixture shared with scripts/compare.mjs
import { users } from "../../../fixtures/index.mjs";
import { decode, encode } from "../src/index.js";

const data = users(1000);
const json = JSON.stringify(data);
const flat = encode(data);

describe("encode 1000 users", () => {
  bench("JSON.stringify", () => {
    JSON.stringify(data);
  });
  bench("flattype encode", () => {
    encode(data);
  });
});

describe("decode 1000 users", () => {
  bench("JSON.parse", () => {
    JSON.parse(json);
  });
  bench("flattype decode", () => {
    decode(flat);
  });
});
