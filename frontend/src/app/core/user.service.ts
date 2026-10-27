import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { UserListItem } from './models';

@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);
  private url = `${environment.apiUrl}/api/users`;

  list() {
    return this.http.get<UserListItem[]>(this.url);
  }
  // Needs users.manage. false = the person can no longer sign in and is signed out everywhere.
  setActive(userId: number, isActive: boolean) {
    return this.http.put<void>(`${this.url}/${userId}/active`, { isActive });
  }
  // Replaces ALL of the user's roles with the given list
  setRoles(userId: number, roleIds: number[]) {
    return this.http.put<void>(`${this.url}/${userId}/roles`, { ids: roleIds });
  }
}