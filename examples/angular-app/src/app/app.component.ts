import { HttpClient } from "@angular/common/http";
import { map } from "rxjs";
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FlatModelPipe, flatResource, flatStream } from "@flattype/angular";
import { Address, Event, User, UsersPage } from "./models";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [FlatModelPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main style="font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 16px">
      <h1>FlatType + Angular</h1>

      @if (users.error()) {
        <p role="alert">Could not load users: {{ users.error() }}</p>
      } @else if (users.value(); as page) {
        <section>
          <h2>Users <button (click)="users.reload()">{{ users.isLoading() ? "Refreshing…" : "Refresh" }}</button></h2>
          <ul data-testid="users">
            @for (u of page.data; track u.id) {
              <li>
                <button (click)="picked.set(u.id)">{{ u.fullName }}</button> · {{ u.address.city }} · joined
                {{ u.createdAt.toLocaleDateString("en-GB", { timeZone: "UTC" }) }}
              </li>
            }
          </ul>
        </section>
      } @else {
        <p>Loading users…</p>
      }

      <h2>Profile (signal resource)</h2>
      @if (profile.value(); as user) {
        <p data-testid="profile">#{{ user.id }} {{ user.fullName }} lives in {{ user.address.city }}</p>
      } @else {
        <p>Loading profile…</p>
      }

      <h2>Pipe</h2>
      <p data-testid="pipe">First city: {{ (firstAddress() | flatModel: Address)?.city }}</p>

      <section>
        <h2>Live export</h2>
        <p data-testid="export-status">
          {{ events.done() ? "Done: " + events.rows().length + " rows" : "Downloading… " + events.rows().length + " rows so far" }}
        </p>
        <ol data-testid="export" style="max-height: 160px; overflow: auto">
          @for (r of events.rows(); track r.id) {
            <li>{{ r.event }} in {{ r.ms }} ms</li>
          }
        </ol>
      </section>
    </main>
  `,
})
export class AppComponent {
  readonly Address = Address;
  readonly picked = signal(1);
  readonly users = flatResource(() => "/users", { model: UsersPage });
  readonly profile = flatResource(() => `/users/${this.picked()}`, { model: User });
  readonly events = flatStream(() => "/export", { model: Event, table: "rows" });
  // Raw HttpClient + the interceptor; the pipe maps it in the template.
  readonly firstAddress = toSignal(inject(HttpClient).get<{ address: unknown }>("/api/users/1").pipe(map((u) => u.address)));
}
