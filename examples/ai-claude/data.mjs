// Sample data for the examples: a page of orders, as an API would return it.
const customers = ["Alice Martin", "Bob Singh", "Chen Wei", "Dara Okafor", "Eva Rossi"];
const products = ["Keyboard", "Monitor", "Headset", "Webcam", "Desk lamp", "USB hub"];

export const orders = Array.from({ length: 60 }, (_, i) => ({
  id: 1000 + i,
  customer: customers[(i * 7) % customers.length],
  product: products[(i * 5) % products.length],
  quantity: 1 + ((i * 3) % 4),
  unit_price: [49.99, 229, 89.5, 64, 35, 24.99][(i * 5) % products.length],
  status: ["paid", "shipped", "refunded"][i % 3],
  created_at: new Date(Date.UTC(2026, 8, 1 + (i % 30))).toISOString(),
}));

export const page = { page: 1, per_page: orders.length, total: 240, data: orders };
