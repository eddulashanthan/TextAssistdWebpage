import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => request.cookies.get(name)?.value,
        set: (name, value, options) => {
          res.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove: (name, options) => {
          res.cookies.delete({
            name,
            ...options,
          });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  // Handle protected routes
  const pathname = request.nextUrl.pathname;
  const isApiLicensesGeneral = pathname.startsWith('/api/licenses');
  const isTrackUsageRoute = pathname === '/api/licenses/track-usage';

  // Protect dashboard, general /api/licenses (but not track-usage), and /api/usage
  if (pathname.startsWith('/dashboard') || 
      (isApiLicensesGeneral && !isTrackUsageRoute) || 
      pathname.startsWith('/api/usage')) {
    if (!session) {
      // For API routes, return 401 Unauthorized
      if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
      // For dashboard routes, redirect to login
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('redirect', request.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Handle auth routes (login/signup)
  if (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup') {
    if (session) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return res;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/licenses/:path*',
    '/api/usage/:path*',
    '/login',
    '/signup',
  ],
};