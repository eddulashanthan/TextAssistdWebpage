import { NextResponse } from 'next/server';

interface ApiError {
  code?: string; // Optional machine-readable error code
  message: string; // Human-readable message
  details?: Record<string, unknown>; // Optional additional details
}

interface ApiErrorResponse {
  success: false;
  error: ApiError;
}

/**
 * Creates a standardized error response for API routes.
 *
 * @param message - The primary, human-readable error message.
 * @param status - The HTTP status code for the response.
 * @param code - Optional machine-readable error code (e.g., 'INVALID_INPUT', 'AUTH_REQUIRED').
 * @param details - Optional additional details or context about the error.
 * @returns A NextResponse object with the standardized error format.
 */
export function createErrorResponse(
  message: string,
  status: number,
  code?: string,
  details?: Record<string, unknown>
): NextResponse {
  const errorPayload: ApiErrorResponse = {
    success: false,
    error: {
      message,
    },
  };

  if (code) {
    errorPayload.error.code = code;
  }

  if (details) {
    errorPayload.error.details = details;
  }

  return NextResponse.json(errorPayload, { status });
}

/**
 * Creates a standardized success response for API routes.
 *
 * @param data - The data to be included in the success response.
 * @param status - The HTTP status code for the response (default is 200).
 * @returns A NextResponse object with the standardized success format.
 */
export function createSuccessResponse<T extends Record<string, unknown> | null>(
  data: T,
  status: number = 200
): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}
