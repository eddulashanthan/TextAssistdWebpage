import Stripe from 'stripe';
import { createErrorResponse, createSuccessResponse } from '@/lib/apiUtils';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
});

const PRICE_MAP = {
  5: 999, // $9.99 for 5 hours
  10: 1499, // $14.99 for 10 hours
  20: 1999, // $19.99 for 20 hours
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { hours, userId } = body;

    if (!hours || !userId || !PRICE_MAP[hours as keyof typeof PRICE_MAP]) {
      console.warn('API StripeCreateCheckout: Invalid input - hours or userId missing or invalid hours value.');
      return createErrorResponse(
        'Invalid hours or user ID provided.', 
        400, 
        'INVALID_INPUT_HOURS_USERID', 
        { receivedHours: hours, receivedUserId: userId }
      );
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `TextAssistd ${hours}-Hour License`,
              description: `${hours} hours of TextAssistd usage`,
            },
            unit_amount: PRICE_MAP[hours as keyof typeof PRICE_MAP],
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`,
      metadata: {
        userId,
        hours,
      },
    });

    console.info('API StripeCreateCheckout: Successfully created Stripe session:', session.id);
    return createSuccessResponse({ url: session.url }, 200);

  } catch (error: unknown) {
    console.error('API StripeCreateCheckout: Session creation failed:', error);
    let errorMessage = 'Failed to create checkout session due to an internal server issue.';
    let errorName: string | undefined;
    let statusCode = 500;
    let errorCode = 'STRIPE_CHECKOUT_INTERNAL_ERROR';
    let errorDetails: Record<string, unknown> = {};

    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      return createErrorResponse('Invalid JSON payload.', 400, 'INVALID_JSON_PAYLOAD', { details: error.message });
    }

    if (error instanceof Stripe.errors.StripeError) {
      errorMessage = error.message;
      statusCode = error.statusCode || 500;
      errorCode = error.type || 'STRIPE_API_ERROR';
      errorDetails = { stripeErrorType: error.type, stripeCharge: error.charge, stripeDeclineCode: error.decline_code, stripeRaw: error.raw };
    } else if (error instanceof Error) {
      errorMessage = error.message;
      errorName = error.name;
      errorDetails = { errorName: errorName };
    } else {
      // Non-Error object thrown
      errorDetails = { thrownValue: error };
    }

    return createErrorResponse(
      errorMessage,
      statusCode,
      errorCode,
      errorDetails
    );
  }
}