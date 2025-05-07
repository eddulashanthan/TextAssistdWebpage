import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/utils/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { licenseKey, systemId } = body;

    if (!licenseKey || !systemId) {
      return NextResponse.json({ error: 'License key and system ID are required' }, { status: 400 });
    }

    // Call validate_license function
    const { data: validationResult, error: validationError } = await supabase
      .rpc('validate_license', {
        license_key: licenseKey,
        system_id: systemId
      });

    if (validationError) {
      return NextResponse.json({ error: 'Invalid license key' }, { status: 404 });
    }

    if (!validationResult.valid) {
      if (validationResult.message.includes('bound to different system')) {
        return NextResponse.json({ error: 'License is linked to another system' }, { status: 403 });
      }
      if (validationResult.message.includes('expired')) {
        return NextResponse.json({ error: 'License is expired' }, { status: 403 });
      }
      return NextResponse.json({ error: validationResult.message }, { status: 403 });
    }

    // Get full license details
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .select('*')
      .eq('key', licenseKey)
      .single();

    if (licenseError || !license) {
      return NextResponse.json({ error: 'License not found' }, { status: 404 });
    }

    return NextResponse.json({
      valid: true,
      message: 'License validated successfully',
      license: {
        id: license.id,
        expiresAt: license.expires_at || null,
        hoursRemaining: validationResult.hours_remaining,
        status: license.status,
        lastValidatedAt: license.last_validated_at
      }
    }, { status: 200 });

  } catch (error) {
    console.error('License validation error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}