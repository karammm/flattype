<script setup lang="ts">
import { ref } from "vue";
import Export from "./Export.vue";
import Profile from "./Profile.vue";
import Users from "./Users.vue";

const picked = ref(1);
</script>

<template>
  <main style="font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 16px">
    <h1>FlatType + Vue</h1>
    <Users @pick="picked = $event" />
    <h2>Profile (Suspense)</h2>
    <Suspense>
      <Profile :id="picked" />
      <template #fallback><p>Loading profile…</p></template>
    </Suspense>
    <Export />
  </main>
</template>
