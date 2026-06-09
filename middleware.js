// middleware.js — 301 redirect aushomevalue.vercel.app to www.aushomevalue.com.au
// Path and query parameters are preserved.
// All other hosts (www.aushomevalue.com.au, etc.) pass through unchanged.
export default function middleware(request) {
  const hostname = request.headers.get('host') || '';

  if (hostname === 'aushomevalue.vercel.app') {
    const url = new URL(request.url);
    return Response.redirect(
      `https://www.aushomevalue.com.au${url.pathname}${url.search}`,
      301,
    );
  }

  return Response.next();
}
export const config = { matcher: ['/(.*)'] };
