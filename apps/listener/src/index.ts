import { hostname } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config as loadDotenv } from "dotenv";
import { ControlEvent, SignatureRateLimitError, TikTokLiveConnection, WebcastEvent, type TikTokLiveConstructorConnectionOptions } from "tiktok-live-connector";
import { ListenerBackendClient } from "./client/api.js";
import { parseQuestionFormat } from "./parser/comment.js";
import { normalizeChatEvent, normalizeGiftEvent } from "./parser/tiktok.js";
import type { AuthenticationStatus, ListenerStatusPayload, NormalizedTikTokEvent, TikTokConnectionStatus } from "./types.js";
import { ListenerController, type LiveCommand } from "./controller.js";

loadDotenv();
loadDotenv({ path: fileURLToPath(new URL("../.env.local", import.meta.url)) });

const reconnectDelaysMs = [10_000, 30_000, 60_000, 120_000, 300_000];

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
    username: "",
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

function retryAfterMs(error: unknown) {
  if (error instanceof SignatureRateLimitError) return Math.max(error.retryAfter, 30_000);
  if (error && typeof error === "object" && "retryAfter" in error) {
    const value = Number((error as { retryAfter?: unknown }).retryAfter);
    if (Number.isFinite(value) && value > 0) return Math.max(value, 30_000);
  }
  return undefined;
}

