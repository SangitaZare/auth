import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { UserService } from '../../core/user.service';
import { RoleService } from '../../core/role.service';
import { apiError } from '../../core/http-error';
import { Role, UserListItem } from '../../core/models';

@Component({
  selector: 'app-users',
  templateUrl: './users.html',
  styleUrl: './users.css'
})
export class Users implements OnInit {
  private auth = inject(AuthService);
  private userApi = inject(UserService);
  private roleApi = inject(RoleService);

  users = signal<UserListItem[]>([]);
  roles = signal<Role[]>([]);
  loading = signal(true);
  error = signal('');
  notice = signal('');
  search = signal('');

  canManage = this.auth.hasPermission('users.manage');
  myId = this.auth.user()?.id;

  // The list after applying the search box
  shown = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.users();
    return this.users().filter(u => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  });

  ngOnInit(): void {
    forkJoin([this.userApi.list(), this.roleApi.list()]).subscribe({
      next: ([users, roles]) => {
        this.users.set(users);
        this.roles.set(roles);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.error.set(apiError(e, 'Could not load users.'));
        this.loading.set(false);
      }
    });
  }

  hasRole(user: UserListItem, roleId: number): boolean {
    return user.roleIds.includes(roleId);
  }

  // The API does not allow removing your own Admin role, so the box is locked
  isLocked(user: UserListItem, role: Role): boolean {
    return user.id === this.myId && role.name === 'Admin';
  }

  toggleRole(user: UserListItem, role: Role, checked: boolean): void {
    const previous = user.roleIds;
    const next = checked ? [...previous, role.id] : previous.filter(id => id !== role.id);

    this.notice.set('');
    this.setLocal(user.id, next); // show it straight away
    this.userApi.setRoles(user.id, next).subscribe({
      error: (e: HttpErrorResponse) => {
        this.setLocal(user.id, previous); // undo
        this.notice.set(apiError(e, 'Could not change the roles.'));
      }
    });
  }
  // Activate or deactivate an account. Shown at once; undone if the API says no.
  toggleActive(user: UserListItem): void {
    const next = !user.isActive;
    this.notice.set('');
    this.setActiveLocal(user.id, next);
    this.userApi.setActive(user.id, next).subscribe({
      error: (e: HttpErrorResponse) => {
        this.setActiveLocal(user.id, !next); // undo
        this.notice.set(apiError(e, 'Could not change the account status.'));
      }
    });
  }

  private setActiveLocal(userId: number, isActive: boolean): void {
    this.users.update(list => list.map(u => (u.id === userId ? { ...u, isActive } : u)));
  }
  private setLocal(userId: number, roleIds: number[]): void {
    const names = this.roles().filter(r => roleIds.includes(r.id)).map(r => r.name);
    this.users.update(list =>
      list.map(u => (u.id === userId ? { ...u, roleIds, roleNames: names } : u))
    );
  }
}