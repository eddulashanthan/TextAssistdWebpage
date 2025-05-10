import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/'; 

  if (code) {
    // If the linter sees cookies() as a Promise, we await it.
    // This is unusual for Route Handlers but addresses the lint error.
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
            // Ensure options is correctly passed according to next/headers API
            cookieStoreInstance.set(name, value, options);
          },
          remove(name: string, options: CookieOptions) {
            // Use set with an empty value for removal, a common pattern
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
      return NextResponse.redirect(new URL('/dashboard', origin).toString()); 
    }
  }

  const errorRedirectUrl = new URL('/login', origin); 
  errorRedirectUrl.searchParams.set('error', 'auth_error');
  errorRedirectUrl.searchParams.set('message', 'Invalid or expired verification link. Please try signing up or logging in again.');
  return NextResponse.redirect(errorRedirectUrl.toString());
}
