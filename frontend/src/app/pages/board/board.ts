import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { ProjectService } from '../../core/project.service';
import { TaskService } from '../../core/task.service';
import { apiError } from '../../core/http-error';
import { TaskDrawer } from './task-drawer';
import { BOARD_COLUMNS, Project, Task, TaskPriority, TaskStatus } from '../../core/models';
import { AuthService } from '../../core/auth.service';
import { UserService } from '../../core/user.service';
import { UserListItem } from '../../core/models';

// Fixed colours for the common tags; any other tag gets a colour based on its name
const TAG_HUES: Record<string, number> = { design: 280, content: 35, backend: 210, bug: 0 };

@Component({
  selector: 'app-board',
  imports: [TaskDrawer],
  templateUrl: './board.html',
  styleUrl: './board.css'
})
export class Board implements OnInit {
  private projectApi = inject(ProjectService);
  private taskApi = inject(TaskService);
    private userApi = inject(UserService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  projects = signal<Project[]>([]);
  projectId = signal<number | null>(null);
  tasks = signal<Task[]>([]);
  mine = signal(false);                      // true = only tasks assigned to me
  loading = signal(true);
  error = signal('');
  notice = signal('');                       // short message, e.g. "you can only move your own tasks"
  draggingId = signal<number | null>(null);  // the card being dragged
  overCol = signal<TaskStatus | null>(null); // the column the card is hovering over
  openId = signal<number | null>(null);      // the task whose detail panel is open
  adding = signal(false);                    // is the "new task" row open?
  creating = signal(false);                  // true while the new task is being saved
  canCreate = inject(AuthService).hasPermission('tasks.create');
  
  canManage = inject(AuthService).hasPermission('projects.manage'); // can create projects and manage members
  addingProject = signal(false);             // is the "new project" row open?
  creatingProject = signal(false);   
    managingMembers = signal(false);           // is the Members panel open?
  allUsers = signal<UserListItem[]>([]);     // everyone who could be added
  currentProject = computed(() => this.projects().find(p => p.id === this.projectId()) ?? null);        // true while the new project is being saved
  
  editingProject = signal(false);            // is the "edit project" panel open?
  savingProject = signal(false);             // true while the edit is being saved
  confirmingDelete = signal(false);          // first click on Delete asks "are you sure?"
  deletingProject = signal(false);           // true while the project is being deleted
  private noticeTimer?: ReturnType<typeof setTimeout>;

  // ---- search and filters (they only narrow the tasks already loaded) ----
  search = signal('');
  priorityFilter = signal<'' | TaskPriority>('');
  tagFilter = signal('');
  assigneeFilter = signal('');               // '' = everyone, 'none' = unassigned, otherwise a user id

  filtersActive = computed(
    () => !!this.search().trim() || !!this.priorityFilter() || !!this.tagFilter() || !!this.assigneeFilter()
  );

  // The tags that exist on the loaded tasks, for the Tag dropdown
  tags = computed(() =>
    [...new Set(this.tasks().map(t => t.tag).filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b))
  );

  // The people who have a task on the loaded board, for the Assignee dropdown
  assignees = computed(() => {
    const seen = new Map<number, string>();
    for (const t of this.tasks()) {
      if (t.assigneeId !== null && t.assigneeName) seen.set(t.assigneeId, t.assigneeName);
    }
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });

  // The tasks that pass every active filter
  visibleTasks = computed(() => {
    const q = this.search().trim().toLowerCase();
    const pr = this.priorityFilter();
    const tag = this.tagFilter();
    const who = this.assigneeFilter();
    return this.tasks().filter(t => {
      if (q && !(t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q))) return false;
      if (pr && t.priority !== pr) return false;
      if (tag && t.tag !== tag) return false;
      if (who === 'none' && t.assigneeId !== null) return false;
      if (who && who !== 'none' && String(t.assigneeId) !== who) return false;
      return true;
    });
  });

  // The four columns, each with its own tasks in the saved order.
  // This recalculates by itself whenever the visible tasks change.
  columns = computed(() =>
    BOARD_COLUMNS.map(col => ({
      ...col,
      tasks: this.visibleTasks()
        .filter(t => t.status === col.key)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    }))
  );

  ngOnInit(): void {
    this.loadProjects();
  }

  loadProjects(): void {
    this.loading.set(true);
    this.error.set('');
    this.projectApi.list().subscribe({
      next: list => {
        this.projects.set(list);
        if (list.length === 0) {
          this.loading.set(false);
          return;
        }

        // Did we arrive from a link like /board?project=2&task=12 ?
        const qp = this.route.snapshot.queryParamMap;
        const wantedProject = Number(qp.get('project'));
        const wantedTask = Number(qp.get('task'));
        const found = list.find(p => p.id === wantedProject);

        this.projectId.set(found ? found.id : list[0].id);
        this.loadTasks();

        if (wantedTask) {
          this.openId.set(wantedTask);
          // Remove ?project=&task= from the address so F5 doesn't reopen it
          this.router.navigate([], { queryParams: {}, replaceUrl: true });
        }
      },
      error: (e: HttpErrorResponse) => {
        this.error.set(apiError(e, 'Could not load projects.'));
        this.loading.set(false);
      }
    });
  }

