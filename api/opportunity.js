/**
 * api/opportunity.js - Opportunity Scan API endpoint
 * GET /api/opportunity?strategy=smart&suburbRegion=Scoresby&propertyType=House
 */

import { neon } from '@neondatabase/serverless';
import { scanOpportunities } from '../lib/opportunity-service.js';

// Module-level sql instance — reused across invocations within the same warm function
let _sql = null;
function getCachedSql() {
  if (!_sql && process.env.DATABASE_URL) {
    _sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
  }
  return _sql;
}

// Expose for use by scanOpportunities (which also uses neon internally, but we
// ensure the connection exists before calling it — the cold-start ping happens below)
export { getCachedSql };

export default async function handler(request) {
  const headers = new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  const url = new URL(request.url, 'http://localhost');
  const params = {
    strategy: url.searchParams.get('strategy') || 'smart',
    suburbRegion: url.searchParams.get('suburb'),
    propertyType: url.searchParams.get('propertyType'),
    minPrice: url.searchParams.get('minPrice') ? Number(url.searchParams.get('minPrice')) : null,
    maxPrice: url.searchParams.get('maxPrice') ? Number(url.searchParams.get('maxPrice')) : null,
    minScore: url.searchParams.get('minScore') ? Number(url.searchParams.get('minScore')) : 0,
    maxResults: url.searchParams.get('maxResults') ? Number(url.searchParams.get('maxResults')) : 50
  };

  try {
    // Cold-start ping: establish Neon connection before running the scan
    const sql = getCachedSql();
    if (sql) {
      await sql`SELECT 1 AS ping`;
    }
    const result = await scanOpportunities(params);
    return new Response(JSON.stringify({ ok: true, ...result, modelVersion: '1.0.0', collectedAt: new Date().toISOString() }), { headers });
  } catch (error) {
    console.error('Opportunity scan error:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message, opportunities: [], meta: { totalScanned: 0, strategy: params.strategy } }), { status: 500, headers });
  }
}
