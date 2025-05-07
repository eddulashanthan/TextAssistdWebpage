import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  // Use server-side Supabase client with cookies
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  try {
    // Get user from session (cookie/JWT)
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { minutes } = body;

    if (typeof minutes !== 'number' || minutes <= 0) {
      return NextResponse.json({ error: 'Minutes used must be a positive number' }, { status: 400 });
    }

    // Find the user's active license
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .select('key, status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('purchase_date', { ascending: false })
      .limit(1)
      .single();

    if (licenseError || !license) {
      return NextResponse.json({ error: 'Active license not found' }, { status: 404 });
    }

    // Track usage using the track_usage function
    const { data: usageResult, error: usageError } = await supabase
      .rpc('track_usage', {
        license_key: license.key,
        minutes_used: minutes
      });

    if (usageError) {
      console.error('Usage tracking error:', usageError);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    if (!usageResult.success) {
      return NextResponse.json({ error: usageResult.message }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      minutesRemaining: usageResult.minutes_remaining,
      message: usageResult.message
    }, { status: 200 });

  } catch (error) {
    console.error('Usage tracking error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}