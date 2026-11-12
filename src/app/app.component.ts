
import { Component, OnDestroy, inject } from '@angular/core';
import { IonApp, IonRouterOutlet, Platform } from '@ionic/angular';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnDestroy {
  private readonly platform = inject(Platform);
  private readonly router = inject(Router);

  private backButtonSubscription?: Subscription;

  constructor() {
    this.backButtonSubscription =
      this.platform.backButton.subscribeWithPriority(9999, () => {
        const currentRoute = this.router.url.split('?')[0];

        if (currentRoute === '/home') {
          if (Capacitor.isNativePlatform()) {
            void App.exitApp();
          }
          return;
        }

        if (currentRoute === '/login') {
          if (Capacitor.isNativePlatform()) {
            void App.exitApp();
          }
          return;
        }

        // Other pages: let Ionic handle normal back navigation.
        window.history.back();
      });
  }

  ngOnDestroy(): void {
    this.backButtonSubscription?.unsubscribe();
  }
}
