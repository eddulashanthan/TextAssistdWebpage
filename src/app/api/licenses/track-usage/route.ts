import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createErrorResponse, createSuccessResponse } from '@/lib/apiUtils';

// Handle OPTIONS requests for CORS
export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: { 'Allow': 'POST, OPTIONS' } });
}

export async function POST(req: NextRequest) {
  console.info('API TrackUsage: Received request');
  try {
    // For server-side API routes, always use the service role key for privileged operations
    // Ensure SUPABASE_SERVICE_ROLE_KEY is set in your server environment variables
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('API TrackUsage: Fatal: SUPABASE_SERVICE_ROLE_KEY is not set.');
      // Note: This specific error message might expose too much detail in a generic error response.
      // Consider a more generic message for production if this check fails.
      return createErrorResponse('Server configuration error. Please contact support.', 500, 'SERVER_CONFIG_ERROR');
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('API TrackUsage: Fatal: NEXT_PUBLIC_SUPABASE_URL is not set.');
      return createErrorResponse('Server configuration error. Please contact support.', 500, 'SERVER_CONFIG_ERROR');
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();
    const { licenseKey, systemId, minutesUsed } = body;

    console.info(`API TrackUsage: Processing: licenseKey=${licenseKey}, systemId=${systemId}, minutesUsed=${minutesUsed}`);

    if (!licenseKey) {
      console.warn('API TrackUsage: Validation Error: License key is required');
      return createErrorResponse('License key is required', 400, 'MISSING_LICENSE_KEY');
    }
    if (!systemId) {
      console.warn('API TrackUsage: Validation Error: System ID is required');
      return createErrorResponse('System ID is required', 400, 'MISSING_SYSTEM_ID');
    }
    if (typeof minutesUsed !== 'number' || minutesUsed <= 0) {
      console.warn(`API TrackUsage: Validation Error: Minutes used must be a positive number, got ${minutesUsed}`);
      return createErrorResponse(
        'Minutes used must be a positive number',
        400,
        'INVALID_MINUTES_USED',
        { received: minutesUsed }
      );
    }

    const { data: rpcResult, error: rpcError } = await supabaseAdmin
      .rpc('track_usage', {
        p_license_key: licenseKey,
        p_system_id: systemId,
        p_minutes_used: minutesUsed
      });

    if (rpcError) {
      console.error(`API TrackUsage: Supabase RPC error for license ${licenseKey}:`, rpcError);
      if (rpcError.code === 'PGRST116' || rpcError.message.includes('not found')) { 
        return createErrorResponse(
          'License not found or an internal validation failed during RPC.', 
          404, 
          'LICENSE_NOT_FOUND_RPC', 
          { details: rpcError.message }
        );
      }
      return createErrorResponse(
        rpcError.message || 'An unexpected error occurred during usage tracking RPC.', 
        500, 
        'TRACK_USAGE_RPC_ERROR', 
        { details: rpcError.message }
      );
    }

    if (!rpcResult || typeof rpcResult.success === 'undefined') {
      console.error('API TrackUsage: RPC track_usage returned unexpected data:', rpcResult);
      return createErrorResponse(
          'Usage tracking service returned an unexpected response.',
          500,
          'TRACK_USAGE_RPC_UNEXPECTED_RESPONSE'
      );
    }

    if (!rpcResult.success) {
      console.warn(`API TrackUsage: Failed to track usage for license ${licenseKey}:`, rpcResult?.message || 'RPC indicated failure');
      const message = rpcResult.message || 'Failed to track usage due to a license condition.';
      let httpStatus = 403;
      let errorCode = 'TRACK_USAGE_CONDITION_FAIL';

      if (message.includes('License not found')) {
        httpStatus = 404;
        errorCode = 'LICENSE_NOT_FOUND';
      } else if (message.includes('System ID mismatch')) {
        errorCode = 'LICENSE_SYSTEM_MISMATCH';
      } else if (message.includes('License expired')) {
        errorCode = 'LICENSE_EXPIRED';
      } else if (message.includes('License not active')) {
        errorCode = 'LICENSE_NOT_ACTIVE';
      } else if (message.includes('Insufficient hours remaining')) {
        errorCode = 'INSUFFICIENT_HOURS';
      }
      
      return createErrorResponse(message, httpStatus, errorCode, { rpcResponse: rpcResult });
    }

    console.info(`API TrackUsage: Successfully tracked usage for license ${licenseKey}. Hours remaining: ${rpcResult.hours_remaining}`);
    return createSuccessResponse({
      message: rpcResult.message || 'Usage tracked successfully.',
      hoursRemaining: rpcResult.hours_remaining,
      licenseStatus: rpcResult.status 
    }, 200);

  } catch (error: unknown) {
    console.error('API TrackUsage: Unhandled error:', error);
    let errorMessage = 'An unexpected server error occurred.';
    let errorName: string | undefined;

    if (error instanceof SyntaxError && error.message.includes('JSON')) {
        return createErrorResponse('Invalid JSON payload', 400, 'INVALID_JSON_PAYLOAD', { details: error.message });
    }

    if (error instanceof Error) {
      errorMessage = error.message;
      errorName = error.name;
    }

    return createErrorResponse(
      errorMessage, 
      500, 
      'INTERNAL_SERVER_ERROR', 
      { errorName: errorName }
    );
  }
}