<script lang="ts">
  import { writable, derived } from "svelte/store";
  import { api } from "./api";
  import { Event, User, UsersPage } from "./models";

  const users = api.store("/users", { model: UsersPage });

  // The URL is a store: picking a user aborts the old request and loads the new one.
  const picked = writable(1);
  const profile = api.store(derived(picked, (id) => `/users/${id}`), { model: User });

  const events = api.streamStore("/export", { model: Event, table: "rows" });
</script>

<main style="font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 16px">
  <h1>FlatType + Svelte</h1>

  {#if $users.error}
    <p role="alert">Could not load users: {String($users.error)}</p>
  {:else if $users.data}
    <section>
      <h2>Users <button onclick={users.refetch}>{$users.loading ? "Refreshing…" : "Refresh"}</button></h2>
      <ul data-testid="users">
        {#each $users.data.data as u (u.id)}
          <li>
            <button onclick={() => picked.set(u.id)}>{u.fullName}</button> · {u.address.city} · joined
            {u.createdAt.toLocaleDateString("en-GB", { timeZone: "UTC" })}
          </li>
        {/each}
      </ul>
    </section>
  {:else}
    <p>Loading users…</p>
  {/if}

  <h2>Profile (store URL)</h2>
  {#if $profile.data}
    <p data-testid="profile">#{$profile.data.id} {$profile.data.fullName} lives in {$profile.data.address.city}</p>
  {:else}
    <p>Loading profile…</p>
  {/if}

  <section>
    <h2>Live export</h2>
    <p data-testid="export-status">
      {$events.done ? `Done: ${$events.rows.length} rows` : `Downloading… ${$events.rows.length} rows so far`}
    </p>
    <ol data-testid="export" style="max-height: 160px; overflow: auto">
      {#each $events.rows as r (r.id)}
        <li>{r.event} in {r.ms} ms</li>
      {/each}
    </ol>
  </section>
</main>
