// middleware.js — 301 redirect Vercel app URL to canonical domain
// All requests to aushomevalue.vercel.app redirect to www.aushomevalue.com.au
// preserving path and query parameters.

export default function middleware(request) {
  const hostname = request.headers.get('host') || '';

  // Only redirect requests to the default Vercel deployment URL
  if (hostname === 'aushomevalue.vercel.app') {
    const url = new URL(request.url);
    const destination = `https://www.aushomevalue.com.au${url.pathname}${url.search}`;
    return Response.redirect(destination, 301);
  }

  // Let all other requests pass through
  return Response.next();
}

// Apply to all routes except API endpoints (they need to work on Vercel app URL
// for programmatic access during deployment verification)
export const config = {
  matcher: [
    // Match all paths except API routes
    '/((?!api/).*)',
  ],
};