  loadTasks(quiet = false): void {
    const id = this.projectId();
    if (id === null) return;
    const mine = this.mine();

    if (!quiet) this.loading.set(true);
    this.error.set('');
    this.taskApi.list(id, mine).subscribe({
      next: tasks => {
        // Ignore a slow answer if the user already switched project or filter
        if (id !== this.projectId() || mine !== this.mine()) return;
        this.tasks.set(tasks);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.error.set(apiError(e, 'Could not load tasks.'));
        this.loading.set(false);
      }
    });
  }

  selectProject(id: number): void {
    this.closeProjectPanels();      // <-- add this line
    this.projectId.set(id);
    this.clearFilters(); // tags and people differ from project to project
    this.loadTasks();
  }

  setMine(value: boolean): void {
    this.mine.set(value);
    this.loadTasks();
  }

  // ---- filter helpers used by the template ----

  setPriority(value: string): void {
    this.priorityFilter.set(value as '' | TaskPriority);
  }

  clearFilters(): void {
    this.search.set('');
    this.priorityFilter.set('');
    this.tagFilter.set('');
    this.assigneeFilter.set('');
  }

  toggleAdd(): void {
    this.adding.update(open => !open);
  }
  toggleAddProject(): void {
    this.addingProject.update(open => !open);
  }

  createProject(nameInput: HTMLInputElement, descInput: HTMLInputElement): void {
    const name = nameInput.value.trim();
    if (!name || this.creatingProject()) return;

    this.creatingProject.set(true);
    this.projectApi.create(name, descInput.value.trim() || null).subscribe({
      next: project => {
        this.creatingProject.set(false);
        nameInput.value = '';
        descInput.value = '';
        this.addingProject.set(false);
        this.projects.update(list => [...list, project].sort((a, b) => a.name.localeCompare(b.name)));
        this.mine.set(false);
        this.selectProject(project.id); // switch the board to the new (empty) project
      },
      error: (e: HttpErrorResponse) => {
        this.creatingProject.set(false);
        this.showNotice(apiError(e, 'Could not create the project.'));
      }
    });
  }
    toggleMembers(): void {
    const open = !this.managingMembers();
    this.managingMembers.set(open);
    if (open && this.allUsers().length === 0) {
      this.userApi.list().subscribe({
        next: users => this.allUsers.set(users),
        error: (e: HttpErrorResponse) => this.showNotice(apiError(e, 'Could not load the users.'))
      });
    }
  }

  isMember(userId: number): boolean {
    return !!this.currentProject()?.memberIds.includes(userId);
  }

  // Ticking or unticking saves straight away; if the API says no, the tick goes back
  toggleMember(userId: number, checked: boolean): void {
    const project = this.currentProject();
    if (!project) return;

    const before = project.memberIds;
    const ids = checked ? [...before, userId] : before.filter(id => id !== userId);
    this.setProjectMembers(project.id, ids);

    this.projectApi.setMembers(project.id, ids).subscribe({
      next: () => {
        if (!checked) this.loadTasks(true); // their tasks in this project were unassigned
      },
      error: (e: HttpErrorResponse) => {
        this.setProjectMembers(project.id, before);
        this.showNotice(apiError(e, 'Could not change the members.'));
      }
    });
  }

  private setProjectMembers(projectId: number, memberIds: number[]): void {
    this.projects.update(list => list.map(p => (p.id === projectId ? { ...p, memberIds } : p)));
  }
    // ---- edit and delete the current project ----

  toggleEditProject(): void {
    const open = !this.editingProject();
    this.closeProjectPanels();
    this.editingProject.set(open);
  }

  private closeProjectPanels(): void {
    this.editingProject.set(false);
    this.confirmingDelete.set(false);
    this.managingMembers.set(false);
  }

