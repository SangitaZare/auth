import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { ProjectService } from '../../core/project.service';
import { TaskService } from '../../core/task.service';
import { apiError } from '../../core/http-error';
import {
  BOARD_COLUMNS, ChecklistItem, Member, Task, TaskComment, TaskDetail, TaskPriority, TaskStatus
} from '../../core/models';

@Component({
  selector: 'app-task-drawer',
  imports: [DatePipe, ReactiveFormsModule],
  templateUrl: './task-drawer.html',
  styleUrl: './task-drawer.css',
  // Pressing Escape anywhere closes the panel
  host: { '(document:keydown.escape)': 'closed.emit()' }
})
export class TaskDrawer implements OnInit {
  private api = inject(TaskService);
  private auth = inject(AuthService);
  private projects = inject(ProjectService);
  private fb = inject(FormBuilder);

  taskId = input.required<number>();   // which task to show (given by the board)
  closed = output<void>();             // tells the board to close the panel
  changed = output<void>();            // tells the board to refresh its cards

  detail = signal<TaskDetail | null>(null);
  loading = signal(true);
  error = signal('');
  notice = signal('');                 // message after a refused change
  saving = signal(false);
  saved = signal(false);               // shows "Changes saved." until the next edit
  members = signal<Member[]>([]);      // people who can be assigned (project members)

  columns = BOARD_COLUMNS;
  priorities: TaskPriority[] = ['low', 'medium', 'high'];

  // People who can create tasks may edit them (the API still has the final say)
  canEdit = this.auth.hasPermission('tasks.create');
  canAssign = this.auth.hasPermission('tasks.assign');
    canDelete = this.auth.hasPermission('tasks.delete');
  confirmingDelete = signal(false);   // shows "Are you sure?" before deleting
  private myId = this.auth.user()?.id;