function businessPlanFailure(detail: string) {
  return /requires a business plan|premium feature/i.test(detail);
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
  private reconnectDelayOverride: number | undefined;
  private autoReconnectDisabled = false;
  private hasConnected = false;
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
      // A successful status delivery has no detail. Do not erase the TikTok
      // failure reason before the dashboard's next refresh.
      if (detail) this.detail = detail;
      if (!online) this.tiktokStatus = this.connection?.isConnected ? "BACKEND_UNREACHABLE" : this.tiktokStatus;
    });
  }

  async start() {
    if (!this.config.username) throw new Error("Choose a TikTok username from the dashboard");
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
    // Fetching the extended gift gallery requires Euler's paid signing route. A
    // regular public LIVE connection already emits chats and gift events, so keep
    // it off and match gifts with their TikTok Gift ID in dashboard settings.
    const base = { processInitialData: false, fetchRoomInfoOnConnect: true, enableExtendedGiftInfo: false };
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
      if (this.stopping || this.connection !== connection) { await connection.disconnect(); return; }
      await this.handleConnected(state.roomId);
    } catch (error) {
      if (this.stopping) return;
      const rawDetail = safeDetail(error, this.config);
      const delay = retryAfterMs(error);
      const detail = delay
        ? `TikTok จำกัดการเชื่อมต่อชั่วคราว ระบบจะลองใหม่ใน ${Math.ceil(delay / 1_000)} วินาที`
        : businessPlanFailure(rawDetail)
          ? "การเชื่อมต่อฟรีถูกปฏิเสธชั่วคราว ระบบไม่ใช้ฟีเจอร์ Business แล้ว กรุณากด Connect ใหม่ภายหลัง"
          : rawDetail;
      this.detail = detail;
      if (businessPlanFailure(rawDetail)) this.autoReconnectDisabled = true;
      if (authenticationFailure(detail)) this.authenticationStatus = this.config.sessionId ? "invalid" : "missing";
      this.tiktokStatus = authenticationFailure(detail) ? "AUTHENTICATION_ERROR" : "OFFLINE";
      console.error(`TikTok connection failed: ${rawDetail}`);
      this.reportStatus(this.tiktokStatus);
      // Match the Chat Reader wrapper: a first failed Connect reports the
      // result to the dashboard and waits for an intentional retry. Automatic
      // reconnects are reserved for a stream that was connected already.
      if (this.hasConnected && !businessPlanFailure(rawDetail)) this.scheduleReconnect(delay);
    } finally {
      this.connecting = false;
    }
  }

  private bindConnection(connection: TikTokLiveConnection) {
    // v2.4.4 exposes EventEmitter methods at runtime, but its declaration models the
    // inherited constructor rather than the instance. Keep this narrow adapter here.
    const events = connection as unknown as { on(event: string, listener: (event: unknown) => void): void };
    events.on(ControlEvent.CONNECTED, (state) => {
      if (this.connection === connection) void this.handleConnected(String((state as { roomId?: unknown })?.roomId ?? ""));
    });
    events.on(ControlEvent.DISCONNECTED, (event) => {
      if (this.stopping || this.tiktokStatus === "ENDED" || this.connection !== connection) return;
      const disconnected = event as { code?: unknown; reason?: unknown };
      this.detail = disconnected.reason ? String(disconnected.reason).slice(0, 240) : `Disconnected (${String(disconnected.code ?? "unknown")})`;
      this.tiktokStatus = "OFFLINE";
      this.reportStatus("OFFLINE");
      if (this.hasConnected) this.scheduleReconnect();
    });
    events.on(ControlEvent.ERROR, (event) => {
      if (this.stopping || this.tiktokStatus === "ENDED" || this.connection !== connection) return;
      const errorEvent = event as { exception?: unknown; info?: unknown };
      const source = errorEvent.exception ?? errorEvent.info;
      const rawDetail = safeDetail(source, this.config);
      const delay = retryAfterMs(source);
      const detail = delay
        ? `TikTok จำกัดการเชื่อมต่อชั่วคราว ระบบจะลองใหม่ใน ${Math.ceil(delay / 1_000)} วินาที`
        : businessPlanFailure(rawDetail)
          ? "การเชื่อมต่อฟรีถูกปฏิเสธชั่วคราว ระบบไม่ใช้ฟีเจอร์ Business แล้ว กรุณากด Connect ใหม่ภายหลัง"
          : rawDetail;
      this.detail = detail;
      if (delay) this.reconnectDelayOverride = delay;
      if (businessPlanFailure(rawDetail)) this.autoReconnectDisabled = true;
      if (authenticationFailure(detail)) this.authenticationStatus = this.config.sessionId ? "invalid" : "missing";
      this.tiktokStatus = authenticationFailure(detail) ? "AUTHENTICATION_ERROR" : "OFFLINE";
      console.error(`TikTok listener error: ${rawDetail}`);
      this.reportStatus(this.tiktokStatus);
    });
    events.on(WebcastEvent.STREAM_END, () => {
      if (this.stopping || this.connection !== connection) return;
      this.tiktokStatus = "ENDED";
      this.detail = "TikTok LIVE ended";
      this.reportStatus("ENDED");
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
      void this.connection?.disconnect();
    });
    events.on(WebcastEvent.CHAT, (event) => {
      if (this.connection === connection) this.handleEvent(normalizeChatEvent(event, this.config.username, this.roomId ?? connection.roomId));
    });
    events.on(WebcastEvent.GIFT, (event) => {
      if (this.connection === connection) this.handleGift(normalizeGiftEvent(event, this.config.username, this.roomId ?? connection.roomId));
    });
  }

  private async handleConnected(roomId: string) {
    if (this.stopping || !roomId) return;
    this.roomId = roomId;
    this.hasConnected = true;
    this.acceptedAfter = Date.now();
    this.reconnectAttempt = 0;
    this.reconnectDelayOverride = undefined;
    this.autoReconnectDisabled = false;
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
    if (this.stopping || this.tiktokStatus === "ENDED" || !event || !this.isFresh(event)) return;
    if (event.type === "chat" && !parseQuestionFormat(event.comment)) return;
    this.lastEventAt = Date.now();
    this.backend.publishEvent(event);
  }

  private handleGift(event: NormalizedTikTokEvent | null) {
    if (!event || event.type !== "gift") return;
    if (event.gift.giftType === 1 && !event.gift.repeatEnd) return;
    this.handleEvent(event);
  }

  private scheduleReconnect(delayOverride?: number) {
    if (this.stopping || this.autoReconnectDisabled || this.tiktokStatus === "ENDED" || this.reconnectTimer) return;
    if (this.reconnectAttempt >= 5) { this.detail = "เชื่อมต่อไม่สำเร็จ กรุณาตรวจว่าบัญชีกำลังไลฟ์ แล้วกด Connect อีกครั้ง"; this.reportStatus(this.tiktokStatus); return; }
    const attempt = this.reconnectAttempt++;
    const delay = delayOverride ?? this.reconnectDelayOverride ?? retryDelay(attempt);
    this.reconnectDelayOverride = undefined;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      const previous = this.connection;
      this.connection = undefined;
      await previous?.disconnect().catch(() => {});
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
    this.backend.close();
  }
}

export function startListener(config = getListenerConfig()) {
  const listener = new TikTokLiveListener(config);
  return listener.start().then(() => listener);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = getListenerConfig();
  if (!config.listenerSecret) throw new Error("LISTENER_SECRET is required");
  const controller = new ListenerController(command => new TikTokLiveListener({ ...config, username: command.username!, instanceId: command.revision }));
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let unavailable = false;
  const poll = async () => {
    try {
      const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, "")}/internal/tiktok/control`, {
        headers: { authorization: `Bearer ${config.listenerSecret}` }, signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error(`Control API returned ${response.status}`);
      const { data } = await response.json() as { data: LiveCommand };
      await controller.apply(data);
      unavailable = false;
    } catch (error) {
      if (!unavailable) console.error(`TikTok control unavailable: ${safeDetail(error, config)}`);
      unavailable = true;
    } finally {
      if (!stopped) timer = setTimeout(() => { void poll(); }, 1_000);
    }
  };
  console.info("TikTok listener ready. Enter a username and press Connect on the dashboard.");
  void poll();
  const shutdown = async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await controller.shutdown();
    process.exit(0);
  };
  process.once("SIGTERM", () => { void shutdown(); });
  process.once("SIGINT", () => { void shutdown(); });
}
