import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const { pathname, origin } = request.nextUrl;
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // If the cookie is set, add it to the response
          // This is done by the Supabase client, we just pass it through
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          // If the cookie is removed, update the response
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Define paths that should bypass session checks or are public
  const publicPaths = [
    '/login',
    '/signup',
    '/pricing', // Example, adjust as needed
    '/api/auth/callback', // Callback must be public
  ];

  const publicApiPrefixes = [
    '/api/auth/login', // Already covered by /login for UI
    '/api/auth/signup', // Already covered by /signup for UI
    '/api/trial/activate',
    '/api/trial/status',
    '/api/licenses/track-usage',
    '/api/licenses/validate',
    '/api/payments/stripe/webhook',
    '/api/payments/paypal/webhook',
  ];

  const isPublicPath = publicPaths.includes(pathname) ||
                       publicApiPrefixes.some(prefix => pathname.startsWith(prefix)) ||
                       pathname.startsWith('/_next/') || // Next.js internals
                       pathname.startsWith('/static/') || // Static files folder if you have one
                       pathname.includes('.'); // Generally ignore paths with extensions (assets)

  if (isPublicPath) {
    // If user is logged in and tries to access /login or /signup, redirect to dashboard
    // This check should only apply to actual page routes, not API or asset routes.
    if (user && (pathname === '/login' || pathname === '/signup')) {
        return NextResponse.redirect(new URL('/dashboard', origin).toString());
    }
    return response; // Allow public paths and assets
  }

  // If no user and not a public path (i.e., it's a protected path)
  if (!user) {
    if (pathname.startsWith('/api/')) {
      // For protected API routes, return 401
      return new NextResponse(JSON.stringify({ success: false, message: 'Authentication required' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    // For protected UI routes, redirect to login
    const loginUrl = new URL('/login', origin);
    // Preserve the intended destination (pathname and search params) for redirection after login
    loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // If user exists and it's a protected path, allow access
  // (Implicitly, if !isPublicPath && user, then it's a protected path and user has access)
  // The earlier check for user && (pathname === '/login' || pathname === '/signup') handles logged-in users trying to access auth pages.

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - specific asset folders like /fonts/ or /images/
     *
     * The goal is to run middleware on all navigable pages and API routes
     * that require auth checks or redirects, while minimizing runs on static assets.
     */
    '/((?!_next/static|_next/image|favicon.ico|fonts/|images/).*)',
  ],
};
