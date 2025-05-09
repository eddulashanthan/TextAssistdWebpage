import { createErrorResponse, createSuccessResponse } from '@/lib/apiUtils';

const PRICE_MAP = {
  5: '9.99',
  10: '14.99',
  20: '19.99',
};

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { hours, userId } = body;

    if (!hours || !userId || !PRICE_MAP[hours as keyof typeof PRICE_MAP]) {
      console.warn('API PayPalCreateOrder: Invalid input - hours or userId missing or invalid hours value.');
      return createErrorResponse(
        'Invalid hours or user ID provided.', 
        400, 
        'INVALID_INPUT', 
        { receivedHours: hours, receivedUserId: userId }
      );
    }

    const price = PRICE_MAP[hours as keyof typeof PRICE_MAP];
    let accessToken;
    try {
      accessToken = await getPayPalAccessToken();
    } catch (tokenError: unknown) {
      console.error('API PayPalCreateOrder: Failed to get PayPal access token:', tokenError);
      let detailsMessage = 'Unknown token error';
      if (tokenError instanceof Error) {
        detailsMessage = tokenError.message;
      }
      return createErrorResponse(
        'Failed to obtain PayPal access token.',
        500, // Internal server issue if we can't talk to PayPal auth
        'PAYPAL_AUTH_TOKEN_ERROR',
        { details: detailsMessage }
      );
    }
    
    // Create order using REST API
    const response = await fetch('https://api.paypal.com/v2/checkout/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'USD',
            value: price
          },
          description: `TextAssistd ${hours}-Hour License`,
          custom_id: JSON.stringify({ userId, hours })
        }],
        application_context: {
          return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
          cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`
        }
      })
    });

    const order = await response.json();

    if (!response.ok) {
      console.error('API PayPalCreateOrder: PayPal API failed to create order. Status:', response.status, 'Response:', order);
      return createErrorResponse(
        order.message || 'Failed to create PayPal order via API.', 
        response.status, // Use PayPal's status code
        'PAYPAL_API_ORDER_CREATION_FAILED', 
        { paypalResponse: order } // Include PayPal's error response if available
      );
    }

    console.info('API PayPalCreateOrder: Successfully created PayPal order:', order.id);
    return createSuccessResponse({
      id: order.id,
      links: order.links
    });
  } catch (error: unknown) {
    console.error('API PayPalCreateOrder: Order creation failed:', error);
    let errorMessage = 'Failed to create PayPal order due to an internal server issue.';
    let errorName: string | undefined;

    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      return createErrorResponse('Invalid JSON payload.', 400, 'INVALID_JSON_PAYLOAD', { details: error.message });
    }
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorName = error.name;
    }

    return createErrorResponse(
      errorMessage,
      500,
      'PAYPAL_ORDER_CREATION_INTERNAL_ERROR',
      { errorName: errorName }
    );
  }
}