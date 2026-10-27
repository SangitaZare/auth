import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, UrlTree, provideRouter
} from '@angular/router';
import { AuthService } from './auth.service';
import { authGuard, guestGuard, permissionGuard } from './auth.guard';

// A tiny stand-in for AuthService: we only choose "logged in or not" and which permissions exist
function setup(loggedIn: boolean, permissions: string[] = []): void {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          isLoggedIn: () => loggedIn,
          hasPermission: (p: string) => permissions.includes(p)
        }
      }
    ]
  });
}

function run(guard: CanActivateFn, url = '/board') {
  return TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot)
  );
}

function urlOf(result: unknown): string {
  return TestBed.inject(Router).serializeUrl(result as UrlTree);
}

describe('authGuard', () => {
  it('lets a signed-in user through', () => {
    setup(true);
    expect(run(authGuard)).toBe(true);
  });

  it('sends a visitor to /login and remembers the page they wanted', () => {
    setup(false);
    expect(urlOf(run(authGuard, '/board'))).toBe('/login?returnUrl=%2Fboard');
  });
});

describe('guestGuard (login and register pages)', () => {
  it('lets a visitor see the page', () => {
    setup(false);
    expect(run(guestGuard)).toBe(true);
  });

  it('sends a signed-in user to the dashboard', () => {
    setup(true);
    expect(urlOf(run(guestGuard))).toBe('/dashboard');
  });
});

describe('permissionGuard', () => {
  it('lets a user with the permission through', () => {
    setup(true, ['users.read']);
    expect(run(permissionGuard('users.read'))).toBe(true);
  });

  it('sends a user without the permission to the dashboard', () => {
    setup(true, ['tasks.view']);
    expect(urlOf(run(permissionGuard('users.read')))).toBe('/dashboard');
  });
});