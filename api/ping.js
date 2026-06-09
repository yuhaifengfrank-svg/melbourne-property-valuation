export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.status(200).json({ ok: true, time: new Date().toISOString(), url: process.env.DATABASE_URL ? 'set' : 'missing' });
}
