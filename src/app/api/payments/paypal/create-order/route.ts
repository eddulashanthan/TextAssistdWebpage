import { NextResponse } from 'next/server';

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
    const { hours, userId } = await request.json();

    if (!hours || !userId || !PRICE_MAP[hours as keyof typeof PRICE_MAP]) {
      return NextResponse.json(
        { error: 'Invalid hours selected' },
        { status: 400 }
      );
    }

    const price = PRICE_MAP[hours as keyof typeof PRICE_MAP];
    const accessToken = await getPayPalAccessToken();
    
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
      throw new Error(order.message || 'Failed to create PayPal order');
    }

    return NextResponse.json({
      id: order.id,
      links: order.links
    });
  } catch (error) {
    console.error('PayPal order creation failed:', error);
    return NextResponse.json(
      { error: 'Failed to create PayPal order' },
      { status: 500 }
    );
  }
}