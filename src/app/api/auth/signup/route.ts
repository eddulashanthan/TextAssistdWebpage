import { NextResponse } from 'next/server';
import { supabase } from '@/lib/utils/supabase';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      user: data.user,
      message: 'Signup successful. Please check your email for verification.',
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}