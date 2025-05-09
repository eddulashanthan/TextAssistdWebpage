import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabase as defaultSupabase } from '@/lib/utils/supabase';

export async function POST(req: NextRequest) {
  let supabase;
  
  // In test environment, use the mocked Supabase client
  if (process.env.NODE_ENV === 'test') {
    supabase = defaultSupabase;
  } else {
    // In production, use server-side Supabase client with cookies
    const cookieStore = await cookies();
    supabase = createServerClient(
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
  }

  try {
    const body = await req.json();
    const { licenseId, hoursUsed } = body;
    
    if (typeof hoursUsed !== 'number' || hoursUsed <= 0) {
      return NextResponse.json({ error: 'Hours used must be a positive number' }, { status: 400 });
    }

    // Track usage using the track_usage function
    const { data: usageResult, error: usageError } = await supabase
      .rpc('track_usage', {
        minutes_used: hoursUsed * 60,
        license_id: licenseId
      });

    if (usageError) {
      // Check for specific error codes from Supabase
      if (usageError.code === 'PGRST116') {
        return NextResponse.json({ error: 'License not found' }, { status: 404 });
      }
      console.error('Usage tracking error:', usageError);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    if (!usageResult.success) {
      // Map specific error messages
      if (usageResult.message?.includes('revoked')) {
        return NextResponse.json({ error: 'License is revoked' }, { status: 403 });
      }
      if (usageResult.message?.includes('insufficient')) {
        return NextResponse.json({ error: 'Insufficient hours remaining' }, { status: 403 });
      }
      return NextResponse.json({ 
        error: usageResult.message || 'Failed to track usage'
      }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      hoursRemaining: usageResult.hours_remaining,
      message: 'Usage tracked successfully'
    }, { status: 200 });

  } catch (error) {
    console.error('Usage tracking error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}