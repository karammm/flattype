import { readFileSync } from "node:fs";
import { defineConfig } from "vitepress";

const { version } = JSON.parse(readFileSync(new URL("../../../packages/core/package.json", import.meta.url), "utf8"));

export default defineConfig({
  title: "FlatType.js",
  description: "Flatten API JSON into compact, LLM-friendly key: value text and map it to typed models, in every frontend framework.",
  base: "/flattype/docs/",
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ["meta", { name: "theme-color", content: "#5b3fd6" }],
    ["link", { rel: "icon", type: "image/svg+xml", href: "/flattype/docs/mark.svg" }],
  ],
  // The default GitHub themes have comment colors below WCAG AA contrast.
  markdown: { theme: { light: "github-light-high-contrast", dark: "github-dark-high-contrast" } },
  themeConfig: {
    logo: { src: "/mark.svg", alt: "" },
    nav: [
      { text: "Guide", link: "/guide/getting-started", activeMatch: "/guide/" },
      { text: "Format spec", link: "/guide/format" },
      { text: "Playground", link: "https://karammm.github.io/flattype/" },
      {
        text: `v${version}`,
        items: [
          { text: "Changelog", link: "https://github.com/karammm/flattype/blob/main/CHANGELOG.md" },
          { text: "Roadmap", link: "https://github.com/karammm/flattype/blob/main/ROADMAP.md" },
          { text: "npm", link: "https://www.npmjs.com/package/@flattype/core" },
          { text: "PyPI", link: "https://pypi.org/project/flattype/" },
        ],
      },
    ],
    sidebar: [
      {
        text: "Start",
        items: [
          { text: "Getting started", link: "/guide/getting-started" },
          { text: "The format", link: "/guide/format" },
          { text: "Typed models", link: "/guide/models" },
        ],
      },
      {
        text: "Use it",
        items: [
          { text: "HTTP (fetch, axios, servers)", link: "/guide/http" },
          { text: "React", link: "/guide/react" },
          { text: "Vue", link: "/guide/vue" },
          { text: "Angular", link: "/guide/angular" },
          { text: "Svelte and Solid", link: "/guide/svelte-solid" },
          { text: "Claude and LLMs", link: "/guide/llms" },
          { text: "CLI and code generation", link: "/guide/cli" },
          { text: "Python", link: "/guide/python" },
        ],
      },
      {
        text: "Quality",
        items: [
          { text: "Benchmarks", link: "/guide/benchmarks" },
          { text: "Security", link: "/guide/security" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/karammm/flattype" },
      { icon: "npm", link: "https://www.npmjs.com/org/flattype" },
    ],
    search: { provider: "local" },
    // Name the theme switch explicitly: without these its title can stay empty (axe: button-name).
    darkModeSwitchLabel: "Appearance",
    lightModeSwitchTitle: "Switch to light theme",
    darkModeSwitchTitle: "Switch to dark theme",
    editLink: { pattern: "https://github.com/karammm/flattype/edit/main/apps/docs/:path", text: "Edit this page on GitHub" },
    footer: { message: "Released under the MIT License.", copyright: "FlatType.js contributors" },
  },
});
