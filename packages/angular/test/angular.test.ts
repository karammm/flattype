import { HttpClient, HttpContext, HttpErrorResponse, provideHttpClient, withInterceptors } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { encode } from "@flattype/core";
import { defineModel } from "@flattype/models";
import { firstValueFrom } from "rxjs";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { FLAT_TYPE_SKIP, FlatModelPipe, flatInterceptor, flatResource, flatStream, mapModelList, provideFlatType } from "../src/public-api";
import { fakeFetch } from "./fake";

const User = defineModel({ id: "number", fullName: "string" });
const users = [
  { id: "1", full_name: "Alice" },
  { id: "2", full_name: "Bob" },
];
const flat = { "content-type": "text/x-flat; charset=utf-8" };

function setup(extra: unknown[] = []) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withInterceptors([flatInterceptor])), provideHttpClientTesting(), provideFlatType({ baseURL: "/api" }), ...(extra as never[])],
  });
  return { http: TestBed.inject(HttpClient), backend: TestBed.inject(HttpTestingController) };
}

afterEach(() => TestBed.resetTestingModule());

describe("flatInterceptor", () => {
  it("asks for Flat Notation and decodes it", async () => {
    const { http, backend } = setup();
    const result = firstValueFrom(http.get("/api/users"));
    const req = backend.expectOne("/api/users");
    expect(req.request.headers.get("Accept")).toBe("text/x-flat; version=1.1, application/json;q=0.9, */*;q=0.1");
    expect(req.request.responseType).toBe("text");
    req.flush(encode(users), { headers: flat });
    expect(await result).toEqual(users);
  });

  it("still reads JSON, including the XSSI prefix HttpClient strips", async () => {
    const { http, backend } = setup();
    const result = firstValueFrom(http.get("/api/users"));
    backend.expectOne("/api/users").flush(")]}'\n" + JSON.stringify(users), { headers: { "content-type": "application/json" } });
    expect(await result).toEqual(users);
  });

  it("maps to models with the RxJS operator", async () => {
    const { http, backend } = setup();
    const result = firstValueFrom(http.get("/api/users").pipe(mapModelList(User)));
    backend.expectOne("/api/users").flush(encode(users), { headers: flat });
    const list = await result;
    expectTypeOf(list).toEqualTypeOf<{ id: number; fullName: string }[]>();
    expect(list).toEqual([
      { id: 1, fullName: "Alice" },
      { id: 2, fullName: "Bob" },
    ]);
  });

  it("decodes error bodies", async () => {
    const { http, backend } = setup();
    const result = firstValueFrom(http.get("/api/missing")).catch((e: unknown) => e);
    backend.expectOne("/api/missing").flush(encode({ error: "not found" }), { status: 404, statusText: "Not Found", headers: flat });
    const err = (await result) as HttpErrorResponse;
    expect(err).toBeInstanceOf(HttpErrorResponse);
    expect(err.status).toBe(404);
    expect(err.error).toEqual({ error: "not found" });
  });

  it("reports unparsable bodies the way HttpClient does", async () => {
    const { http, backend } = setup();
    const result = firstValueFrom(http.get("/api/x")).catch((e: unknown) => e);
    backend.expectOne("/api/x").flush("not json", { headers: { "content-type": "application/json" } });
    const err = (await result) as HttpErrorResponse;
    expect(err.error.text).toBe("not json");
    expect(err.error.error).toBeInstanceOf(SyntaxError);
  });

  it("leaves text, blob and opted-out requests alone, and keeps an explicit Accept", async () => {
    const { http, backend } = setup();
    const text = firstValueFrom(http.get("/api/t", { responseType: "text" }));
    const t = backend.expectOne("/api/t");
    expect(t.request.headers.has("Accept")).toBe(false);
    t.flush("a: 1");
    expect(await text).toBe("a: 1");

    void firstValueFrom(http.get("/api/skip", { context: new HttpContext().set(FLAT_TYPE_SKIP, true) }));
    expect(backend.expectOne("/api/skip").request.responseType).toBe("json");

    void firstValueFrom(http.get("/api/own", { headers: { Accept: "application/json" } }));
    expect(backend.expectOne("/api/own").request.headers.get("Accept")).toBe("application/json");
  });
});

