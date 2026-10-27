import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';
import { AuthResponse } from './models';

const api = environment.apiUrl;

const session: AuthResponse = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  accessTokenExpiresAt: '2030-01-01T00:00:00Z',
  user: { id: 7, email: 'sam@example.com', fullName: 'Sam Mehta', roles: ['User'], permissions: ['tasks.view'] }
};

const unauthorized = { status: 401, statusText: 'Unauthorized' };

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('auth', JSON.stringify(session)); // start signed in
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting()
      ]
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => ctrl.verify());

  it('adds the access token to calls to our API', () => {
    http.get(`${api}/api/projects`).subscribe();
    const req = ctrl.expectOne(`${api}/api/projects`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-1');
    req.flush([]);
  });

  it('does not add a token to the login call', () => {
    http.post(`${api}/api/auth/login`, {}).subscribe();
    const req = ctrl.expectOne(`${api}/api/auth/login`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush(session);
  });

  it('never sends the token to another website', () => {
    http.get('https://other.example.com/data').subscribe();
    const req = ctrl.expectOne('https://other.example.com/data');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('on a 401 it refreshes the tokens once and retries the call with the new token', () => {
    let result: unknown;
    http.get(`${api}/api/projects`).subscribe(r => (result = r));

    ctrl.expectOne(`${api}/api/projects`).flush({}, unauthorized);

    const refresh = ctrl.expectOne(`${api}/api/auth/refresh`);
    expect(refresh.request.body).toEqual({ refreshToken: 'refresh-1' });
    refresh.flush({ ...session, accessToken: 'access-2', refreshToken: 'refresh-2' });

    const retry = ctrl.expectOne(`${api}/api/projects`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer access-2');
    retry.flush(['project']);

    expect(result).toEqual(['project']);
    expect(auth.isLoggedIn()).toBe(true);
  });

  it('two calls that fail at the same moment share a single refresh', () => {
    http.get(`${api}/api/projects`).subscribe();
    http.get(`${api}/api/tasks`).subscribe();

    ctrl.expectOne(`${api}/api/projects`).flush({}, unauthorized);
    ctrl.expectOne(`${api}/api/tasks`).flush({}, unauthorized);

    ctrl.expectOne(`${api}/api/auth/refresh`).flush({ ...session, accessToken: 'access-2', refreshToken: 'refresh-2' });

    ctrl.expectOne(`${api}/api/projects`).flush([]);
    ctrl.expectOne(`${api}/api/tasks`).flush([]);
  });

  it('if the refresh itself fails, the user is signed out and sent to /login', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    let failed = false;
    http.get(`${api}/api/projects`).subscribe({ error: () => (failed = true) });

    ctrl.expectOne(`${api}/api/projects`).flush({}, unauthorized);
    ctrl.expectOne(`${api}/api/auth/refresh`).flush({ error: 'Refresh token expired.' }, unauthorized);

    expect(failed).toBe(true);
    expect(auth.isLoggedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('does not try to refresh for errors other than 401', () => {
    let status = 0;
    http.get(`${api}/api/users`).subscribe({ error: e => (status = e.status) });
    ctrl.expectOne(`${api}/api/users`).flush({ error: 'nope' }, { status: 403, statusText: 'Forbidden' });
    expect(status).toBe(403);
    ctrl.expectNone(`${api}/api/auth/refresh`);
  });
});