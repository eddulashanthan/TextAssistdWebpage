// src/app/api/trial/status/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', // Assuming POST as per previous structure
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
  // Potentially other fields from your 'trials' table if needed by formatTrialResponse
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

export async function POST(request: Request) { // Assuming POST to receive system_id in body
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing Supabase environment variables');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500, headers: CORS_HEADERS });
    }

    const { system_id } = await request.json();

    if (!system_id) {
      return NextResponse.json({ error: 'system_id is required' }, { status: 400, headers: CORS_HEADERS });
    }

    // Fetch trial by system_id
    const { data: trial, error: fetchError } = await supabaseAdmin
      .from('trials')
      .select('*')
      .eq('system_id', system_id)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching trial by system_id:', fetchError);
      return NextResponse.json({ error: 'Error fetching trial status', details: fetchError.message }, { status: 500, headers: CORS_HEADERS });
    }

    if (!trial) {
      return NextResponse.json({ error: 'Trial not found for this system ID' }, { status: 404, headers: CORS_HEADERS });
    }

    let currentStatus = trial.status;
    let trialDataToUpdate: Partial<TrialData> = {
        last_seen_at: new Date().toISOString(),
        sessions_count: trial.sessions_count + 1 // Increment sessions_count
    };

    // Check if trial is active and has expired
    if (trial.status === 'active' && new Date(trial.expiry_time) < new Date()) {
      currentStatus = 'expired';
      trialDataToUpdate.status = 'expired';
    }

    // Update last_seen_at, sessions_count, and status if it changed
    const { data: updatedTrial, error: updateError } = await supabaseAdmin
      .from('trials')
      .update(trialDataToUpdate)
      .eq('id', trial.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating trial data (last_seen_at, sessions_count, status):', updateError);
      // Log error but proceed with potentially stale data or the original trial data before update attempt
      // This ensures client still gets a response. The data might be slightly off if update fails.
      const responseTrial = { ...trial, ...trialDataToUpdate }; // Attempt to merge updates for response
      return NextResponse.json(formatTrialResponse(responseTrial, 'Trial status retrieved, update failed.'), { status: 200, headers: CORS_HEADERS });
    }

    return NextResponse.json(formatTrialResponse(updatedTrial as TrialData, 'Trial status retrieved successfully.'), { status: 200, headers: CORS_HEADERS });

  } catch (error: any) {
    console.error('Error in /api/trial/status:', error);
    return NextResponse.json({ error: 'An unexpected error occurred', details: error.message }, { status: 500, headers: CORS_HEADERS });
  }
}
