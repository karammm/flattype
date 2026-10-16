import { useFlat, useFlatStream, useFlatSuspense } from "@flattype/react";
import { Suspense, useState } from "react";
import { Event, User, UsersPage } from "./models";

function Users({ onPick }: { onPick: (id: number) => void }) {
  const { data, error, loading, refetch } = useFlat("/users", { model: UsersPage });
  if (error) return <p role="alert">Could not load users: {String(error)}</p>;
  if (!data) return <p>Loading users…</p>;
  return (
    <section>
      <h2>
        Users <button onClick={refetch}>{loading ? "Refreshing…" : "Refresh"}</button>
      </h2>
      <ul data-testid="users">
        {data.data.map((u) => (
          <li key={u.id}>
            <button onClick={() => onPick(u.id)}>{u.fullName}</button> · {u.address.city} · joined{" "}
            {u.createdAt.toLocaleDateString("en-GB", { timeZone: "UTC" })}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Profile({ id }: { id: number }) {
  const { data: user } = useFlatSuspense(`/users/${id}`, { model: User });
  return (
    <p data-testid="profile">
      #{user.id} {user.fullName} lives in {user.address.city}
    </p>
  );
}

function Export() {
  const { rows, done, error } = useFlatStream("/export", { model: Event, table: "rows" });
  if (error) return <p role="alert">{String(error)}</p>;
  return (
    <section>
      <h2>Live export</h2>
      <p data-testid="export-status">{done ? `Done: ${rows.length} rows` : `Downloading… ${rows.length} rows so far`}</p>
      <ol data-testid="export" style={{ maxHeight: 160, overflow: "auto" }}>
        {rows.map((r) => (
          <li key={r.id}>
            {r.event} in {r.ms} ms
          </li>
        ))}
      </ol>
    </section>
  );
}

export function App() {
  const [picked, setPicked] = useState(1);
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "2rem auto", padding: "0 16px" }}>
      <h1>FlatType + React</h1>
      <Users onPick={setPicked} />
      <h2>Profile (Suspense)</h2>
      <Suspense fallback={<p>Loading profile…</p>}>
        <Profile id={picked} />
      </Suspense>
      <Export />
    </main>
  );
}
