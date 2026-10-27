import { Component, computed, inject, signal } from '@angular/core';
import { ReportService } from '../../core/report.service';
import { ReportItem } from '../../core/models';
import { apiError } from '../../core/http-error';

@Component({
  selector: 'app-reports',
  imports: [],
  templateUrl: './reports.html',
  styleUrl: './reports.css'
})
export class Reports {
  private reportService = inject(ReportService);

  items = signal<ReportItem[]>([]);
  loading = signal(true);
  error = signal('');

  // The biggest value, used to size the bars
  private max = computed(() => Math.max(1, ...this.items().map(i => i.value)));

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.reportService.list().subscribe({
      next: list => {
        this.items.set(list);
        this.loading.set(false);
      },
      error: e => {
        this.error.set(apiError(e));
        this.loading.set(false);
      }
    });
  }

  // Bar width as a percentage of the biggest value
  percent(value: number): number {
    return Math.round((value / this.max()) * 100);
  }
}