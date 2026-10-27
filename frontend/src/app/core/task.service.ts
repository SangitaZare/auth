import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import {
  ChecklistItem, CreateTaskRequest, Task, TaskComment, TaskDetail, TaskPriority, TaskStatus
} from './models';

// What we send when editing a task's main fields
export interface UpdateTaskRequest {
  title: string;
  description?: string | null;
  priority: TaskPriority;
  tag?: string | null;
  dueDate?: string | null;
}

@Injectable({ providedIn: 'root' })
export class TaskService {
  private http = inject(HttpClient);
  private url = `${environment.apiUrl}/api/tasks`;

  // ---- tasks ----

  // All tasks of one project. With assignedToMe = true, only the signed-in user's tasks.
  list(projectId: number, assignedToMe = false) {
    const params = new HttpParams()
      .set('projectId', projectId)
      .set('assignedToMe', assignedToMe);
    return this.http.get<Task[]>(this.url, { params });
  }

  // One task with its checklist and comments (for the detail panel)
  get(id: number) {
    return this.http.get<TaskDetail>(`${this.url}/${id}`);
  }

  create(req: CreateTaskRequest) {
    return this.http.post<Task>(this.url, req);
  }

  update(id: number, req: UpdateTaskRequest) {
    return this.http.put<Task>(`${this.url}/${id}`, req);
  }

  // Move a card to a column. sortOrder is its position in that column (0 = top).
  move(id: number, status: TaskStatus, sortOrder: number) {
    return this.http.put<Task>(`${this.url}/${id}/move`, { status, sortOrder });
  }

  // Needs the tasks.assign permission. Pass null to unassign.
  assign(id: number, assigneeId: number | null) {
    return this.http.put<Task>(`${this.url}/${id}/assign`, { assigneeId });
  }

  remove(id: number) {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  // ---- checklist ----

  addChecklistItem(taskId: number, text: string) {
    return this.http.post<ChecklistItem>(`${this.url}/${taskId}/checklist`, { text });
  }

  setChecklistItem(taskId: number, itemId: number, done: boolean) {
    return this.http.put<ChecklistItem>(`${this.url}/${taskId}/checklist/${itemId}`, { done });
  }

  removeChecklistItem(taskId: number, itemId: number) {
    return this.http.delete<void>(`${this.url}/${taskId}/checklist/${itemId}`);
  }

  // ---- comments ----

  addComment(taskId: number, text: string) {
    return this.http.post<TaskComment>(`${this.url}/${taskId}/comments`, { text });
  }

  removeComment(taskId: number, commentId: number) {
    return this.http.delete<void>(`${this.url}/${taskId}/comments/${commentId}`);
  }
}