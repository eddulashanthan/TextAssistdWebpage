// src/app/api/trial/activate/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ActivateTrialRequest, ServerTrialState } from '@/lib/types/trial';

// Define these in a shared utility file (e.g., src/lib/utils/apiUtils.ts) later
function createErrorResponse(message: string, status: number, details?: unknown): NextResponse {
  console.error(`API Error: ${message}`, details);
  return NextResponse.json({ error: message, details }, { status });
}

function createSuccessResponse(data: unknown, status: number = 200): NextResponse {
  return NextResponse.json(data, { status });
}

const TRIAL_DURATION_DAYS = 7;

export async function POST(request: Request) {
  let supabaseAdmin;
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return createErrorResponse('Supabase configuration missing', 500);
    }

    supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const body = await request.json() as ActivateTrialRequest;
    const { deviceId } = body;

    if (!deviceId) {
      return createErrorResponse('deviceId is required', 400);
    }

    // Check if a trial already exists for this deviceId
    const { data: existingTrial, error: fetchError } = await supabaseAdmin
      .from('trials')
      .select('*')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (fetchError) {
      return createErrorResponse('Error fetching trial status', 500, fetchError.message);
    }

    if (existingTrial) {
      const now = new Date();
      const expiresAt = new Date(existingTrial.expires_at);
      const isActive = expiresAt > now;
      const remainingDays = isActive ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;

      if (isActive) {
        return createSuccessResponse({
          isActive: true,
          trialId: existingTrial.id,
          deviceId: existingTrial.device_id,
          trialActivatedAt: existingTrial.activated_at,
          trialExpiresAt: existingTrial.expires_at,
          remainingDays,
          message: 'Trial already active.',
        } as ServerTrialState);
      } else {
        // Trial exists but has expired
        return createErrorResponse('Trial has expired for this device.', 403, {
          isActive: false,
          trialId: existingTrial.id,
          deviceId: existingTrial.device_id,
          trialActivatedAt: existingTrial.activated_at,
          trialExpiresAt: existingTrial.expires_at,
          remainingDays: 0,
          message: 'Trial has expired for this device.',
        } as ServerTrialState);
      }
    }

    // No existing trial, or existing trial has been dealt with (e.g. if you add logic to allow re-activation)
    // Create a new trial
    const activatedAt = new Date();
    const expiresAt = new Date(activatedAt.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);

    const { data: newTrial, error: insertError } = await supabaseAdmin
      .from('trials')
      .insert({
        device_id: deviceId,
        activated_at: activatedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertError || !newTrial) {
      return createErrorResponse('Failed to activate trial', 500, insertError?.message);
    }
    
    const remainingDays = Math.ceil((expiresAt.getTime() - activatedAt.getTime()) / (1000 * 60 * 60 * 24));

    return createSuccessResponse({
      isActive: true,
      trialId: newTrial.id,
      deviceId: newTrial.device_id,
      trialActivatedAt: newTrial.activated_at,
      trialExpiresAt: newTrial.expires_at,
      remainingDays,
      message: 'Trial activated successfully.',
    } as ServerTrialState, 201);

  } catch (error) {
    let errorMessage = 'An unknown error occurred during trial activation.';
    let errorDetails: unknown;
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    // Check if it's a JSON parsing error
    if (error instanceof SyntaxError && request.bodyUsed && !request.headers.get('content-type')?.includes('application/json')) {
        errorMessage = 'Invalid request body: Expected JSON.';
        return createErrorResponse(errorMessage, 400, errorDetails);
    }
    return createErrorResponse('Failed to activate trial', 500, { message: errorMessage, details: errorDetails });
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
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
