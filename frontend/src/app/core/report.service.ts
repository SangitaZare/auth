import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ReportItem } from './models';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private http = inject(HttpClient);

  // Needs the reports.view permission (Admin and Manager have it)
  list() {
    return this.http.get<ReportItem[]>(`${environment.apiUrl}/api/reports`);
  }
}