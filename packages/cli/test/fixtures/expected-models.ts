import { defineModel, type Infer } from "@flattype/models";

export const Address = defineModel({
  city: "string",
  zipCode: { type: "string", optional: true, nullable: true },
}, { keys: "snake" });
export type Address = Infer<typeof Address>;

export const Customer = defineModel({
  id: "integer",
  fullName: "string",
  email: { type: "string", optional: true },
  createdAt: "date",
  address: { type: Address, optional: true },
  tags: { type: ["string"], optional: true },
}, { keys: "snake" });
export type Customer = Infer<typeof Customer>;

export const OrderLine = defineModel({
  sku: "string",
  qty: "integer",
  unitPrice: { type: "number", optional: true },
}, { keys: "snake" });
export type OrderLine = Infer<typeof OrderLine>;

export const Order = defineModel({
  updatedAt: "date",
  id: "integer",
  status: "string",
  customer: Customer,
  lines: [OrderLine],
  discount: { type: "number", optional: true, nullable: true },
  meta: { type: "any", optional: true },
}, { keys: "snake" });
export type Order = Infer<typeof Order>;

export const Timestamps = defineModel({
  updatedAt: "date",
}, { keys: "snake" });
export type Timestamps = Infer<typeof Timestamps>;

export const Category = defineModel({
  name: "string",
  parent: { type: "any", optional: true },
});
export type Category = Infer<typeof Category>;
