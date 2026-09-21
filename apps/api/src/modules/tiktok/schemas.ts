import { z } from "zod";

const boundedUrl = z.string().trim().max(2_000).optional();

const tiktokUserSchema = z.object({
  userId: z.string().trim().min(1).max(120),
  secUid: z.string().trim().max(256).optional(),
  username: z.string().trim().min(1).max(120),
  nickname: z.string().trim().max(120).default(""),
  profilePictureUrl: boundedUrl,
});

const eventBaseSchema = z.object({
  eventId: z.string().trim().min(1).max(180),
  roomId: z.string().trim().min(1).max(120),
  liveUsername: z.string().trim().min(1).max(120),
  timestamp: z.coerce.number().int().positive(),
  user: tiktokUserSchema,
});

export const tiktokEventSchema = z.discriminatedUnion("type", [
  eventBaseSchema.extend({
    type: z.literal("chat"),
    comment: z.string().trim().min(1).max(2_000),
  }),
  eventBaseSchema.extend({
    type: z.literal("gift"),
    gift: z.object({
      giftId: z.string().trim().min(1).max(80),
      giftName: z.string().trim().max(120).default("Gift"),
      giftType: z.coerce.number().int().nonnegative(),
      repeatCount: z.coerce.number().int().positive().max(100_000),
      repeatEnd: z.boolean(),
      diamondCount: z.coerce.number().int().nonnegative().optional(),
      imageUrl: boundedUrl,
    }),
  }),
]);

export const listenerStatusSchema = z.object({
  instanceId: z.string().trim().min(1).max(120),
  liveUsername: z.string().trim().min(1).max(120),
  status: z.enum(["ONLINE", "DEGRADED", "OFFLINE"]),
  tiktokStatus: z.enum(["CONNECTING", "CONNECTED", "OFFLINE", "AUTHENTICATION_ERROR", "BACKEND_UNREACHABLE", "ENDED"]),
  authenticationStatus: z.enum(["configured", "missing", "invalid", "expired", "connected"]),
  roomId: z.string().trim().min(1).max(120).optional(),
  lastEventAt: z.coerce.number().int().positive().optional(),
  startedAt: z.coerce.number().int().positive(),
  detail: z.string().trim().max(240).optional(),
});

export type TikTokEventInput = z.infer<typeof tiktokEventSchema>;
export type ListenerStatusInput = z.infer<typeof listenerStatusSchema>;
