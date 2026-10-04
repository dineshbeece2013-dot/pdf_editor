import { afterEach, beforeEach, vi } from 'vitest';

/**
 * The suite must never talk to the real Razorpay API.
 *
 * Only requests to api.razorpay.com are intercepted; everything else (the test
 * harness driving the Express app over real HTTP) falls through to the real
 * fetch, so the app is still exercised end to end.
 */

const realFetch = globalThis.fetch;
let ordersCreated = 0;

beforeEach(() => {
  ordersCreated = 0;

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes('api.razorpay.com/v1/orders')) {
      ordersCreated += 1;
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      return new Response(
        JSON.stringify({
          id: `order_test_${ordersCreated}`,
          entity: 'order',
          amount: body.amount,
          currency: body.currency,
          status: 'created',
          attempts: 0,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    return realFetch(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
