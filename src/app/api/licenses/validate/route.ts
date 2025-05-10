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
      const statusCode: number = 500; // Default status code for unexpected RPC errors
      
      // Construct a details object for createErrorResponse
      const errorDetailsPayload: Record<string, unknown> = {};
      // PostgrestError types 'details' and 'hint' as string.
      // We add them to payload if they are non-empty.
      if (rpcError.details) { 
        errorDetailsPayload.supabase_error_details_string = rpcError.details;
      }
      if (rpcError.hint) { 
        errorDetailsPayload.supabase_error_hint = rpcError.hint;
      }
      // Add any other relevant parts of rpcError if they exist and are useful for the client
      // For example, if rpcError itself has structured fields other than 'message', 'code', 'details', 'hint'.

      return createErrorResponse(
        rpcError.message || 'Failed to validate license due to a database error.', 
        // For status: Check if 'status' exists on rpcError and is a number
        ('status' in rpcError && typeof (rpcError as Record<string, unknown>)['status'] === 'number'
          ? (rpcError as Record<string, unknown>)['status'] as number 
          : statusCode),
        rpcError.code || 'DB_RPC_ERROR', // .code is part of PostgrestError
        Object.keys(errorDetailsPayload).length > 0 ? errorDetailsPayload : undefined // Pass object or undefined
      );
    }

    // If there's no rpcError, it means the call was successful from Supabase's perspective
    // but we still need to check if the license itself is 'valid' according to the RPC response.
    if (rpcResponse && rpcResponse.valid === true) {
      // License is valid according to Supabase RPC
      const license_details_for_client = {
        status: rpcResponse.status, // Should be "active"
        reason: rpcResponse.reason, // Include if relevant
        hours_remaining: rpcResponse.hours_remaining,
        linked_system_id: rpcResponse.linked_system_id,
        expires_at: rpcResponse.expires_at,
        // Add any other fields from rpcResponse that should be in 'details'
      };
      console.log('[LOG] /api/licenses/validate: RPC response is valid. Constructed license_details_for_client:', JSON.stringify(license_details_for_client));
      
      // This object is what the Swift client expects for StandardLicenseValidationData
      const clientExpectedDataPayload = {
        message: rpcResponse.message || 'License valid', // This is StandardLicenseValidationData.message
        key: licenseKey,                                // This is StandardLicenseValidationData.key
        details: license_details_for_client             // This is StandardLicenseValidationData.details
      };

      // createSuccessResponse will produce JSON: { success: true, data: clientExpectedDataPayload }
      // The Swift client's StandardApiResponse.data will be populated by clientExpectedDataPayload.
      return createSuccessResponse(
        clientExpectedDataPayload, 
        200
      );

    } else {
      // License is NOT valid according to Supabase RPC (e.g., expired, not found, system mismatch, or rpcResponse itself is null/undefined)
      const reason = rpcResponse?.reason || 'UNKNOWN_VALIDATION_FAILURE';
      const message = rpcResponse?.message || 'License validation failed.';
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