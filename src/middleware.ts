import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Define paths that should bypass session checks
  const publicApiPaths = [
    '/api/auth/login',
    '/api/auth/signup',
    '/api/auth/refresh',
    '/api/trial/activate',
    '/api/trial/status',
    '/api/licenses/track-usage',
    '/api/payments/stripe/webhook',
    '/api/payments/paypal/webhook',
  ];

  // Check if the current path is one of the public API paths
  // or if it's a static asset or Next.js internal path
  if (
    publicApiPaths.some(path => pathname.startsWith(path)) ||
    pathname.startsWith('/_next/') || // Exclude Next.js internals
    pathname.startsWith('/static/') || // Exclude static files
    pathname.includes('.') // Generally ignore paths with extensions (like favicon.ico)
  ) {
    return NextResponse.next(); // Allow the request to proceed
  }

  // For all other paths, check for a session
  // This is a placeholder for your actual session checking logic.
  // You might be checking for a cookie, validating a token, etc.
  const sessionToken = request.cookies.get('session-token_textassistd'); // Adjust cookie name as needed

  if (!sessionToken) {
    // If no session and it's an API route that's not public, return 401
    if (pathname.startsWith('/api/')) {
      return new NextResponse(JSON.stringify({ success: false, message: 'Authentication required' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    // For non-API routes, redirect to login
    // Preserve the intended destination for redirection after login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If session exists, allow the request to proceed
  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - / (the root path, if you want it public, otherwise remove or handle above)
     * - /login
     * - /signup
     * - /pricing (if you want pricing public)
     * - any other public pages
     *
     * This matcher is a bit broad; the logic inside the middleware function
     * provides more granular control.
     */
    '/((?!_next/static|_next/image|favicon.ico|login|signup|pricing|$).*?)',
    // Explicitly include API routes that aren't caught by the general rule
    // if they don't have extensions and need to be processed by middleware.
    // The logic within the middleware function is usually preferred for API route handling.
    '/api/:path*',
  ],
};
