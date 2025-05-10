import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // If "next" is in param, use it. Otherwise, default to /dashboard after verification.
  const next = searchParams.get('next') ?? '/dashboard'; 

  if (code) {
    // If the linter sees cookies() as a Promise, we await it.
    const cookieStoreInstance = await cookies(); 

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStoreInstance.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStoreInstance.set(name, value, options);
          },
          remove(name: string, options: CookieOptions) {
            cookieStoreInstance.set(name, '', options);
          },
        },
      }
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const redirectUrl = new URL(next, origin);
      if (redirectUrl.origin === origin) {
        return NextResponse.redirect(redirectUrl.toString());
      }
      // Fallback to /dashboard if the 'next' URL was external or invalid
      return NextResponse.redirect(new URL('/dashboard', origin).toString()); 
    }
  }

  const errorRedirectUrl = new URL('/login', origin); 
  errorRedirectUrl.searchParams.set('error', 'auth_error');
  errorRedirectUrl.searchParams.set('message', 'Invalid or expired verification link. Please try logging in again.');
  return NextResponse.redirect(errorRedirectUrl.toString());
}
