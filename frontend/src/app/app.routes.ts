import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Dashboard } from './pages/dashboard/dashboard';
import { ComingSoon } from './pages/coming-soon/coming-soon';
import { Shell } from './layout/shell/shell';
import { authGuard, guestGuard, permissionGuard } from './core/auth.guard';
import { Register } from './pages/register/register';
import { Board } from './pages/board/board';
import { Users } from './pages/users/users';
import { Roles } from './pages/roles/roles';
import { Reports } from './pages/reports/reports';
export const routes: Routes = [
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'register', component: Register, canActivate: [guestGuard] },
  // Everything inside the shell (sidebar + top bar) needs a login
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: Dashboard },
      { path: 'board', component: Board, canActivate: [permissionGuard('tasks.view')] },
          { path: 'reports', component: Reports, canActivate: [permissionGuard('reports.view')] },
      // CHANGED: was ComingSoon
      { path: 'users', component: Users, canActivate: [permissionGuard('users.read')] },
      // CHANGED: was ComingSoon
      { path: 'roles', component: Roles, canActivate: [permissionGuard('roles.manage')] },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' }
    ]
  },
  { path: '**', redirectTo: '' }
];