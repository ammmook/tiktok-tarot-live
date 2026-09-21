export interface DatabaseConfig {
  connectionString: string;
}

export function getDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  return {
    connectionString: env.DATABASE_URL ?? "",
  };
}
