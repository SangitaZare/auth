import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { Login } from './login';

const loginUrl = `${environment.apiUrl}/api/auth/login`;

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not call the API while the form is empty or the email is invalid', () => {
    component.submit();
    expect(component.form.invalid).toBe(true);

    component.form.setValue({ email: 'not-an-email', password: 'x' });
    component.submit();

    http.expectNone(loginUrl);
  });

  it('shows the API message when the password is wrong', () => {
    component.form.setValue({ email: 'sam@example.com', password: 'wrong' });
    component.submit();

    http.expectOne(loginUrl).flush({ error: 'Invalid email or password.' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    const alert = (fixture.nativeElement as HTMLElement).querySelector('.alert');
    expect(alert?.textContent).toContain('Invalid email or password.');
  });

  it('goes to the dashboard after a successful sign in', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    component.form.setValue({ email: 'sam@example.com', password: 'Pass@12345' });
    component.submit();

    http.expectOne(loginUrl).flush({
      accessToken: 'a', refreshToken: 'r', accessTokenExpiresAt: '2030-01-01T00:00:00Z',
      user: { id: 1, email: 'sam@example.com', fullName: 'Sam', roles: ['User'], permissions: [] }
    });

    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });
});