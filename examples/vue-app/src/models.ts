import { defineModel, type Infer } from "@flattype/models";

export const Address = defineModel({ city: "string" });
export const User = defineModel({ id: "number", fullName: "string", createdAt: "date", address: Address });
export type User = Infer<typeof User>;

export const UsersPage = defineModel({ page: "number", data: [User] });
export const Event = defineModel({ id: "number", event: "string", ms: "number" });
