<script setup lang="ts">
import { useFlatSuspense } from "@flattype/vue";
import { User } from "./models";

const props = defineProps<{ id: number }>();
// Waits inside <Suspense>; later changes to `id` refetch and update `user`.
const { data: user } = await useFlatSuspense(() => `/users/${props.id}`, { model: User });
</script>

<template>
  <p data-testid="profile">#{{ user.id }} {{ user.fullName }} lives in {{ user.address.city }}</p>
</template>
