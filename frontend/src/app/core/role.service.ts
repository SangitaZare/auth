import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Permission, Role } from './models';

@Injectable({ providedIn: 'root' })
export class RoleService {
  private http = inject(HttpClient);

  list() {
    return this.http.get<Role[]>(`${environment.apiUrl}/api/roles`);
  }

  // Every permission that exists (the checkboxes on the Roles page)
  permissions() {
    return this.http.get<Permission[]>(`${environment.apiUrl}/api/permissions`);
  }

  create(name: string, description: string | null) {
    return this.http.post<Role>(`${environment.apiUrl}/api/roles`, { name, description });
  }

  // Replaces ALL permissions of the role with the given list
  setPermissions(roleId: number, permissionIds: number[]) {
    return this.http.put<void>(`${environment.apiUrl}/api/roles/${roleId}/permissions`, { ids: permissionIds });
  }
}