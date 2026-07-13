export default async function handler(req, res) {
  const env = process.env;
  let actualHost = null;
  let dbUrlMeta = null;
  try {
    const u = new URL(env.DATABASE_URL);
    actualHost = u.hostname;
    dbUrlMeta = { schema: u.protocol, hostname: u.hostname, port: u.port, path: u.pathname };
  } catch (e) {
    dbUrlMeta = { error: e.message };
  }
  const info = {
    VERCEL_ENV: env.VERCEL_ENV,
    VERCEL_GIT_REPO_REF: env.VERCEL_GIT_REPO_REF,
    DATABASE_URL: {
      defined: !!env.DATABASE_URL,
      length: env.DATABASE_URL ? env.DATABASE_URL.length : 0,
      meta: dbUrlMeta,
    },
    PREVIEW_DATABASE_HOST: env.PREVIEW_DATABASE_HOST || '(not set)',
    actualHost: actualHost,
    match: actualHost && env.PREVIEW_DATABASE_HOST ? actualHost === env.PREVIEW_DATABASE_HOST : null,
  };
  res.status(200).json(info);
}
