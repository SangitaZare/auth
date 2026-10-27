import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { ProjectService } from '../../core/project.service';
import { TaskService } from '../../core/task.service';
import { apiError } from '../../core/http-error';
import { Project, Task } from '../../core/models';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard {
  auth = inject(AuthService);
  private projectApi = inject(ProjectService);
  private taskApi = inject(TaskService);

  tasks = signal<Task[]>([]);
  projects = signal<Project[]>([]);
  loading = signal(true);
  error = signal('');

  // Only people who can see tasks get the task numbers
  canSeeTasks = computed(() => !!this.auth.user()?.permissions.includes('tasks.view'));

  // ---- the four numbers ----
  openCount = computed(() => this.tasks().filter(t => t.status !== 'done').length);
  overdueCount = computed(() => this.tasks().filter(t => this.isLate(t)).length);
  reviewCount = computed(() => this.tasks().filter(t => t.status === 'review').length);
  doneCount = computed(() => this.tasks().filter(t => t.status === 'done').length);

  // My open tasks, the earliest due date first (no due date goes last), at most 8
  myTasks = computed(() =>
    this.tasks()
      .filter(t => t.status !== 'done')
      .sort((a, b) => {
        const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return da - db;
      })
      .slice(0, 8)
  );

  constructor() {
    if (this.canSeeTasks()) {
      this.load();
    } else {
      this.loading.set(false);
    }
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.projectApi.list().subscribe({
      next: projects => {
        this.projects.set(projects);
        if (projects.length === 0) {
          this.loading.set(false);
          return;
        }
        // One request per project, all at the same time: only the tasks assigned to me
        forkJoin(projects.map(p => this.taskApi.list(p.id, true))).subscribe({
          next: lists => {
            this.tasks.set(lists.flat());
            this.loading.set(false);
          },
          error: e => {
            this.error.set(apiError(e, 'Could not load your tasks.'));
            this.loading.set(false);
          }
        });
      },
      error: e => {
        this.error.set(apiError(e, 'Could not load your projects.'));
        this.loading.set(false);
      }
    });
  }

  projectName(id: number): string {
    return this.projects().find(p => p.id === id)?.name ?? '';
  }

  // ---- small helpers (same logic as the board) ----

  private daysLeft(due: string): number {
    const d = new Date(due);
    const today = new Date();
    d.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  }

  isLate(t: Task): boolean {
    return !!t.dueDate && t.status !== 'done' && this.daysLeft(t.dueDate) < 0;
  }

  dueLabel(due: string): string {
    const n = this.daysLeft(due);
    if (n < 0) return `Overdue ${-n}d`;
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    return `In ${n} days`;
  }
}