  saveProject(nameInput: HTMLInputElement, descInput: HTMLInputElement): void {
    const project = this.currentProject();
    const name = nameInput.value.trim();
    if (!project || !name || this.savingProject()) return;
    const description = descInput.value.trim() || null;

    this.savingProject.set(true);
    this.projectApi.update(project.id, name, description).subscribe({
      next: () => {
        this.savingProject.set(false);
        this.projects.update(list =>
          list
            .map(p => (p.id === project.id ? { ...p, name, description } : p))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        this.editingProject.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.savingProject.set(false);
        this.showNotice(apiError(e, 'Could not save the project.'));
      }
    });
  }

  deleteProject(): void {
    const project = this.currentProject();
    if (!project || this.deletingProject()) return;

    // Two-step: the first click only asks for confirmation
    if (!this.confirmingDelete()) {
      this.confirmingDelete.set(true);
      return;
    }

    this.deletingProject.set(true);
    this.projectApi.remove(project.id).subscribe({
      next: () => {
        this.deletingProject.set(false);
        this.closeProjectPanels();
        this.openId.set(null);
        const rest = this.projects().filter(p => p.id !== project.id);
        this.projects.set(rest);
        if (rest.length > 0) {
          this.selectProject(rest[0].id);
        } else {
          this.projectId.set(null);
          this.tasks.set([]);
        }
        this.showNotice(`Project "${project.name}" was deleted.`);
      },
      error: (e: HttpErrorResponse) => {
        this.deletingProject.set(false);
        this.confirmingDelete.set(false);
        this.showNotice(apiError(e, 'Could not delete the project.'));
      }
    });
  }
  createTask(input: HTMLInputElement): void {
    const title = input.value.trim();
    const projectId = this.projectId();
    if (!title || projectId === null || this.creating()) return;

    this.creating.set(true);
    this.taskApi.create({ projectId, title }).subscribe({
      next: task => {
        this.creating.set(false);
        input.value = '';
        this.adding.set(false);
        this.mine.set(false);       // a new task has no assignee, so make sure the board shows it
        this.clearFilters();        // ...and that no filter hides it
        this.loadTasks(true);
        this.openId.set(task.id);   // open it so the details can be filled in
      },
      error: (e: HttpErrorResponse) => {
        this.creating.set(false);
        this.showNotice(apiError(e, 'Could not create the task.'));
      }
    });
  }

  // ---- drag and drop (paused while a filter is on) ----

  onDragStart(e: DragEvent, t: Task): void {
    if (this.filtersActive()) {
      e.preventDefault();
      return;
    }
    this.draggingId.set(t.id);
    e.dataTransfer?.setData('text/plain', String(t.id)); // Firefox needs some data to start a drag
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  onDragEnd(): void {
    this.draggingId.set(null);
    this.overCol.set(null);
  }

  onDragOver(e: DragEvent, status: TaskStatus): void {
    e.preventDefault(); // without this the browser does not allow dropping here
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    this.overCol.set(status);
  }

  onDragLeave(e: DragEvent): void {
    // Only clear when the pointer really left the column, not when it moved over a card inside it
    const col = e.currentTarget as HTMLElement;
    if (!col.contains(e.relatedTarget as Node)) this.overCol.set(null);
  }

  onDrop(e: DragEvent, status: TaskStatus): void {
    e.preventDefault();
    const id = this.draggingId();
    const col = e.currentTarget as HTMLElement;

    // Where was it dropped? Count the cards whose middle is above the pointer.
    const others = Array.from(col.querySelectorAll<HTMLElement>('.card:not(.dragging)'));
    const index = others.filter(c => {
      const r = c.getBoundingClientRect();
      return e.clientY > r.top + r.height / 2;
    }).length;

    this.onDragEnd();
    if (id === null) return;

    const before = this.tasks();
    const task = before.find(t => t.id === id);
    if (!task) return;

    // The other cards of the target column, in order, without the dragged one
    const siblings = before
      .filter(t => t.status === status && t.id !== id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    // Dropped back where it already was: nothing to do
    const currentIndex = before
      .filter(t => t.status === task.status)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .findIndex(t => t.id === id);
    if (task.status === status && currentIndex === index) return;

    // 1. Move it on screen straight away
    siblings.splice(Math.min(index, siblings.length), 0, { ...task, status });
    const renumbered = new Map(siblings.map((t, i) => [t.id, { ...t, sortOrder: i }]));
    this.tasks.set(before.map(t => renumbered.get(t.id) ?? t));

    // 2. Save it. If the API says no, put everything back and explain.
    this.taskApi.move(id, status, index).subscribe({
      next: saved => this.tasks.update(list => list.map(t => (t.id === saved.id ? saved : t))),
      error: (err: HttpErrorResponse) => {
        this.tasks.set(before);
        this.showNotice(
          err.status === 403
            ? 'You can only move tasks assigned to you or created by you.'
            : apiError(err, 'Could not move the task.')
        );
      }
    });
  }

  private showNotice(message: string): void {
    this.notice.set(message);
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.set(''), 5000);
  }

  // ---- small helpers used by the template ----

  initials(name: string | null): string {
    if (!name) return '–';
    return name.split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase();
  }

  private daysLeft(due: string): number {
    const d = new Date(due);
    const today = new Date();
    d.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  }

  dueLabel(due: string): string {
    const n = this.daysLeft(due);
    if (n < 0) return `Overdue ${-n}d`;
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    return `In ${n} days`;
  }

  isLate(t: Task): boolean {
    return !!t.dueDate && t.status !== 'done' && this.daysLeft(t.dueDate) < 0;
  }

  tagHue(tag: string): number {
    const known = TAG_HUES[tag.toLowerCase()];
    if (known !== undefined) return known;
    return [...tag].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;
  }
}