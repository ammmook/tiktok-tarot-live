export interface ListenerConfig {
  username: string;
  apiBaseUrl: string;
  sessionId?: string;
  targetIdc?: string;
}

export function getListenerConfig(env: NodeJS.ProcessEnv = process.env): ListenerConfig {
  return {
    username: env.TIKTOK_USERNAME ?? "",
    apiBaseUrl: env.API_BASE_URL ?? "http://localhost:4000",
    sessionId: env.TIKTOK_SESSION_ID || undefined,
    targetIdc: env.TIKTOK_TARGET_IDC || undefined,
  };
}

export function startListener(config = getListenerConfig()) {
  console.log(`TikTok listener ready for ${config.username || "未ตั้งค่า username"}`);
  return config;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startListener();
}
