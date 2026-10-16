import { HttpContextToken, HttpErrorResponse, HttpResponse, type HttpInterceptorFn } from "@angular/common/http";
import { decode } from "@flattype/core";
import { ACCEPT } from "@flattype/http";
import { catchError, map, throwError } from "rxjs";

/** Set to `true` in a request's `HttpContext` to leave that request alone. */
export const FLAT_TYPE_SKIP = new HttpContextToken<boolean>(() => false);

const XSSI_PREFIX = /^\)\]\}',?\n/;
const isFlat = (type: string | null): boolean => !!type && type.toLowerCase().includes("text/x-flat");

/** Parses a text body the way HttpClient would for `responseType: "json"`, plus Flat Notation. */
function parse(body: string | null, type: string | null): unknown {
  if (body === null || body === "") return null;
  return isFlat(type) ? decode(body) : JSON.parse(body.replace(XSSI_PREFIX, ""));
}

/**
 * Functional HttpClient interceptor: asks for Flat Notation (JSON stays the fallback) and decodes it, so
 * `http.get<T>(url)` works the same whichever format the server answers in. Error bodies are decoded too.
 * Only requests with `responseType: "json"` (the default) are touched.
 *
 * ```ts
 * provideHttpClient(withInterceptors([flatInterceptor]))
 * ```
 */
export const flatInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.responseType !== "json" || req.context.get(FLAT_TYPE_SKIP)) return next(req);
  const request = req.clone({
    responseType: "text",
    ...(req.headers.has("Accept") ? {} : { setHeaders: { Accept: ACCEPT } }),
  });
  return next(request).pipe(
    map((event) => {
      if (!(event instanceof HttpResponse)) return event;
      const text = event.body as string | null;
      try {
        return event.clone({ body: parse(text, event.headers.get("content-type")) });
      } catch (error) {
        // Same shape HttpClient uses when a JSON body doesn't parse.
        throw new HttpErrorResponse({
          error: { error, text },
          headers: event.headers,
          status: event.status,
          statusText: event.statusText,
          url: event.url ?? undefined,
        });
      }
    }),
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || typeof err.error !== "string") return throwError(() => err);
      let error: unknown = err.error;
      try {
        error = parse(err.error, err.headers.get("content-type"));
      } catch {
        // keep the raw text
      }
      return throwError(
        () => new HttpErrorResponse({ error, headers: err.headers, status: err.status, statusText: err.statusText, url: err.url ?? undefined }),
      );
    }),
  );
};
