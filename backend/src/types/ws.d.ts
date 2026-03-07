declare module "ws" {
  import type { Server as HttpServer } from "node:http";

  export class WebSocket {
    static readonly OPEN: number;
    readonly OPEN: number;
    readyState: number;
    send(data: string): void;
    on(event: "message", listener: (data: Buffer) => void): this;
  }

  export class WebSocketServer {
    constructor(options: { server: HttpServer; path?: string });
    clients: Set<WebSocket>;
    on(event: "connection", listener: (socket: WebSocket) => void): this;
  }
}
