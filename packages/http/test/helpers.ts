import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** Starts a real HTTP server on a free port. */
export async function serve(handler: RequestListener): Promise<{ url: string; close(): Promise<void> }> {
  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
