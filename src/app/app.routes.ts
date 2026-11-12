
import type { Routes } from '@angular/router';

import { authGuard } from './auth/auth.guard';
import { guestGuard } from './auth/guest.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./auth/login/login.page').then((m) => m.LoginPage),
    canActivate: [guestGuard],
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./auth/register/register.page').then((m) => m.RegisterPage),
    canActivate: [guestGuard],
  },
  {
    path: 'home',
    loadComponent: () =>
      import('./home/home.page').then((m) => m.HomePage),
    canActivate: [authGuard],
  },
  {
    path: 'messages',
    loadComponent: () =>
      import('./lost-items/messages.page').then((m) => m.MessagesPage),
    canActivate: [authGuard],
  },
  {
    path: 'report',
    loadComponent: () =>
      import('./lost-items/report-lost-item.page').then((m) => m.ReportLostItemPage),
    canActivate: [authGuard],
  },
  {
    path: 'chat/:conversationId',
    loadComponent: () =>
      import('./lost-items/item-chat.page').then((m) => m.ItemChatPage),
    canActivate: [authGuard],
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'home',
  },
];
