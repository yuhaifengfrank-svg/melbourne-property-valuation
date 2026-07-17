export function assertDatabaseEnvironment(env = process.env) {
  if (env.VERCEL_ENV !== "preview") {
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
    return env.DATABASE_URL;
  }

  const connectionString = env.PREVIEW_DATABASE_URL;
  if (!connectionString) throw new Error("PREVIEW_DATABASE_URL is not configured");
  const expectedHost = env.PREVIEW_DATABASE_HOST;
  if (!expectedHost) throw new Error("PREVIEW_DATABASE_HOST is not configured");
  let actualHost;
  try {
    actualHost = new URL(connectionString).hostname;
  } catch {
    throw new Error("DATABASE_URL is invalid");
  }
  if (actualHost !== expectedHost) {
    throw new Error("Preview database host is not approved");
  }
  return connectionString;
}
