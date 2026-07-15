const baseUrl = (process.env.BASE_URL || "https://aushomevalue.com.au").replace(/\/$/, "");
const expectedSha = process.env.EXPECTED_SHA || "";
const attempts = Number(process.env.SMOKE_ATTEMPTS || 30);
const delayMs = Number(process.env.SMOKE_DELAY_MS || 20000);

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function json(path, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "follow",
    headers: { "cache-control": "no-cache" }
  });
  if (response.status !== expectedStatus) throw new Error(`${path}: expected ${expectedStatus}, got ${response.status}`);
  return response.json();
}

let version;
for (let attempt = 1; attempt <= attempts; attempt++) {
  try {
    version = await json(`/version.json?attempt=${attempt}`, 200);
    const shaMatches = !expectedSha || version.commit === expectedSha;
    if (version.environment === "production" && version.branch === "main" && shaMatches) break;
  } catch (error) {
    if (attempt === attempts) throw error;
  }
  if (attempt === attempts) {
    throw new Error(`production version mismatch: expected ${expectedSha || "main"}, received ${JSON.stringify(version)}`);
  }
  await wait(delayMs);
}

const stats = await json("/site-stats.json", 200);
if (stats.comparableSales < 180000 || stats.schoolsMapped < 2800 || stats.suburbsCovered < 500) {
  throw new Error(`homepage statistics regressed: ${JSON.stringify(stats)}`);
}

const homepage = await fetch(`${baseUrl}/`, { redirect: "follow" });
if (homepage.status !== 200) throw new Error(`/: expected 200, got ${homepage.status}`);
const watchPage = await fetch(`${baseUrl}/investor-watch/`, { redirect: "follow" });
if (watchPage.status !== 200) throw new Error(`/investor-watch/: expected 200, got ${watchPage.status}`);

const member = await json("/api/member?action=me", 401);
if (member.error !== "UNAUTHENTICATED") throw new Error("member unauthenticated boundary changed");
const watch = await json("/api/investor-watch?action=status", 401);
if (watch.error !== "UNAUTHENTICATED") throw new Error("Investor Watch unauthenticated boundary changed");
const opportunity = await json("/api/opportunity?suburb=Balwyn", 200);
if (!opportunity.ok) throw new Error("opportunity endpoint returned ok=false");

console.log(JSON.stringify({ ok: true, baseUrl, version, stats }, null, 2));
