<script setup lang="ts">
import { useFlat } from "@flattype/vue";
import { UsersPage } from "./models";

const emit = defineEmits<{ pick: [id: number] }>();
const { data, error, loading, refetch } = useFlat("/users", { model: UsersPage });
</script>

<template>
  <p v-if="error" role="alert">Could not load users: {{ String(error) }}</p>
  <p v-else-if="!data">Loading users…</p>
  <section v-else>
    <h2>
      Users <button @click="refetch">{{ loading ? "Refreshing…" : "Refresh" }}</button>
    </h2>
    <ul data-testid="users">
      <li v-for="u in data.data" :key="u.id">
        <button @click="emit('pick', u.id)">{{ u.fullName }}</button> · {{ u.address.city }} · joined
        {{ u.createdAt.toLocaleDateString("en-GB", { timeZone: "UTC" }) }}
      </li>
    </ul>
  </section>
</template>
