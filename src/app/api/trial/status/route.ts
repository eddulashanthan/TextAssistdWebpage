// src/app/api/trial/status/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ServerTrialState } from '@/lib/types/trial';

// Define these in a shared utility file (e.g., src/lib/utils/apiUtils.ts) later
function createErrorResponse(message: string, status: number, details?: unknown): NextResponse {
  console.error(`API Error: ${message}`, details);
  return NextResponse.json({ error: message, details }, { status });
}

function createSuccessResponse(data: unknown, status: number = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export async function GET(request: Request) {
  let supabaseAdmin;
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return createErrorResponse('Supabase configuration missing', 500);
    }
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');

    if (!deviceId) {
      return createErrorResponse('deviceId query parameter is required', 400);
    }

    const { data: trial, error: fetchError } = await supabaseAdmin
      .from('trials')
      .select('*')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (fetchError) {
      return createErrorResponse('Error fetching trial status', 500, fetchError.message);
    }

    if (!trial) {
      return createSuccessResponse({
        isActive: false,
        message: 'No trial found for this device.',
        error: 'Trial not found.' // Added to conform with ServerTrialState and provide more context
      } as ServerTrialState, 200); // Return 200 with isActive: false as per typical status checks
    }

    const now = new Date();
    const expiresAt = new Date(trial.expires_at);
    const isActive = expiresAt > now;
    let remainingDays = 0;

    if (isActive) {
      remainingDays = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    return createSuccessResponse({
      isActive,
      trialId: trial.id,
      deviceId: trial.device_id,
      trialActivatedAt: trial.activated_at,
      trialExpiresAt: trial.expires_at,
      remainingDays,
      message: isActive ? 'Trial is active.' : 'Trial has expired.',
    } as ServerTrialState);

  } catch (error) {
    let errorMessage = 'An unknown error occurred while fetching trial status.';
    let errorDetails: unknown;
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    return createErrorResponse('Failed to fetch trial status', 500, { message: errorMessage, details: errorDetails });
  }
}

// Basic CORS Headers - Vercel handles OPTIONS preflight automatically for functions.
// However, ensure your Vercel project settings also allow your Swift app's origin if necessary.
// Or, use next.config.js for more robust CORS configuration.
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*', // Be more specific in production
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
