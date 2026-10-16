import { createFlat } from "@flattype/vue";
import { createApp } from "vue";
import App from "./App.vue";

createApp(App).use(createFlat({ baseURL: "/api" })).mount("#root");
