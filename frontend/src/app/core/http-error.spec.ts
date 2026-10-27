import { HttpErrorResponse } from '@angular/common/http';
import { apiError } from './http-error';

const err = (status: number, error: unknown) => new HttpErrorResponse({ status, error });

describe('apiError', () => {
  it('says the server cannot be reached when there is no connection (status 0)', () => {
    expect(apiError(err(0, null))).toBe('Cannot reach the server. Is the API running?');
  });

  it('uses the { error: "..." } message the API sends', () => {
    expect(apiError(err(401, { error: 'Invalid email or password.' }))).toBe('Invalid email or password.');
  });

  it('uses the first validation message from { errors: {...} }', () => {
    const e = err(400, { errors: { Email: ['The Email field is not a valid e-mail address.'] } });
    expect(apiError(e)).toBe('The Email field is not a valid e-mail address.');
  });

  it('falls back to a general message', () => {
    expect(apiError(err(500, null))).toBe('Something went wrong. Please try again.');
    expect(apiError(err(500, null), 'Custom fallback')).toBe('Custom fallback');
  });
});