  // The fields that the "Save changes" button sends together
  form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', Validators.maxLength(2000)],
    priority: ['medium' as TaskPriority],
    tag: ['', Validators.maxLength(30)],
    dueDate: ['']
  });

  constructor() {
    // Any edit hides the "Changes saved." message
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.saved.set(false));
  }

  ngOnInit(): void {
    this.api.get(this.taskId()).subscribe({
      next: d => {
        this.detail.set(d);
        this.fillForm(d.task);
        if (!this.canEdit) this.form.disable();
        if (this.canAssign) this.loadMembers(d.task.projectId);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.error.set(apiError(e, 'Could not load the task.'));
        this.loading.set(false);
      }
    });
  }

  // ---- task fields ----

  save(): void {
    const v = this.form.getRawValue();
    if (this.form.invalid || !v.title.trim()) {
      this.form.markAllAsTouched();
      this.notice.set('A title is required.');
      return;
    }
    this.notice.set('');
    this.saving.set(true);

    this.api
      .update(this.taskId(), {
        title: v.title.trim(),
        description: v.description.trim() || null,
        priority: v.priority,
        tag: v.tag.trim() || null,
        dueDate: v.dueDate ? `${v.dueDate}T00:00:00` : null
      })
      .subscribe({
        next: task => {
          this.saving.set(false);
          this.applyTask(task);
          this.fillForm(task);
          this.saved.set(true);
          this.changed.emit();
        },
            error: (e: HttpErrorResponse) => {
          this.saving.set(false);
          this.fail(e, 'Could not save the changes.');
          const current = this.detail()?.task;
          if (current && e.status === 403) this.fillForm(current); // put the saved values back
        }
      });
  }

  // Status saves straight away. The big sortOrder puts the card at the bottom of its new column.
  changeStatus(select: HTMLSelectElement): void {
    const previous = this.detail()?.task.status ?? 'todo';
    this.notice.set('');
    this.api.move(this.taskId(), select.value as TaskStatus, 9999).subscribe({
      next: task => {
        this.applyTask(task);
        this.changed.emit();
      },
      error: (e: HttpErrorResponse) => {
        select.value = previous; // put the dropdown back
        this.fail(e, 'Could not change the status.');
      }
    });
  }

  changeAssignee(select: HTMLSelectElement): void {
    const previous = String(this.detail()?.task.assigneeId ?? '');
    const assigneeId = select.value ? +select.value : null;
    this.notice.set('');
    this.api.assign(this.taskId(), assigneeId).subscribe({
      next: task => {
        this.applyTask(task);
        this.changed.emit();
      },
      error: (e: HttpErrorResponse) => {
        select.value = previous;
        this.fail(e, 'Could not change the assignee.');
      }
    });
  }
    remove(): void {
    this.notice.set('');
    this.api.remove(this.taskId()).subscribe({
      next: () => {
        this.changed.emit(); // the board refreshes and the card disappears
        this.closed.emit();
      },
      error: (e: HttpErrorResponse) => {
        this.confirmingDelete.set(false);
        this.fail(e, 'Could not delete the task.');
      }
    });
  }

  // ---- checklist ----

  toggle(item: ChecklistItem, done: boolean): void {
    this.notice.set('');
    this.setChecklistDone(item.id, done); // show it straight away
    this.api.setChecklistItem(this.taskId(), item.id, done).subscribe({
      next: () => this.changed.emit(),
      error: (e: HttpErrorResponse) => {
        this.setChecklistDone(item.id, !done); // undo
        this.fail(e, 'Could not update the checklist.');
      }
    });
  }

  addItem(input: HTMLInputElement): void {
    const text = input.value.trim();
    if (!text) return;
    this.notice.set('');
    this.api.addChecklistItem(this.taskId(), text).subscribe({
      next: item => {
        input.value = '';
        this.setDetail(d => ({ ...d, checklist: [...d.checklist, item] }));
        this.changed.emit();
      },
      error: (e: HttpErrorResponse) => this.fail(e, 'Could not add the item.')
    });
  }

  removeItem(item: ChecklistItem): void {
    this.notice.set('');
    this.api.removeChecklistItem(this.taskId(), item.id).subscribe({
      next: () => {
        this.setDetail(d => ({ ...d, checklist: d.checklist.filter(c => c.id !== item.id) }));
        this.changed.emit();
      },
      error: (e: HttpErrorResponse) => this.fail(e, 'Could not remove the item.')
    });
  }

  // ---- comments ----

  addComment(input: HTMLInputElement): void {
    const text = input.value.trim();
    if (!text) return;
    this.notice.set('');
    this.api.addComment(this.taskId(), text).subscribe({
      next: (comment: TaskComment) => {
        input.value = '';
        this.setDetail(d => ({ ...d, comments: [...d.comments, comment] }));
        this.changed.emit();
      },
      error: (e: HttpErrorResponse) => this.fail(e, 'Could not add the comment.')
    });
  }

  canDeleteComment(c: TaskComment): boolean {
    return c.authorId === this.myId || this.auth.hasPermission('tasks.delete');
  }

  removeComment(c: TaskComment): void {
    this.notice.set('');
    this.api.removeComment(this.taskId(), c.id).subscribe({
      next: () => {
        this.setDetail(d => ({ ...d, comments: d.comments.filter(x => x.id !== c.id) }));
        this.changed.emit();
      },
      error: (e: HttpErrorResponse) => this.fail(e, 'Could not delete the comment.')
    });
  }

  // ---- helpers ----

  private loadMembers(projectId: number): void {
    this.projects.members(projectId).subscribe({ next: list => this.members.set(list) });
  }

  // Put the task's values into the form (the date input needs just "yyyy-MM-dd")
  private fillForm(t: Task): void {
    this.form.reset(
      {
        title: t.title,
        description: t.description ?? '',
        priority: t.priority,
        tag: t.tag ?? '',
        dueDate: t.dueDate ? t.dueDate.slice(0, 10) : ''
      },
      { emitEvent: false }
    );
  }

  // Replace the task part with what the API sent back, keeping the checklist and comments
  private applyTask(task: Task): void {
    this.setDetail(d => ({ ...d, task }));
  }

  private setChecklistDone(itemId: number, done: boolean): void {
    this.setDetail(d => ({ ...d, checklist: d.checklist.map(c => (c.id === itemId ? { ...c, done } : c)) }));
  }

  // Change the loaded task, then recalculate the counters shown in the panel
  private setDetail(change: (d: TaskDetail) => TaskDetail): void {
    this.detail.update(current => {
      if (!current) return current;
      const d = change(current);
      return {
        ...d,
        task: {
          ...d.task,
          checklistTotal: d.checklist.length,
          checklistDone: d.checklist.filter(c => c.done).length,
          commentCount: d.comments.length
        }
      };
    });
  }

  private fail(e: HttpErrorResponse, fallback: string): void {
    this.notice.set(
      e.status === 403 ? 'You can only change tasks assigned to you or created by you.' : apiError(e, fallback)
    );
  }
}