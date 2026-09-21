export type AuthenticationStatus = "configured" | "missing" | "invalid" | "expired" | "connected";
export type TikTokConnectionStatus = "CONNECTING" | "CONNECTED" | "OFFLINE" | "AUTHENTICATION_ERROR" | "BACKEND_UNREACHABLE" | "ENDED";

export interface NormalizedTikTokUser {
  userId: string;
  secUid?: string;
  username: string;
  nickname: string;
  profilePictureUrl?: string;
}

export interface NormalizedChatEvent {
  type: "chat";
  eventId: string;
  roomId: string;
  liveUsername: string;
  timestamp: number;
  user: NormalizedTikTokUser;
  comment: string;
}

export interface NormalizedGiftEvent {
  type: "gift";
  eventId: string;
  roomId: string;
  liveUsername: string;
  timestamp: number;
  user: NormalizedTikTokUser;
  gift: {
    giftId: string;
    giftName: string;
    giftType: number;
    repeatCount: number;
    repeatEnd: boolean;
    diamondCount?: number;
    imageUrl?: string;
  };
}

export type NormalizedTikTokEvent = NormalizedChatEvent | NormalizedGiftEvent;

export interface ListenerStatusPayload {
  instanceId: string;
  liveUsername: string;
  status: "ONLINE" | "DEGRADED" | "OFFLINE";
  tiktokStatus: TikTokConnectionStatus;
  authenticationStatus: AuthenticationStatus;
  roomId?: string;
  lastEventAt?: number;
  startedAt: number;
  detail?: string;
}
