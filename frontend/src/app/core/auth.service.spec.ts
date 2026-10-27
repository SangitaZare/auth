import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { AuthResponse } from './models';

const api = `${environment.apiUrl}/api/auth`;

const session: AuthResponse = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  accessTokenExpiresAt: '2030-01-01T00:00:00Z',
  user: { id: 7, email: 'sam@example.com', fullName: 'Sam Mehta', roles: ['User'], permissions: ['tasks.view', 'tasks.create'] }
};

describe('AuthService', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear(); // the service reads the saved session when it is created
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify()); // fails the test if an unexpected request was made

  function signIn(auth: AuthService): void {
    auth.login('sam@example.com', 'Pass@12345').subscribe();
    http.expectOne(`${api}/login`).flush(session);
  }

  it('starts signed out when nothing is saved', () => {
    const auth = TestBed.inject(AuthService);
    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.accessToken).toBeNull();
  });

  it('restores a saved session after a page refresh', () => {
    localStorage.setItem('auth', JSON.stringify(session));
    const auth = TestBed.inject(AuthService);
    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.user()?.fullName).toBe('Sam Mehta');
  });

  it('ignores a damaged saved session instead of crashing', () => {
    localStorage.setItem('auth', '{not valid json');
    const auth = TestBed.inject(AuthService);
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('login sends the credentials, then keeps the tokens in memory and in storage', () => {
    const auth = TestBed.inject(AuthService);
    auth.login('sam@example.com', 'Pass@12345').subscribe();

    const req = http.expectOne(`${api}/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'sam@example.com', password: 'Pass@12345' });
    req.flush(session);

    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.accessToken).toBe('access-1');
    expect(auth.refreshToken).toBe('refresh-1');
    expect(JSON.parse(localStorage.getItem('auth')!).accessToken).toBe('access-1');
  });

  it('a failed login leaves the user signed out', () => {
    const auth = TestBed.inject(AuthService);
    let failed = false;
    auth.login('sam@example.com', 'wrong').subscribe({ error: () => (failed = true) });
    http.expectOne(`${api}/login`).flush({ error: 'Invalid email or password.' }, { status: 401, statusText: 'Unauthorized' });

    expect(failed).toBe(true);
    expect(auth.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('auth')).toBeNull();
  });

  it('hasPermission is true only for permissions the user holds', () => {
    const auth = TestBed.inject(AuthService);
    signIn(auth);
    expect(auth.hasPermission('tasks.view')).toBe(true);
    expect(auth.hasPermission('users.manage')).toBe(false);
  });

  it('hasPermission is false when nobody is signed in', () => {
    expect(TestBed.inject(AuthService).hasPermission('tasks.view')).toBe(false);
  });

  it('logout tells the API to revoke the refresh token, clears everything and goes to /login', () => {
    const auth = TestBed.inject(AuthService);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    signIn(auth);

    auth.logout();

    const req = http.expectOne(`${api}/logout`);
    expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
    req.flush(null);

    expect(auth.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('auth')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('refreshOnce shares ONE request between callers (the API treats a reused token as theft)', () => {
    const auth = TestBed.inject(AuthService);
    signIn(auth);

    const results: string[] = [];
    auth.refreshOnce().subscribe(r => results.push(r.accessToken));
    auth.refreshOnce().subscribe(r => results.push(r.accessToken));

    const req = http.expectOne(`${api}/refresh`); // expectOne fails if there were two
    expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
    req.flush({ ...session, accessToken: 'access-2', refreshToken: 'refresh-2' });

    expect(results).toEqual(['access-2', 'access-2']);
    expect(auth.refreshToken).toBe('refresh-2'); // the new pair replaced the old one
  });
});