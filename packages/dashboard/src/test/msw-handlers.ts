import { http, HttpResponse } from 'msw';

// Base handlers that simulate common API responses.
// Add specific handlers per test file as needed.

export const handlers = [
  // Health check
  http.get('/api/health', () => {
    return HttpResponse.json({ status: 'ok' });
  }),
];
