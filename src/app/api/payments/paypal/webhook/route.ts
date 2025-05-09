import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { supabase } from '@/lib/utils/supabase';
import { createErrorResponse, createSuccessResponse } from '@/lib/apiUtils';

async function getPayPalAccessToken() {
  const response = await fetch('https://api.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Accept-Language': 'en_US',
      'Authorization': `Basic ${Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
      ).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });

  const data = await response.json();
  return data.access_token;
}

async function verifyPayPalSignature(request: NextRequest, rawBody: string): Promise<boolean> {
  const headersList = await headers();
  const transmissionId = headersList.get('paypal-transmission-id');
  const auth = headersList.get('paypal-auth-algo');
  const cert = headersList.get('paypal-cert-url');
  const transmissionSig = headersList.get('paypal-transmission-sig');
  const transmissionTime = headersList.get('paypal-transmission-time');

  if (!auth || !cert || !transmissionId || !transmissionSig || !transmissionTime) {
    return false;
  }

  const verificationResponse = await fetch('https://api.paypal.com/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `transmission_id=${transmissionId}&auth_algo=${auth}&cert_url=${cert}&transmission_sig=${transmissionSig}&transmission_time=${transmissionTime}&webhook_id=${process.env.PAYPAL_WEBHOOK_ID}&webhook_event=${rawBody}`,
  });

  try {
    const verificationJson = await verificationResponse.json();
    return verificationJson.verification_status === 'SUCCESS';

  } catch (err: unknown) { 
    console.error('API PayPalWebhook: Error verifying PayPal signature:', 
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.clone().text();
    const event = await request.json();
    
    // Get PayPal headers
    const headersList = await headers();
    
    const auth = headersList.get('paypal-auth-algo');
    const cert = headersList.get('paypal-cert-url');
    const transmission_id = headersList.get('paypal-transmission-id');
    const transmission_sig = headersList.get('paypal-transmission-sig');
    const transmission_time = headersList.get('paypal-transmission-time');

    if (!auth || !cert || !transmission_id || !transmission_sig || !transmission_time) {
      return createErrorResponse(
        'Missing PayPal webhook headers',
        400,
        'MISSING_PAYPAL_HEADERS'
      );
    }

    const isValidSignature = await verifyPayPalSignature(request, rawBody);
    if (!isValidSignature) {
      return createErrorResponse(
        'Invalid PayPal webhook signature',
        400,
        'INVALID_PAYPAL_SIGNATURE'
      );
    }

    if (event.event_type === 'CHECKOUT.ORDER.APPROVED') {
      const orderId = event.resource.id;
      let accessToken;
      try {
        accessToken = await getPayPalAccessToken();
      } catch (tokenError: unknown) {
        console.error('API PayPalWebhook: Failed to get PayPal access token:', tokenError);
        let errorMessage = 'Failed to obtain PayPal access token';
        let errorName: string | undefined;

        if (tokenError instanceof Error) {
          errorMessage = tokenError.message;
          errorName = tokenError.name;
        }
        return createErrorResponse(
          errorMessage,
          500, 
          'PAYPAL_AUTH_TOKEN_ERROR',
          { details: errorMessage, errorName: errorName } 
        );
      }
      
      // Get order details using REST API
      const orderResponse = await fetch(`https://api.paypal.com/v2/checkout/orders/${orderId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!orderResponse.ok) {
        const errorBody = await orderResponse.text(); // Read body for more details
        console.error(`API PayPalWebhook: Failed to fetch order details from PayPal. Status: ${orderResponse.status}, Body: ${errorBody}`);
        return createErrorResponse(
          'Failed to fetch order details from PayPal',
          orderResponse.status,
          'PAYPAL_FETCH_ORDER_FAILED',
          { paypalOrderId: orderId, responseBody: errorBody }
        );
      }

      const order = await orderResponse.json();
      
      // Extract metadata from custom_id
      const { userId, hours } = JSON.parse(order.purchase_units[0].custom_id);
      const amount = order.purchase_units[0].amount.value;
      const currency = order.purchase_units[0].amount.currency_code; // Get currency from order
      const customerEmail = order.payer?.email_address; // Get customer email from payer object

      // Create license using Supabase function
      const { data: licenseData, error: licenseError } = await supabase.rpc(
        'create_license',
        {
          user_id: userId,
          hours: parseInt(hours),
          transaction_id: orderId,
          payment_gateway: 'paypal',
          amount: parseFloat(amount),
          currency: currency // Use currency from order
        }
      );

      if (licenseError) {
        console.error('API PayPalWebhook: License creation failed for order', orderId, ':', licenseError);
        let errorMessage = 'Failed to create license after payment.';
        let errorName: string | undefined;

        if (licenseError instanceof Error) {
          errorMessage = licenseError.message;
          errorName = licenseError.name;
        }
        return createErrorResponse(
          errorMessage,
          500,
          'LICENSE_CREATION_FAILED_WEBHOOK',
          { details: errorMessage, rpcErrorName: errorName } 
        );
      }

      // If license creation was successful and we have a license key, prepare for email
      if (licenseData && licenseData.success && licenseData.license_key) {
        console.log(`API PayPalWebhook: License created: ${licenseData.license_key} for user ${userId}, email: ${customerEmail}`);
        
        // TODO: Implement email sending logic here using a free/freemium service
        // (e.g., Resend, SendGrid free tier, Mailgun free tier, etc.)
        // Ensure you handle API keys and email templates securely.
        // Example:
        // if (customerEmail) {
        //   await sendLicenseKeyEmail(customerEmail, licenseData.license_key);
        //   console.log(`Attempted to send license key ${licenseData.license_key} to ${customerEmail}`);
        // } else {
        //   console.error('Customer email not found in PayPal order details, cannot send license key email.');
        // }
      } else {
        console.error('API PayPalWebhook: License creation RPC did not return success or license_key:', licenseData);
        // Do not return error to PayPal here, as license might have been created but RPC response was malformed.
        // PayPal expects a 2xx response to acknowledge receipt of the event.
      }

      return createSuccessResponse({ 
        eventProcessed: 'CHECKOUT.ORDER.APPROVED',
        licenseDetails: licenseData 
      });
    }

    console.log(`API PayPalWebhook: Received unhandled event type: ${event.event_type}`);
    return createSuccessResponse({ eventReceived: event.event_type, handled: false });

  } catch (err: unknown) { 
    console.error('API PayPalWebhook: Main handler error:', err);
    let errorMessage = 'Webhook handler failed';
    let errorName: string | undefined;

    if (err instanceof Error) {
      errorMessage = err.message;
      errorName = err.name;
    }
    return createErrorResponse(
      errorMessage,
      400,
      'PAYPAL_WEBHOOK_ERROR',
      { errorName: errorName } // Pass only non-sensitive error info
    );
  }
}