import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Member, Project } from './models';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private http = inject(HttpClient);
  private url = `${environment.apiUrl}/api/projects`;

  // Projects I belong to (Admin sees all)
  list() {
    return this.http.get<Project[]>(this.url);
  }

  // People who can be assigned tasks in this project
  members(projectId: number) {
    return this.http.get<Member[]>(`${this.url}/${projectId}/members`);
  }

  // Needs projects.manage. The creator becomes the owner and first member.
  create(name: string, description: string | null) {
    return this.http.post<Project>(this.url, { name, description });
  }
    // Needs projects.manage. Changes the name and description.
  update(projectId: number, name: string, description: string | null) {
    return this.http.put<void>(`${this.url}/${projectId}`, { name, description });
  }

  // Needs projects.manage. Deletes the project and ALL its tasks.
  remove(projectId: number) {
    return this.http.delete<void>(`${this.url}/${projectId}`);
  }

  // Needs projects.manage. Replaces ALL members with the given user ids (the owner always stays).
  setMembers(projectId: number, userIds: number[]) {
    return this.http.put<void>(`${this.url}/${projectId}/members`, { ids: userIds });
  }
}