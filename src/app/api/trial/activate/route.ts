// src/app/api/trial/activate/route.ts
import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface TrialData {
  id: string;
  system_id: string;
  user_id: string | null;
  status: 'active' | 'expired';
  start_time: string;
  expiry_time: string;
  duration_seconds: number;
  total_usage_minutes: number;
  sessions_count: number;
  features_used: string[];
  last_seen_at: string;
}

function formatTrialResponse(trial: TrialData, message: string) {
  const now = Date.now();
  const expiry = new Date(trial.expiry_time).getTime();
  const remaining_seconds = trial.status === 'active' ? Math.max(0, Math.floor((expiry - now) / 1000)) : 0;

  return {
    trial_id: trial.id,
    system_id: trial.system_id,
    user_id: trial.user_id,
    status: trial.status,
    start_time: trial.start_time,
    expiry_time: trial.expiry_time,
    duration_seconds: trial.duration_seconds,
    remaining_seconds: remaining_seconds,
    total_usage_minutes: trial.total_usage_minutes,
    sessions_count: trial.sessions_count,
    features_used: trial.features_used,
    message: message,
  };
}

export async function POST(request: Request) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase environment variables');
    return NextResponse.json({ error: 'Server configuration error - missing Supabase credentials' }, { status: 500, headers: CORS_HEADERS });
  }
  const supabaseAdmin: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { system_id, user_id } = await request.json();

    if (!system_id) {
      return NextResponse.json({ error: 'system_id is required' }, { status: 400, headers: CORS_HEADERS });
    }

    // Check if trial for this system_id already exists
    const { data: existingTrial, error: fetchError } = await supabaseAdmin
      .from('trials')
      .select('*')
      .eq('system_id', system_id)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching existing trial:', fetchError);
      return NextResponse.json({ error: 'Error checking trial status', details: fetchError.message }, { status: 500, headers: CORS_HEADERS });
    }

    if (existingTrial) {
      // If trial exists, check if it's expired and update if necessary
      if (existingTrial.status === 'active' && new Date(existingTrial.expiry_time) < new Date()) {
        const { data: updatedTrial, error: updateError } = await supabaseAdmin
          .from('trials')
          .update({ status: 'expired', last_seen_at: new Date().toISOString() })
          .eq('id', existingTrial.id)
          .select()
          .single();
        if (updateError) {
            console.error('Error updating expired trial status:', updateError);
            // Proceed with existingTrial data, client will see it as expired
        }
        return NextResponse.json(formatTrialResponse(updatedTrial || existingTrial, 'Trial already exists.'), { status: 200, headers: CORS_HEADERS });
      }
      return NextResponse.json(formatTrialResponse(existingTrial, 'Trial already exists.'), { status: 200, headers: CORS_HEADERS });
    }

    // Create new trial
    const startTime = new Date();
    const durationSeconds = 1200; // 20 minutes
    const expiryTime = new Date(startTime.getTime() + durationSeconds * 1000);

    const newTrialData = {
      system_id: system_id,
      user_id: user_id || null,
      status: 'active',
      start_time: startTime.toISOString(),
      duration_seconds: durationSeconds,
      expiry_time: expiryTime.toISOString(),
      total_usage_minutes: 0,
      sessions_count: 1, // First session
      features_used: [],
      last_seen_at: startTime.toISOString(),
    };

    const { data: createdTrial, error: insertError } = await supabaseAdmin
      .from('trials')
      .insert(newTrialData)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating new trial:', insertError);
      return NextResponse.json({ error: 'Failed to activate trial', details: insertError.message }, { status: 500, headers: CORS_HEADERS });
    }

    if (!createdTrial) {
        console.error('Failed to create trial, no data returned.');
        return NextResponse.json({ error: 'Failed to activate trial, server error.' }, { status: 500, headers: CORS_HEADERS });
    }

    return NextResponse.json(formatTrialResponse(createdTrial as TrialData, 'Trial activated successfully.'), { status: 201, headers: CORS_HEADERS });

  } catch (error: unknown) {
    console.error('Error in /api/trial/activate:', error);
    let errorMessage = 'An unexpected error occurred';
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage, details: error }, { status: 500, headers: CORS_HEADERS });
  }
}
