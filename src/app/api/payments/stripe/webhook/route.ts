import { headers } from 'next/headers';
import Stripe from 'stripe';
import { supabase } from '@/lib/utils/supabase';
import { createErrorResponse, createSuccessResponse } from '@/lib/apiUtils';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
});

export async function POST(request: Request) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return createErrorResponse(
      'Missing stripe-signature header',
      400,
      'MISSING_HEADER'
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const { userId, hours } = session.metadata!;
      const customerEmail = session.customer_details?.email; // Get customer email

      // Create license using the Supabase function
      const { data: licenseData, error: licenseError } = await supabase.rpc(
        'create_license',
        {
          user_id: userId,
          hours: parseInt(hours),
          transaction_id: session.payment_intent as string,
          payment_gateway: 'stripe',
          amount: session.amount_total! / 100,
          currency: session.currency
        }
      );

      if (licenseError) {
        console.error('Stripe Webhook: License creation failed:', licenseError);
        return createErrorResponse(
          'Failed to create license',
          500,
          'LICENSE_CREATION_FAILED',
          { details: licenseError.message } // Pass only message for security
        );
      }

      // If license creation was successful and we have a license key, prepare for email
      if (licenseData && licenseData.success && licenseData.license_key) {
        console.log(`Stripe Webhook: License created: ${licenseData.license_key} for user ${userId}, email: ${customerEmail}`);
        
        // TODO: Implement email sending logic here
        // Example:
        // if (customerEmail) {
        //   await sendLicenseKeyEmail(customerEmail, licenseData.license_key);
        //   console.log(`Stripe Webhook: Attempted to send license key ${licenseData.license_key} to ${customerEmail}`);
        // } else {
        //   console.error('Stripe Webhook: Customer email not found in Stripe session, cannot send license key email.');
        // }
      } else {
        // Log an issue but still acknowledge the event to Stripe with a success response.
        // This is because the core event (payment) was likely processed by Stripe.
        // Not returning 2xx could cause Stripe to retry sending the webhook, leading to duplicate processing attempts.
        console.error('Stripe Webhook: License creation RPC did not return success or license_key:', licenseData);
      }

      // Acknowledge the event to Stripe successfully.
      // The actual business logic result (license creation) is handled above.
      return createSuccessResponse({ 
        eventProcessed: 'checkout.session.completed',
        licenseDetails: licenseData 
      }); 
    }

    // Handle other event types gracefully by acknowledging them
    console.log(`Stripe Webhook: Received unhandled event type: ${event.type}`);
    return createSuccessResponse({ eventReceived: event.type, handled: false });

  } catch (error: unknown) { 
    console.error('API StripeWebhook: Unhandled error in webhook:', error);
    let errorMessage = 'An unexpected server error occurred while processing the Stripe webhook.';
    let errorName: string | undefined;
    let statusCode = 500;
    let errorCode = 'STRIPE_WEBHOOK_INTERNAL_ERROR';
    let errorDetails: Record<string, unknown> = {};

    if (error instanceof Stripe.errors.StripeError) {
      errorMessage = error.message;
      statusCode = error.statusCode || 500;
      errorCode = error.type || 'STRIPE_API_ERROR'; // Could be more specific like STRIPE_WEBHOOK_SIGNATURE_ERROR if we can distinguish
      errorDetails = { stripeErrorType: error.type, stripeRaw: error.raw };
    } else if (error instanceof SyntaxError && error.message.includes('JSON')) {
      // This case might not be hit if Stripe SDK handles JSON parsing issues before this catch block
      return createErrorResponse('Invalid JSON payload in webhook.', 400, 'INVALID_JSON_PAYLOAD', { details: error.message });
    } else if (error instanceof Error) {
      errorMessage = error.message;
      errorName = error.name;
      errorDetails = { errorName: errorName };
    } else {
      errorDetails = { thrownValue: error };
    }
    
    return createErrorResponse(errorMessage, statusCode, errorCode, errorDetails);
  }
}