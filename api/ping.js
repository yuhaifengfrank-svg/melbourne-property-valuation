export default async function handler(request) {
  return new Response(JSON.stringify({ ok: true, time: new Date().toISOString(), url: process.env.DATABASE_URL ? 'set' : 'missing' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
