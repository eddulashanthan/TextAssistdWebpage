import { NextRequest } from 'next/server';
import { supabase } from '@/lib/utils/supabase';
import { createErrorResponse, createSuccessResponse } from '@/lib/apiUtils';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { licenseKey, systemId } = body;

    if (!licenseKey || !systemId) {
      return createErrorResponse('License key and system ID are required', 400, 'MISSING_PARAMETERS');
    }

    // Call validate_license function
    const { data: validationResult, error: rpcError } = await supabase
      .rpc('validate_license', {
        license_key: licenseKey,
        system_id: systemId
      });

    if (rpcError) {
      console.error('API Validate: RPC call to validate_license failed:', rpcError);
      return createErrorResponse(
        'License validation service encountered an error.', 
        500, 
        'VALIDATION_RPC_ERROR', 
        { details: rpcError.message }
      );
    }

    // Check the 'valid' field from the RPC result
    if (!validationResult || typeof validationResult.valid === 'undefined') {
        console.error('API Validate: RPC validate_license returned unexpected data:', validationResult);
        return createErrorResponse(
            'License validation service returned an unexpected response.',
            500,
            'VALIDATION_RPC_UNEXPECTED_RESPONSE'
        );
    }

    if (!validationResult.valid) {
      let statusCode = 403;
      let errorCode = 'LICENSE_INVALID';
      const message = validationResult.message || 'License validation failed.';

      if (message.includes('not found')) {
        statusCode = 404;
        errorCode = 'LICENSE_NOT_FOUND';
      } else if (message.includes('bound to different system')) {
        errorCode = 'LICENSE_SYSTEM_MISMATCH';
      } else if (message.includes('expired')) {
        errorCode = 'LICENSE_EXPIRED';
      } else if (message.includes('not active')) {
        errorCode = 'LICENSE_NOT_ACTIVE';
      }
      // Add more specific checks if needed

      return createErrorResponse(message, statusCode, errorCode);
    }

    // If RPC validation is successful, proceed to get full license details for the response.
    // Note: The RPC returns most necessary fields (hours_remaining, status, expires_at).
    // This additional fetch is primarily for license.id and license.last_validated_at as per original logic.
    // Consider optimizing this by having the RPC return all necessary data if possible.
    const { data: license, error: licenseFetchError } = await supabase
      .from('licenses')
      .select('id, expires_at, status, last_validated_at') // Select only needed fields
      .eq('key', licenseKey)
      .single();

    if (licenseFetchError || !license) {
      console.error('API Validate: Failed to fetch license details post-RPC validation:', licenseFetchError);
      return createErrorResponse(
        'Failed to retrieve full license details after validation.', 
        500, // This is a server-side inconsistency
        'POST_VALIDATION_FETCH_ERROR', 
        { licenseKey }
      );
    }

    // Construct success response using data from both RPC and direct fetch
    return createSuccessResponse({
      message: validationResult.message || 'License validated successfully',
      license: {
        id: license.id,
        expiresAt: license.expires_at || validationResult.expires_at || null, // Prefer DB, fallback to RPC
        hoursRemaining: validationResult.hours_remaining,
        status: license.status || validationResult.status, // Prefer DB, fallback to RPC
        lastValidatedAt: license.last_validated_at
      }
    }, 200);

  } catch (error: unknown) {
    console.error('API Validate: Unhandled error:', error);
    let errorMessage = 'An unexpected server error occurred.';
    let errorName: string | undefined;

    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      return createErrorResponse(
        'Invalid JSON payload',
        400,
        'INVALID_JSON_PAYLOAD',
        { details: error.message }
      );
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