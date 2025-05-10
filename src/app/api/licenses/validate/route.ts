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
    const { data: rpcResponse, error: rpcError } = await supabase
      .rpc('validate_license', {
        p_license_key: licenseKey,
        p_system_id: systemId
      });

    if (rpcError) {
      console.error('API Validate: RPC call to validate_license failed:', rpcError);
      return createErrorResponse(
        rpcError.message || 'License validation service encountered an error.', 
        500, 
        'VALIDATION_RPC_ERROR', 
        { details: rpcError.details || rpcError.hint || rpcError.message }
      );
    }

    // Check the structure of the RPC response
    if (!rpcResponse || typeof rpcResponse.valid === 'undefined') {
        console.error('API Validate: RPC validate_license returned unexpected data structure:', rpcResponse);
        return createErrorResponse(
            'License validation service returned an unexpected response format.',
            500,
            'VALIDATION_RPC_UNEXPECTED_RESPONSE_STRUCTURE'
        );
    }

    if (!rpcResponse.valid) {
      // Use the 'reason' and 'message' from the RPC directly
      const message = rpcResponse.message || 'License validation failed.';
      const reason = rpcResponse.reason || 'LICENSE_INVALID';
      let statusCode = 403; // Default to forbidden

      // Adjust status codes based on specific reasons
      if (reason === 'not_found') {
        statusCode = 404;
      } else if (reason === 'time_expired' || reason === 'hours_depleted' || (rpcResponse.status === 'expired')) {
        statusCode = 403; // Or a more specific one like 410 Gone if you prefer for expired
      } else if (reason === 'status_inactive' || reason === 'system_mismatch') {
        statusCode = 403;
      } else if (reason === 'internal_error') {
        statusCode = 500;
      }
      
      // Include additional details from RPC response if available
      const errorDetails: Record<string, any> = {};
      if (rpcResponse.license_key) errorDetails.licenseKey = rpcResponse.license_key;
      if (rpcResponse.status) errorDetails.status = rpcResponse.status;
      if (rpcResponse.hours_remaining !== undefined) errorDetails.hoursRemaining = rpcResponse.hours_remaining;
      if (rpcResponse.expires_at) errorDetails.expiresAt = rpcResponse.expires_at;
      if (rpcResponse.error_details) errorDetails.rpcErrorDetails = rpcResponse.error_details;


      return createErrorResponse(message, statusCode, reason.toUpperCase(), Object.keys(errorDetails).length > 0 ? errorDetails : undefined);
    }

    // If RPC validation is successful, use the license_details directly
    // No need for a second database call.
    if (!rpcResponse.license_details) {
        console.error('API Validate: Successful RPC validate_license response missing license_details:', rpcResponse);
        return createErrorResponse(
            'License validation succeeded but essential details are missing.',
            500,
            'VALIDATION_SUCCESS_MISSING_DETAILS'
        );
    }
    
    // The RPC now returns all necessary details within the 'license_details' object.
    // Map these details to the desired response structure.
    const licenseDetails = rpcResponse.license_details;

    return createSuccessResponse({
      message: rpcResponse.message || 'License validated successfully',
      license: {
        // Ensure all fields your Swift client expects are mapped here
        // from licenseDetails
        id: licenseDetails.user_id, // Assuming user_id can act as a primary reference for the license context on client. Adjust if license UUID 'id' is needed from SQL.
        licenseKey: licenseDetails.license_key,
        userId: licenseDetails.user_id,
        hoursRemaining: licenseDetails.hours_remaining,
        status: licenseDetails.status,
        licenseType: licenseDetails.license_type,
        linkedSystemId: licenseDetails.linked_system_id,
        createdAt: licenseDetails.created_at,
        purchaseDate: licenseDetails.purchase_date,
        lastValidatedAt: licenseDetails.last_validated_at,
        expiresAt: licenseDetails.expires_at,
        transactions: licenseDetails.transactions 
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