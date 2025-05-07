import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { supabase } from '@/lib/utils/supabase';

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
    const event = await request.json();
    const headersList = await headers();
    
    // Get PayPal headers
    const auth = headersList.get('paypal-auth-algo');
    const cert = headersList.get('paypal-cert-url');
    const transmission_id = headersList.get('paypal-transmission-id');
    const transmission_sig = headersList.get('paypal-transmission-sig');
    const transmission_time = headersList.get('paypal-transmission-time');

    if (!auth || !cert || !transmission_id || !transmission_sig || !transmission_time) {
      return NextResponse.json(
        { error: 'Missing PayPal webhook headers' },
        { status: 400 }
      );
    }

    if (event.event_type === 'CHECKOUT.ORDER.APPROVED') {
      const orderId = event.resource.id;
      const accessToken = await getPayPalAccessToken();
      
      // Get order details using REST API
      const orderResponse = await fetch(`https://api.paypal.com/v2/checkout/orders/${orderId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!orderResponse.ok) {
        throw new Error('Failed to fetch order details from PayPal');
      }

      const order = await orderResponse.json();
      
      // Extract metadata from custom_id
      const { userId, hours } = JSON.parse(order.purchase_units[0].custom_id);
      const amount = order.purchase_units[0].amount.value;

      // Create license using Supabase function
      const { data: licenseData, error: licenseError } = await supabase.rpc(
        'create_license',
        {
          user_id: userId,
          hours: parseInt(hours),
          transaction_id: orderId,
          payment_gateway: 'paypal',
          amount: parseFloat(amount),
          currency: 'USD'
        }
      );

      if (licenseError) {
        console.error('License creation failed:', licenseError);
        return NextResponse.json(
          { error: 'Failed to create license' },
          { status: 500 }
        );
      }

      return NextResponse.json(licenseData);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('PayPal webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 400 }
    );
  }
}