# FlatType + Angular example

```sh
pnpm --filter @flattype/angular build   # the app imports the built library
node e2e/server.mjs 4190 &               # API for the dev server proxy
pnpm start                               # ng serve on :4200, /api proxied
pnpm e2e                                 # production build + Playwright in 3 browsers
```

`@flattype/angular` is linked to `packages/angular/dist` with `preserveSymlinks`, so the library resolves
this app's Angular (22), exactly as it would after `npm install`, instead of the Angular 19 it is built with.
