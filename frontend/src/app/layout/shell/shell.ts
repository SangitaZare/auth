import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { MenuService } from '../../core/menu.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html',
  styleUrl: './shell.css'
})
export class Shell implements OnInit, OnDestroy {
  auth = inject(AuthService);
  menu = inject(MenuService);

  ngOnInit(): void {
    this.menu.load();
  }

  ngOnDestroy(): void {
    this.menu.clear();
  }
}