import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, finalize, shareReplay, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthResponse } from './models';

const STORAGE_KEY = 'auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private base = `${environment.apiUrl}/api/auth`;

  // The whole login state lives in one signal: tokens plus user info
  private state = signal<AuthResponse | null>(this.load());
    // A refresh that is already running. Shared so two requests that fail at the same moment
  // do not each spend the refresh token (the API treats a reused token as theft).
  private refreshing$: Observable<AuthResponse> | null = null;

  user = computed(() => this.state()?.user ?? null);
  isLoggedIn = computed(() => this.state() !== null);

  get accessToken(): string | null {
    return this.state()?.accessToken ?? null;
  }

  get refreshToken(): string | null {
    return this.state()?.refreshToken ?? null;
  }

  hasPermission(permission: string): boolean {
    return this.user()?.permissions.includes(permission) ?? false;
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/login`, { email, password })
      .pipe(tap(res => this.save(res)));
  }

   register(email: string, fullName: string, password: string) {
    return this.http.post<{ message: string }>(`${this.base}/register`, { email, fullName, password });
  }
  // Swap the refresh token for a fresh pair of tokens
  refresh(): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/refresh`, { refreshToken: this.refreshToken })
      .pipe(tap(res => this.save(res)));
  }
    // Same as refresh(), but callers that ask while one is running all wait for that one call
  refreshOnce(): Observable<AuthResponse> {
    if (!this.refreshing$) {
      this.refreshing$ = this.refresh().pipe(
        finalize(() => (this.refreshing$ = null)),
        shareReplay(1)
      );
    }
    return this.refreshing$;
  }

   logout(): void {
    const token = this.refreshToken;
    if (token) {
     // Tell the API to revoke the refresh token. Ignore failures: we log out locally anyway.
      this.http.post(`${this.base}/logout`, { refreshToken: token }).subscribe({ error: () => {} });
    }
    this.expire();
  }

  // Forget the session and go to the login page (used by logout and when a refresh fails)
  expire(): void {
    this.clear();
    this.router.navigate(['/login']);
  }

  // Used when a refresh fails: forget everything without calling the API
  clear(): void {
    this.state.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  private save(res: AuthResponse): void {
    this.state.set(res);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(res));
  }

  private load(): AuthResponse | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AuthResponse) : null;
    } catch {
      return null;
    }
  }
}