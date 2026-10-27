import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { apiError } from '../../core/http-error';

// Same rule as the API: 8-72 characters with a lower case letter, an upper case letter, a number and a symbol
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,72}$/;

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  return group.get('password')?.value === group.get('confirm')?.value ? null : { mismatch: true };
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.css'
})
export class Register {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);

  form = this.fb.nonNullable.group(
    {
      fullName: ['', [Validators.required, Validators.maxLength(100)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(256)]],
      password: ['', [Validators.required, Validators.pattern(PASSWORD_RULE)]],
      confirm: ['', Validators.required]
    },
    { validators: passwordsMatch }
  );

  error = signal('');
  success = signal('');
  loading = signal(false);

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set('');
    this.loading.set(true);

    const { email, fullName, password } = this.form.getRawValue();
    this.auth.register(email, fullName.trim(), password).subscribe({
      next: res => {
        this.loading.set(false);
        this.success.set(res.message);
        this.form.reset();
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(apiError(e));
      }
    });
  }
}