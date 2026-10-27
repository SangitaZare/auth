import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { MenuItem } from './models';

@Injectable({ providedIn: 'root' })
export class MenuService {
  private http = inject(HttpClient);

  items = signal<MenuItem[]>([]);
  loading = signal(false);
  error = signal('');

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<MenuItem[]>(`${environment.apiUrl}/api/menu`).subscribe({
      next: items => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load the menu.');
        this.loading.set(false);
      }
    });
  }

  clear(): void {
    this.items.set([]);
  }
}