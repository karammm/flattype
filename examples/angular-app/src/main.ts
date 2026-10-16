import { provideHttpClient, withFetch, withInterceptors } from "@angular/common/http";
import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { flatInterceptor, provideFlatType } from "@flattype/angular";
import { AppComponent } from "./app/app.component";

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    // Every HttpClient request asks for Flat Notation and gets decoded; JSON still works.
    provideHttpClient(withFetch(), withInterceptors([flatInterceptor])),
    provideFlatType({ baseURL: "/api" }),
  ],
}).catch((error) => console.error(error));
