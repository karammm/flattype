import { createFlatResource, createFlatStream } from "@flattype/svelte/solid";
import { createSignal, For, Show, Suspense } from "solid-js";
import { Event, User, UsersPage } from "./models";

const options = { baseURL: "/api" };

function Users(props: { onPick: (id: number) => void }) {
  const [page, { refetch }] = createFlatResource(() => "/users", { ...options, model: UsersPage });
  return (
    <Show when={!page.error} fallback={<p role="alert">Could not load users: {String(page.error)}</p>}>
      <Show when={page.latest} fallback={<p>Loading users…</p>}>
        {(data) => (
          <section>
            <h2>
              Users <button onClick={() => refetch()}>{page.loading ? "Refreshing…" : "Refresh"}</button>
            </h2>
            <ul data-testid="users">
              <For each={data().data}>
                {(u) => (
                  <li>
                    <button onClick={() => props.onPick(u.id)}>{u.fullName}</button> · {u.address.city} · joined{" "}
                    {u.createdAt.toLocaleDateString("en-GB", { timeZone: "UTC" })}
                  </li>
                )}
              </For>
            </ul>
          </section>
        )}
      </Show>
    </Show>
  );
}

function Profile(props: { id: number }) {
  // The source is tracked: a new id aborts the old request. Inside <Suspense> it shows the fallback first.
  const [user] = createFlatResource(() => `/users/${props.id}`, { ...options, model: User });
  return (
    <Show when={user()}>
      {(u) => (
        <p data-testid="profile">
          #{u().id} {u().fullName} lives in {u().address.city}
        </p>
      )}
    </Show>
  );
}

function Export() {
  const events = createFlatStream(() => "/export", { ...options, model: Event, table: "rows" });
  return (
    <section>
      <h2>Live export</h2>
      <p data-testid="export-status">
        {events.done() ? `Done: ${events.rows().length} rows` : `Downloading… ${events.rows().length} rows so far`}
      </p>
      <ol data-testid="export" style={{ "max-height": "160px", overflow: "auto" }}>
        <For each={events.rows()}>
          {(r) => (
            <li>
              {r.event} in {r.ms} ms
            </li>
          )}
        </For>
      </ol>
    </section>
  );
}

export function App() {
  const [picked, setPicked] = createSignal(1);
  return (
    <main style={{ "font-family": "system-ui, sans-serif", "max-width": "720px", margin: "2rem auto", padding: "0 16px" }}>
      <h1>FlatType + Solid</h1>
      <Users onPick={setPicked} />
      <h2>Profile (Suspense)</h2>
      <Suspense fallback={<p>Loading profile…</p>}>
        <Profile id={picked()} />
      </Suspense>
      <Export />
    </main>
  );
}
