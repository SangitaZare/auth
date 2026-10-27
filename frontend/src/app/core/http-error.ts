import { HttpErrorResponse } from '@angular/common/http';

// Turns any API error into one readable sentence.
// The API sends { error: "..." } for its own errors and { errors: {...} } for validation errors.
export function apiError(e: HttpErrorResponse, fallback = 'Something went wrong. Please try again.'): string {
  if (e.status === 0) return 'Cannot reach the server. Is the API running?';
  const body = e.error;
  if (body?.error) return String(body.error);
  if (body?.errors) {
    const first = (Object.values(body.errors) as unknown[]).flat()[0];
    if (first) return String(first);
  }
  return fallback;
}