describe("flatResource", () => {
  it("loads into signals, follows the URL signal and cancels the old request", async () => {
    const { backend } = setup();
    @Component({ standalone: true, template: "" })
    class Host {
      id = signal(1);
      user = flatResource(() => `/users/${this.id()}`, { model: User });
    }
    const fixture = TestBed.createComponent(Host);
    const host = fixture.componentInstance;
    // Component effects run during change detection.
    const run = () => {
      fixture.detectChanges();
      TestBed.flushEffects();
    };
    expectTypeOf(host.user.value()).toEqualTypeOf<{ id: number; fullName: string } | undefined>();
    run();
    expect(host.user.isLoading()).toBe(true);
    backend.expectOne("/api/users/1").flush(encode(users[0]), { headers: flat });
    expect(host.user.value()).toEqual({ id: 1, fullName: "Alice" });
    expect(host.user.isLoading()).toBe(false);

    host.id.set(2);
    run();
    const slow = backend.expectOne("/api/users/2");
    host.id.set(1);
    run();
    expect(slow.cancelled).toBe(true);
    expect(host.user.value()).toEqual({ id: 1, fullName: "Alice" }); // old data stays while loading
    backend.expectOne("/api/users/1").flush(encode({ id: "1", full_name: "Alice 2" }), { headers: flat });
    expect(host.user.value()).toEqual({ id: 1, fullName: "Alice 2" });

    host.user.reload();
    run();
    backend.expectOne("/api/users/1").flush(encode({ id: "x" }), { headers: flat });
    expect(String(host.user.error())).toMatch(/id: Expected number/);
    fixture.destroy();
  });

  it("waits while the URL is undefined", () => {
    const { backend } = setup();
    @Component({ standalone: true, template: "" })
    class Host {
      url = signal<string | undefined>(undefined);
      data = flatResource(() => this.url());
    }
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    TestBed.flushEffects();
    backend.expectNone(() => true);
    expect(fixture.componentInstance.data.isLoading()).toBe(false);
  });
});

describe("flatStream", () => {
  it("shows rows before the response has finished", async () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: i, name: `Row ${i}` }));
    const fake = fakeFetch({ "/stream/export": { body: { total: 40, rows }, chunks: 8, delay: 15 } });
    TestBed.configureTestingModule({ providers: [provideFlatType({ baseURL: "/stream", fetch: fake.fetch, headers: () => ({ "x-app": "t" }) })] });
    const Row = defineModel({ id: "number", name: "string" });
    @Component({ standalone: true, template: "" })
    class Host {
      events = flatStream(() => "/export", { model: Row, table: "rows" });
    }
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    TestBed.flushEffects();
    const s = fixture.componentInstance.events;
    const until = async (check: () => boolean) => {
      for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
      expect(check()).toBe(true);
    };
    await until(() => s.rows().length > 0);
    expect(s.done()).toBe(false);
    expect(s.rows().length).toBeLessThan(40);
    await until(() => s.done());
    expect(s.rows()).toEqual(rows);
    expect(fake.calls[0]!.accept).toMatch(/^text\/x-flat/);
    fixture.destroy();
  });
});

describe("FlatModelPipe", () => {
  it("maps values and lists in templates", () => {
    @Component({
      standalone: true,
      imports: [FlatModelPipe],
      template: `<p>{{ (one | flatModel: User)?.fullName }}</p><i>{{ (many | flatModel: User : 'list')?.length }}</i>`,
    })
    class Host {
      User = User;
      one = users[0];
      many = users;
    }
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toBe("Alice2");
  });
});
