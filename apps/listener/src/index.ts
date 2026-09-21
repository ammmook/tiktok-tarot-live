import { hostname } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config as loadDotenv } from "dotenv";
import { ControlEvent, TikTokLiveConnection, WebcastEvent, type TikTokLiveConstructorConnectionOptions } from "tiktok-live-connector";
import { ListenerBackendClient } from "./client/api.js";
import { parseQuestionFormat } from "./parser/comment.js";
import { normalizeChatEvent, normalizeGiftEvent } from "./parser/tiktok.js";
import type { AuthenticationStatus, ListenerStatusPayload, NormalizedTikTokEvent, TikTokConnectionStatus } from "./types.js";

loadDotenv();
loadDotenv({ path: fileURLToPath(new URL("../.env.local", import.meta.url)) });

const reconnectDelaysMs = [1_000, 2_000, 5_000, 10_000, 30_000];

function asBoolean(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function numberInRange(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export interface ListenerConfig {
  username: string;
  apiBaseUrl: string;
  listenerSecret?: string;
  /** Kept for the existing manual ingest helpers. */
  apiKey?: string;
  sessionId?: string;
  targetIdc?: string;
  authenticateWs: boolean;
  trustSigningService: boolean;
  signApiKey?: string;
  instanceId: string;
  heartbeatSeconds: number;
  retryBufferCapacity: number;
  maxEventAgeMs: number;
}

export function getListenerConfig(env: NodeJS.ProcessEnv = process.env): ListenerConfig {
  const listenerSecret = env.LISTENER_SECRET || env.LISTENER_API_KEY || env.QUEUE_API_SECRET || undefined;
  return {
    username: (env.TIKTOK_USERNAME ?? "").trim(),
    apiBaseUrl: (env.API_BASE_URL ?? "http://localhost:4000").trim(),
    listenerSecret,
    apiKey: listenerSecret,
    sessionId: env.TIKTOK_SESSION_ID || undefined,
    targetIdc: env.TIKTOK_TT_TARGET_IDC || env.TIKTOK_TARGET_IDC || undefined,
    authenticateWs: asBoolean(env.TIKTOK_AUTHENTICATE_WS),
    trustSigningService: asBoolean(env.TIKTOK_TRUST_SIGNING_SERVICE),
    signApiKey: env.TIKTOK_SIGN_API_KEY || undefined,
    instanceId: (env.LISTENER_INSTANCE_ID ?? `${hostname()}-${process.pid}`).slice(0, 120),
    heartbeatSeconds: numberInRange(env.LISTENER_HEARTBEAT_SECONDS, 25, 20, 60),
    retryBufferCapacity: numberInRange(env.LISTENER_RETRY_BUFFER_CAPACITY, 1_000, 10, 10_000),
    maxEventAgeMs: numberInRange(env.TIKTOK_MAX_EVENT_AGE_MS, 30_000, 5_000, 300_000),
  };
}

function retryDelay(attempt: number) {
  const base = reconnectDelaysMs[Math.min(attempt, reconnectDelaysMs.length - 1)] ?? 30_000;
  return base + Math.floor(Math.random() * Math.min(1_000, base * 0.2));
}

function safeDetail(error: unknown, config: ListenerConfig) {
  let detail = error instanceof Error ? error.message : String(error);
  for (const secret of [config.listenerSecret, config.sessionId, config.signApiKey]) {
    if (secret) detail = detail.replaceAll(secret, "[redacted]");
  }
  return detail.replace(/(sessionid|cookie|authorization)=?[^\s,;]*/gi, "$1=[redacted]").slice(0, 240);
}

function authenticationFailure(detail: string) {
  return /auth|session|cookie|unauthori[sz]ed|\b401\b|\b403\b/i.test(detail);
}

export class TikTokLiveListener {
  private connection: TikTokLiveConnection | undefined;
  private readonly startedAt = Date.now();
  private readonly backend: ListenerBackendClient;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private connecting = false;
  private stopping = false;
  private reconnectAttempt = 0;
  private roomId: string | undefined;
  private acceptedAfter = 0;
  private lastEventAt: number | undefined;
  private backendOnline = true;
  private tiktokStatus: TikTokConnectionStatus = "OFFLINE";
  private authenticationStatus: AuthenticationStatus;
  private detail: string | undefined;

  constructor(private readonly config: ListenerConfig) {
    this.authenticationStatus = config.sessionId && config.targetIdc ? "configured" : "missing";
    this.backend = new ListenerBackendClient(config, config.retryBufferCapacity, (online, detail) => {
      this.backendOnline = online;
      this.detail = detail;
      if (!online) this.tiktokStatus = this.connection?.isConnected ? "BACKEND_UNREACHABLE" : this.tiktokStatus;
    });
  }

  async start() {
    if (!this.config.username) throw new Error("TIKTOK_USERNAME is required");
    if (!this.config.listenerSecret) throw new Error("LISTENER_SECRET is required");
    if (this.config.authenticateWs && (!this.config.sessionId || !this.config.targetIdc || !this.config.signApiKey || !this.config.trustSigningService)) {
      this.authenticationStatus = this.config.sessionId ? "configured" : "missing";
      this.tiktokStatus = "AUTHENTICATION_ERROR";
      this.detail = "Authenticated WebSocket configuration is incomplete";
      this.reportStatus("AUTHENTICATION_ERROR");
      await this.backend.flush(1_000);
      throw new Error("Authenticated WebSocket requires TIKTOK_SESSION_ID, TIKTOK_TT_TARGET_IDC, TIKTOK_SIGN_API_KEY, and TIKTOK_TRUST_SIGNING_SERVICE=true");
    }
    this.reportStatus("CONNECTING");
    this.heartbeatTimer = setInterval(() => this.reportStatus(this.tiktokStatus), this.config.heartbeatSeconds * 1_000);
    void this.connect();
  }

  private connectionOptions(): TikTokLiveConstructorConnectionOptions {
    const base = { processInitialData: false, fetchRoomInfoOnConnect: true, enableExtendedGiftInfo: true };
    if (this.config.authenticateWs && this.config.sessionId && this.config.targetIdc && this.config.signApiKey) {
      return {
        ...base,
        signApiKey: this.config.signApiKey,
        authenticateWs: true,
        session: { cookie: { type: "cookie", value: { sessionId: this.config.sessionId, ttTargetIdc: this.config.targetIdc } } },
      };
    }
    if (this.config.sessionId && this.config.targetIdc) {
      return {
        ...base,
        authenticateWs: false,
        session: { cookie: { type: "cookie", value: { sessionId: this.config.sessionId, ttTargetIdc: this.config.targetIdc } } },
      };
    }
    return { ...base, authenticateWs: false };
  }

  private async connect() {
    if (this.stopping || this.connecting || this.connection?.isConnected) return;
    this.connecting = true;
    this.tiktokStatus = "CONNECTING";
    this.reportStatus("CONNECTING");
    try {
      const connection = new TikTokLiveConnection(this.config.username, this.connectionOptions());
      this.connection = connection;
      this.bindConnection(connection);
      this.acceptedAfter = Date.now();
      const state = await connection.connect();
      await this.handleConnected(state.roomId);
    } catch (error) {
      const detail = safeDetail(error, this.config);
      this.detail = detail;
      if (authenticationFailure(detail)) this.authenticationStatus = this.config.sessionId ? "invalid" : "missing";
      this.tiktokStatus = authenticationFailure(detail) ? "AUTHENTICATION_ERROR" : "OFFLINE";
      console.error(`TikTok connection failed: ${detail}`);
      this.reportStatus(this.tiktokStatus);
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private bindConnection(connection: TikTokLiveConnection) {
    // v2.4.4 exposes EventEmitter methods at runtime, but its declaration models the
    // inherited constructor rather than the instance. Keep this narrow adapter here.
    const events = connection as unknown as { on(event: string, listener: (event: unknown) => void): void };
    events.on(ControlEvent.CONNECTED, (state) => { void this.handleConnected(String((state as { roomId?: unknown })?.roomId ?? "")); });
    events.on(ControlEvent.DISCONNECTED, (event) => {
      if (this.stopping) return;
      const disconnected = event as { code?: unknown; reason?: unknown };
      this.detail = disconnected.reason ? String(disconnected.reason).slice(0, 240) : `Disconnected (${String(disconnected.code ?? "unknown")})`;
      this.tiktokStatus = "OFFLINE";
      this.reportStatus("OFFLINE");
      this.scheduleReconnect();
    });
    events.on(ControlEvent.ERROR, (event) => {
      const errorEvent = event as { exception?: unknown; info?: unknown };
      const detail = safeDetail(errorEvent.exception ?? errorEvent.info, this.config);
      this.detail = detail;
      if (authenticationFailure(detail)) this.authenticationStatus = this.config.sessionId ? "invalid" : "missing";
      this.tiktokStatus = authenticationFailure(detail) ? "AUTHENTICATION_ERROR" : "OFFLINE";
      console.error(`TikTok listener error: ${detail}`);
      this.reportStatus(this.tiktokStatus);
    });
    events.on(WebcastEvent.STREAM_END, () => {
      if (this.stopping) return;
      this.tiktokStatus = "ENDED";
      this.detail = "TikTok LIVE ended";
      this.reportStatus("ENDED");
      void this.connection?.disconnect();
      this.scheduleReconnect();
    });
    events.on(WebcastEvent.CHAT, (event) => this.handleEvent(normalizeChatEvent(event, this.config.username, this.roomId ?? connection.roomId)));
    events.on(WebcastEvent.GIFT, (event) => this.handleGift(normalizeGiftEvent(event, this.config.username, this.roomId ?? connection.roomId)));
  }

  private async handleConnected(roomId: string) {
    if (this.stopping || !roomId) return;
    this.roomId = roomId;
    this.acceptedAfter = Date.now();
    this.reconnectAttempt = 0;
    this.tiktokStatus = "CONNECTED";
    if (this.config.sessionId && this.config.targetIdc) this.authenticationStatus = "connected";
    this.detail = undefined;
    this.reportStatus("CONNECTED");
  }

  private isFresh(event: NormalizedTikTokEvent) {
    const now = Date.now();
    return event.roomId === this.roomId
      && event.timestamp >= this.acceptedAfter - 5_000
      && now - event.timestamp <= this.config.maxEventAgeMs;
  }

  private handleEvent(event: NormalizedTikTokEvent | null) {
    if (!event || !this.isFresh(event)) return;
    if (event.type === "chat" && !parseQuestionFormat(event.comment)) return;
    this.lastEventAt = Date.now();
    this.backend.publishEvent(event);
  }

  private handleGift(event: NormalizedTikTokEvent | null) {
    if (!event || event.type !== "gift") return;
    if (event.gift.giftType === 1 && !event.gift.repeatEnd) return;
    this.handleEvent(event);
  }

  private scheduleReconnect() {
    if (this.stopping || this.reconnectTimer) return;
    const delay = retryDelay(this.reconnectAttempt++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connection = undefined;
      void this.connect();
    }, delay);
  }

  private reportStatus(tiktokStatus: TikTokConnectionStatus) {
    const status: ListenerStatusPayload = {
      instanceId: this.config.instanceId,
      liveUsername: this.config.username,
      status: this.backendOnline && tiktokStatus === "CONNECTED" ? "ONLINE" : tiktokStatus === "ENDED" || tiktokStatus === "OFFLINE" ? "OFFLINE" : "DEGRADED",
      tiktokStatus,
      authenticationStatus: this.authenticationStatus,
      roomId: this.roomId,
      lastEventAt: this.lastEventAt,
      startedAt: this.startedAt,
      detail: this.detail,
    };
    this.backend.reportStatus(status);
  }

  async shutdown() {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.tiktokStatus = "OFFLINE";
    this.reportStatus("OFFLINE");
    await this.connection?.disconnect().catch((error) => console.error(`TikTok disconnect failed: ${safeDetail(error, this.config)}`));
    await this.backend.flush();
  }
}

export function startListener(config = getListenerConfig()) {
  const listener = new TikTokLiveListener(config);
  return listener.start().then(() => listener);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const listener = await startListener();
  const shutdown = async () => {
    await listener.shutdown();
    process.exit(0);
  };
  process.once("SIGTERM", () => { void shutdown(); });
  process.once("SIGINT", () => { void shutdown(); });
}
