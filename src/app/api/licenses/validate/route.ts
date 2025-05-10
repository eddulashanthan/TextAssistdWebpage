import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createErrorResponse, createSuccessResponse } from '@/lib/apiUtils';

export async function POST(req: NextRequest) {
  console.log('[LOG] /api/licenses/validate: POST request received');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[ERROR] /api/licenses/validate: Supabase URL or Service Key not configured.');
    return new NextResponse(JSON.stringify({ 
      message: 'Server configuration error: Supabase environment variables not set.', 
      errorCode: 'SERVER_CONFIG_ERROR',
      details: {}
    }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    console.log('[LOG] /api/licenses/validate: Request body:', JSON.stringify(body));

    const { licenseKey, systemId } = body;

    if (!licenseKey || !systemId) {
      console.warn('[WARN] /api/licenses/validate: Missing licenseKey or systemId');
      return createErrorResponse('License key and system ID are required', 400, 'MISSING_PARAMETERS');
    }

    console.log(`[LOG] /api/licenses/validate: Calling RPC 'validate_license' with key: ${licenseKey}, systemId: ${systemId}`);
    const { data: rpcResponse, error: rpcError } = await supabaseAdmin
      .rpc('validate_license', {
        p_license_key: licenseKey,
        p_system_id: systemId,
      });

    // CRITICAL LOGGING for raw Supabase response:
    console.log('[LOG] /api/licenses/validate: Raw rpcResponse:', JSON.stringify(rpcResponse));
    console.log('[LOG] /api/licenses/validate: Raw rpcError:', JSON.stringify(rpcError));

    if (rpcError) {
      console.error('[ERROR] /api/licenses/validate: RPC error occurred:', JSON.stringify(rpcError));
      const statusCode: number = 500;
      const errorCode: string = rpcError.code || 'RPC_ERROR'; // Use Supabase error code if available
      // Example: Postgres error codes for unique violation '23505', not found related 'P0002' (custom from SQL fn)
      // Adjust statusCode based on specific rpcError.code if needed
      // if (rpcError.code === 'P0002' /* NO_ACTIVE_LICENSE_FOUND */) { statusCode = 404; }

      return createErrorResponse(
        rpcError.message || 'Failed to validate license due to a database error.',
        statusCode,
        errorCode,
        { hint: rpcError.hint, details: rpcError.details } 
      );
    }

    if (!rpcResponse || typeof rpcResponse.valid !== 'boolean') {
      console.error('[ERROR] /api/licenses/validate: Invalid or unexpected response structure from RPC:', { rpcResponse });
      return createErrorResponse('Invalid response from validation service.', 500, 'RPC_INVALID_RESPONSE', { receivedResponse: rpcResponse });
    }

    if (rpcResponse.valid) {
      // Construct license_details from the flat rpcResponse object
      const constructedLicenseDetails = {
        hours_remaining: rpcResponse.hours_remaining,
        status: rpcResponse.status,
        linked_system_id: rpcResponse.linked_system_id,
        expires_at: rpcResponse.expires_at,
        // Add any other fields from rpcResponse that should be part of license_details
      };
      console.log('[LOG] /api/licenses/validate: RPC response is valid. Constructed license_details:', JSON.stringify(constructedLicenseDetails));
      
      // The previous check for !rpcResponse.license_details is removed as we now construct it.
      // It's assumed that if rpcResponse.valid is true, the necessary fields for constructedLicenseDetails are present.

      return createSuccessResponse(
        {
          valid: true, 
          message: rpcResponse.message || 'License validated successfully.',
          license_details: constructedLicenseDetails // Use the constructed object here
        }, 
        200
      );
    } else {
      // VALIDATION FAILED as per RPC logic (e.g., key not found, expired, etc.)
      const reason = rpcResponse.reason || 'UNKNOWN_VALIDATION_FAILURE';
      const message = rpcResponse.message || 'License validation failed.';
      console.warn(`[WARN] /api/licenses/validate: License validation failed by RPC. Reason: ${reason}, Message: ${message}. Full Response:`, JSON.stringify(rpcResponse));

      let statusCode: number = 400; 
      if (reason === 'not_found') {
        statusCode = 404;
      } else if (reason === 'time_expired' || reason === 'hours_depleted' || rpcResponse.status === 'expired') {
        statusCode = 403; 
      } else if (reason === 'status_inactive' || reason === 'system_mismatch') {
        statusCode = 403;
      } else if (reason === 'internal_error') { 
        statusCode = 500;
      }
      
      const errorDetailsPayload = { 
        reason: reason,
        ...(rpcResponse.license_key && { licenseKey: rpcResponse.license_key }),
        ...(rpcResponse.status && { status: rpcResponse.status }),
        ...(rpcResponse.hours_remaining !== undefined && { hoursRemaining: rpcResponse.hours_remaining }),
        ...(rpcResponse.expires_at && { expiresAt: rpcResponse.expires_at }),
      };

      return createErrorResponse(message, statusCode, reason, errorDetailsPayload);
    }

  } catch (error: unknown) {
    console.error('[CRITICAL_UNHANDLED_ERROR] /api/licenses/validate: Exception caught in route handler:', {
      errorMessage: error instanceof Error ? error.message : 'Unknown error message',
      errorStack: error instanceof Error ? error.stack : 'No stack trace available',
      errorDetails: typeof error === 'object' && error !== null && 'details' in error ? (error as { details: unknown }).details : 'No details available',
      rawError: error
    });
    return createErrorResponse(
      'An unexpected server error occurred during license validation.', 
      500, 
      'UNEXPECTED_SERVER_ERROR', 
      { originalErrorName: error instanceof Error ? error.name : 'Unknown error', originalErrorMessage: error instanceof Error ? error.message : 'Unknown error message' }
    );
  }
}