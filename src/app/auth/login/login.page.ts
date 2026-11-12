import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonInput } from '@ionic/angular';
import { signInWithEmailAndPassword } from 'firebase/auth';

import { auth } from '../../firebase';
import { AuthService } from '../auth.service';

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : undefined;
  }

  return undefined;
}

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonButton, IonContent, IonInput, RouterLink],
})
export class LoginPage {
  email = '';
  password = '';
  showPassword = false;
  errorMessage = '';
  isLoading = false;

  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  async login(): Promise<void> {
    if (this.isLoading) {
      return;
    }

    this.errorMessage = '';

    if (!this.email.trim() || !this.password) {
      this.errorMessage = 'Please enter your email and password.';
      return;
    }

    const email = this.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.errorMessage = 'Please enter a valid email address.';
      return;
    }

    this.isLoading = true;
    let signedIn = false;

    try {
      const credential = await signInWithEmailAndPassword(auth, email, this.password);
      signedIn = true;

      const profile = await this.authService.loadProfile(credential.user.uid);
      if (!profile) {
        await this.authService.clearSession();
        this.errorMessage =
          'This account has no student profile in Firestore. Please contact the application administrator.';
        return;
      }
      await this.router.navigate(['/home']);
    } catch (error: unknown) {
      const errorCode = getErrorCode(error);
      console.error('Login failed:', { code: errorCode ?? 'unknown' });
      if (signedIn) {
        await this.authService.clearSession();
      }

      if (
        errorCode === 'auth/invalid-credential' ||
        errorCode === 'auth/user-not-found' ||
        errorCode === 'auth/wrong-password'
      ) {
        this.errorMessage = 'Incorrect email or password.';
      } else if (errorCode === 'auth/invalid-email') {
        this.errorMessage = 'Invalid email address.';
      } else if (errorCode === 'auth/too-many-requests') {
        this.errorMessage = 'Too many sign-in attempts. Wait a little while and try again.';
      } else if (errorCode === 'auth/network-request-failed') {
        this.errorMessage = 'Could not reach Firebase. Check your internet connection and try again.';
      } else if (
        errorCode === 'auth/api-key-not-valid' ||
        errorCode === 'auth/invalid-api-key' ||
        errorCode === 'auth/app-not-authorized' ||
        errorCode === 'auth/unauthorized-domain'
      ) {
        this.errorMessage =
          errorCode === 'auth/unauthorized-domain'
            ? 'This app domain is not authorized in Firebase Authentication. Add the current hostname under Authentication settings.'
            : 'Firebase rejected this app configuration. Verify that the current Web API key belongs to the campus-lost-and-found-8cb17 project, Identity Toolkit API is enabled, and this domain is authorized.';
      } else if (errorCode === 'permission-denied') {
        this.errorMessage =
          'You signed in, but Firestore denied access to your student profile. Check the users/{uid} rules.';
      } else {
        this.errorMessage = `Login failed${errorCode ? ` (${errorCode})` : ''}. Check your connection and try again.`;
      }
    } finally {
      this.isLoading = false;
    }
  }
}
