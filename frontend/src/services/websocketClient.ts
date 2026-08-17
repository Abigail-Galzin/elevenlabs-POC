import type { ClientMessage, ServerMessage, ServerMessageType } from "../types/websocket";

const RECONNECT_DELAYS: readonly number[] = [1000, 2000, 4000, 8000, 8000];

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly handlers: Map<
    ServerMessageType,
    Set<(data: ServerMessage) => void>
  > = new Map();
  private reconnectAttempts = 0;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string) {
    this.url = url;
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      const onOpen = (): void => {
        this.ws?.removeEventListener("open", onOpen);
        this.ws?.removeEventListener("error", onError);
        this.reconnectAttempts = 0;
        resolve();
      };

      const onError = (): void => {
        this.ws?.removeEventListener("open", onOpen);
        this.ws?.removeEventListener("error", onError);
        reject(new Error(`WebSocket connection failed: ${this.url}`));
      };

      this.ws.addEventListener("open", onOpen);
      this.ws.addEventListener("error", onError);
      this.ws.addEventListener("close", this.handleClose);
      this.ws.addEventListener("message", this.handleMessage);
    });
  }

  private handleClose = (_event: CloseEvent): void => {
    if (this.reconnectAttempts < RECONNECT_DELAYS.length) {
      const delay = RECONNECT_DELAYS[this.reconnectAttempts];
      this.reconnectAttempts += 1;
      this.reconnectTimeoutId = setTimeout(() => {
        this.reconnectTimeoutId = null;
        void this.connect().catch(() => {
          // Error is reported via the next close event's reconnect cycle.
        });
      }, delay);
    }
  };

  private handleMessage = (event: MessageEvent): void => {
    const raw: unknown = event.data;
    if (typeof raw !== "string") return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (typeof parsed !== "object" || parsed === null) return;

    const message = parsed as ServerMessage;
    const set = this.handlers.get(message.type);
    if (set) {
      for (const handler of set) {
        handler(message);
      }
    }
  };

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  on(type: ServerMessageType, handler: (data: ServerMessage) => void): void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
  }

  off(type: ServerMessageType, handler: Function): void {
    const set = this.handlers.get(type);
    if (set) {
      set.delete(handler as (data: ServerMessage) => void);
      if (set.size === 0) {
        this.handlers.delete(type);
      }
    }
  }

  disconnect(): void {
    if (this.reconnectTimeoutId !== null) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    this.reconnectAttempts = 0;
    if (this.ws) {
      this.ws.removeEventListener("close", this.handleClose);
      this.ws.removeEventListener("message", this.handleMessage);
      this.ws.close();
      this.ws = null;
    }
  }
}
