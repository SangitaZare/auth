import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

// These calls never carry a token and are never retried
const PUBLIC_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/logout'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  const isOurApi = req.url.startsWith(environment.apiUrl);
  const isPublic = PUBLIC_PATHS.some(p => req.url.startsWith(environment.apiUrl + p));
  if (!isOurApi || isPublic) return next(req);

  const withToken = (r: HttpRequest<unknown>) =>
    auth.accessToken ? r.clone({ setHeaders: { Authorization: `Bearer ${auth.accessToken}` } }) : r;

  return next(withToken(req)).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || !auth.refreshToken) return throwError(() => err);

      return auth.refreshOnce().pipe(
        switchMap(() => next(withToken(req))),
        catchError(refreshErr => {
          auth.expire();
          return throwError(() => refreshErr);
        })
      );
    })
  );
};