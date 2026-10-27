export interface UserInfo {
  id: number;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  user: UserInfo;
}

// One sidebar entry, returned by GET /api/menu (already filtered by the user's permissions)
export interface MenuItem {
  title: string;
  route: string;
}

// ===== TaskNest: these match the DTOs in your API's Models/Dtos.cs =====

export type TaskStatus = 'todo' | 'inprogress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

// The four board columns, in order. "key" is the value the API stores.
export const BOARD_COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: 'todo', label: 'To do' },
  { key: 'inprogress', label: 'In progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' }
];

export interface Project {
  id: number;
  name: string;
  description: string | null;
  ownerId: number;
  memberIds: number[];
  openTasks: number;
  doneTasks: number;
}

export interface Member {
  id: number;
  fullName: string;
  email: string;
}

// A task as shown on a board card
export interface Task {
  id: number;
  projectId: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  tag: string | null;
  dueDate: string | null;      // arrives as text like "2026-10-27T00:00:00"
  assigneeId: number | null;
  assigneeName: string | null;
  commentCount: number;
  checklistDone: number;
  checklistTotal: number;
  sortOrder: number;
}

export interface ChecklistItem {
  id: number;
  text: string;
  done: boolean;
}

export interface TaskComment {
  id: number;
  authorId: number;
  authorName: string;
  text: string;
  createdAt: string;
}

// What GET /api/tasks/{id} returns: the card plus its checklist and comments
export interface TaskDetail {
  task: Task;
  checklist: ChecklistItem[];
  comments: TaskComment[];
}

// What we send when creating a task
export interface CreateTaskRequest {
  projectId: number;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  tag?: string | null;
  dueDate?: string | null;
}

// ===== Users and roles (match UserListItem and RoleDto in the API) =====

export interface UserListItem {
  id: number;
  email: string;
  fullName: string;
  isActive: boolean;
  roleIds: number[];
  roleNames: string[];
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
  permissionIds: number[];
}

export interface Permission {
  id: number;
  name: string;
  description: string | null;
}
// ===== Reports (GET /api/reports returns a list of these) =====

export interface ReportItem {
  name: string;
  value: number;
}