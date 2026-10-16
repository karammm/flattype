<script setup lang="ts">
import { useFlatStream } from "@flattype/vue";
import { Event } from "./models";

const { rows, done, error } = useFlatStream("/export", { model: Event, table: "rows" });
</script>

<template>
  <p v-if="error" role="alert">{{ String(error) }}</p>
  <section v-else>
    <h2>Live export</h2>
    <p data-testid="export-status">{{ done ? `Done: ${rows.length} rows` : `Downloading… ${rows.length} rows so far` }}</p>
    <ol data-testid="export" style="max-height: 160px; overflow: auto">
      <li v-for="r in rows" :key="r.id">{{ r.event }} in {{ r.ms }} ms</li>
    </ol>
  </section>
</template>
