---
layout: home
hero:
  name: FlatType.js
  text: Flatten API JSON. Get typed models.
  tagline: Compact key-value text that is about half the size of JSON on list payloads, cheaper in LLM prompts, and maps straight to typed models in every frontend framework.
  image: { src: /mark.svg, alt: "" }
  actions:
    - { theme: brand, text: Get started, link: /guide/getting-started }
    - { theme: alt, text: Try the playground, link: "https://karammm.github.io/flattype/" }
    - { theme: alt, text: GitHub, link: "https://github.com/karammm/flattype" }
features:
  - { title: About half the size on lists, details: "Arrays of same-shaped objects become tables: keys written once, nested fields flattened into the header. 45% smaller than minified JSON on a list of 1,000 users.", link: /guide/benchmarks, linkText: Benchmarks }
  - { title: Typed models, details: "defineModel maps snake_case keys, numeric strings and ISO dates for you and reports every problem with its path. Generate models from a sample or an OpenAPI spec.", link: /guide/models, linkText: Models }
  - { title: Every framework, details: "Hooks for React, composables for Vue, signals for Angular, stores for Svelte, resources for Solid, plus fetch, axios and server middleware. Python backends use the same format: pip install flattype.", link: /guide/react, linkText: Frameworks }
  - { title: Built for Claude and LLMs, details: "toPrompt, a tolerant fromModelOutput, real token counts with Claude's tokenizer, and compact MCP / Claude tool results.", link: /guide/llms, linkText: LLM helpers }
  - { title: Lossless and safe, details: "decode(encode(x)) equals JSON.parse(JSON.stringify(x)), checked by property-based fuzzing; the decoder is prototype-safe and linear-time.", link: /guide/security, linkText: Security }
  - { title: Small, details: "The core is 6.2 KB min+gz with no third-party dependencies. Every package ships ESM, CJS and types, with npm provenance.", link: /guide/getting-started#packages, linkText: Packages }
---

<video class="intro-video" src="/flattype-intro.mp4" controls muted playsinline preload="metadata" aria-label="FlatType in 92 seconds"></video>

```ts
import { encode } from "@flattype/core";

encode({ page: 1, users: [{ id: 1, name: "Alice", address: { city: "Paris" } }, { id: 2, name: "Bob", address: { city: "Delhi" } }] });
// page: 1
// users[2]{id,name,address.city}:
//   1, Alice, Paris
//   2, Bob, Delhi
```
