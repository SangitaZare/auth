import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

// Temporary page for menu entries we have not built yet
@Component({
  selector: 'app-coming-soon',
  template: `
    <h2>{{ title }}</h2>
    <p class="note">This page is coming in the next step.</p>
  `,
  styles: `h2 { margin: 0 0 8px; font-size: 20px; } .note { color: var(--muted); }`
})
export class ComingSoon {
  title: string = inject(ActivatedRoute).snapshot.data['title'] ?? 'Page';
}