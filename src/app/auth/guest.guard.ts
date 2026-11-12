
import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from './auth.service';

export const guestGuard: CanActivateFn = async () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const isAuthenticated =
        await authService.ensureAuthenticated();

    return isAuthenticated
        ? router.createUrlTree(['/home'])
        : true;
};
