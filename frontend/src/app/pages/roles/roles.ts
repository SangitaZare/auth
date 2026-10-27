import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { RoleService } from '../../core/role.service';
import { apiError } from '../../core/http-error';
import { Permission, Role } from '../../core/models';

@Component({
  selector: 'app-roles',
  templateUrl: './roles.html',
  styleUrl: './roles.css'
})
export class Roles implements OnInit {
  private api = inject(RoleService);

  roles = signal<Role[]>([]);
  permissions = signal<Permission[]>([]);
  selectedId = signal<number | null>(null);
  loading = signal(true);
  creating = signal(false);
  error = signal('');
  notice = signal('');

  selected = computed(() => this.roles().find(r => r.id === this.selectedId()) ?? null);
  isAdmin = computed(() => this.selected()?.name === 'Admin');

  ngOnInit(): void {
    forkJoin([this.api.list(), this.api.permissions()]).subscribe({
      next: ([roles, permissions]) => {
        this.roles.set(roles);
        this.permissions.set(permissions);
        // Start on the first role that can be edited
        this.selectedId.set((roles.find(r => r.name !== 'Admin') ?? roles[0])?.id ?? null);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.error.set(apiError(e, 'Could not load roles.'));
        this.loading.set(false);
      }
    });
  }

  select(id: number): void {
    this.selectedId.set(id);
    this.notice.set('');
  }

  has(permissionId: number): boolean {
    return this.selected()?.permissionIds.includes(permissionId) ?? false;
  }

  toggle(permission: Permission, checked: boolean): void {
    const role = this.selected();
    if (!role) return;

    const previous = role.permissionIds;
    const next = checked ? [...previous, permission.id] : previous.filter(id => id !== permission.id);

    this.notice.set('');
    this.setLocal(role.id, next); // show it straight away
    this.api.setPermissions(role.id, next).subscribe({
      error: (e: HttpErrorResponse) => {
        this.setLocal(role.id, previous); // undo
        this.notice.set(apiError(e, 'Could not change the permissions.'));
      }
    });
  }

  createRole(nameInput: HTMLInputElement, descInput: HTMLInputElement): void {
    const name = nameInput.value.trim();
    if (!name || this.creating()) return;

    this.notice.set('');
    this.creating.set(true);
    this.api.create(name, descInput.value.trim() || null).subscribe({
      next: role => {
        this.creating.set(false);
        nameInput.value = '';
        descInput.value = '';
        this.roles.update(list => [...list, role]);
        this.selectedId.set(role.id);
      },
      error: (e: HttpErrorResponse) => {
        this.creating.set(false);
        this.notice.set(apiError(e, 'Could not create the role.'));
      }
    });
  }

  private setLocal(roleId: number, permissionIds: number[]): void {
    this.roles.update(list => list.map(r => (r.id === roleId ? { ...r, permissionIds } : r)));
  }
}