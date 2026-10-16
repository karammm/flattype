// A typical API response, mapped to typed models and sent to an LLM as Flat Notation.
import { encode, stats } from "@flattype/core";
import { defineModel, infer, toSource } from "@flattype/models";

const response = {
  page: 1,
  data: [
    { id: "1", full_name: "Alice", created_at: "2026-01-01T09:00:00Z", address: { city: "Paris" } },
    { id: "2", full_name: "Bob", created_at: "2026-01-02T09:00:00Z", address: { city: "Delhi" } },
  ],
};

// 1. Declare the model once. snake_case keys, numeric strings and ISO dates are handled for you.
const Address = defineModel({ city: "string" });
const User = defineModel({ id: "number", fullName: "string", createdAt: "date", address: Address });

const users = User.parseList(response.data);
console.log(users[0]);
// { id: 1, fullName: 'Alice', createdAt: 2026-01-01T09:00:00.000Z, address: { city: 'Paris' } }

// 2. Or generate the model code from the response itself.
console.log(toSource(infer(response), "UsersPage"));

// 3. Compact text for a prompt, a log line or a cache.
console.log(encode(response));
console.log(stats(response));
