import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonInput } from '@ionic/angular';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

import { auth, db } from '../../firebase';
import { AuthService } from '../auth.service';

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : undefined;
  }

  return undefined;
}

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonButton, IonContent, IonInput, RouterLink],
})
export class RegisterPage {
  fullName = '';
  studentId = '';
  email = '';
  password = '';
  confirmPassword = '';

  errorMessage = '';
  successMessage = '';
  isLoading = false;
  pendingProfileUid: string | null = null;

  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  async register(): Promise<void> {
    if (this.isLoading) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';

    if (!this.fullName.trim() || !this.studentId.trim() || !this.email.trim()) {
      this.errorMessage = 'Please enter your full name, student ID, and email.';
      return;
    }

    const email = this.email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.errorMessage = 'Please enter a valid email address.';
      return;
    }

    if (!this.pendingProfileUid) {
      if (!this.password || !this.confirmPassword) {
        this.errorMessage = 'Please enter and confirm your password.';
        return;
      }

      if (this.password.length < 8) {
        this.errorMessage = 'Password must be at least 8 characters.';
        return;
      }

      if (this.password !== this.confirmPassword) {
        this.errorMessage = 'Passwords do not match.';
        return;
      }
    }

    this.isLoading = true;

    try {
      let profileUid = this.pendingProfileUid;
      if (!profileUid) {
        const credential = await createUserWithEmailAndPassword(auth, email, this.password);
        profileUid = credential.user.uid;
        this.pendingProfileUid = profileUid;
      }

      await setDoc(doc(db, 'users', profileUid), {
        uid: profileUid,
        fullName: this.fullName.trim(),
        studentId: this.studentId.trim(),
        email: email,
        role: 'student',
        createdAt: serverTimestamp(),
      });

      await this.authService.loadProfile(profileUid);
      this.pendingProfileUid = null;
      this.successMessage = 'Account created successfully!';

      setTimeout(() => {
        this.router.navigate(['/login']);
      }, 1000);
    } catch (error: unknown) {
      const errorCode = getErrorCode(error);
      console.error('Registration failed:', { code: errorCode ?? 'unknown' });

      if (this.pendingProfileUid) {
        this.errorMessage =
          errorCode === 'permission-denied'
            ? 'Your account was created, but Firestore denied the profile write. Check the users collection rules so each signed-in student can write only their own document, then retry.'
            : 'Your account was created, but its student profile could not be saved. Check your connection and Firestore rules, then tap Retry Profile Save.';
      } else if (errorCode === 'auth/email-already-in-use') {
        this.errorMessage = 'This email is already registered.';
      } else if (errorCode === 'auth/weak-password') {
        this.errorMessage = 'Password must be at least 8 characters.';
      } else if (errorCode === 'auth/invalid-email') {
        this.errorMessage = 'Invalid email address.';
      } else if (errorCode === 'auth/operation-not-allowed') {
        this.errorMessage = 'Email and password sign-in is not enabled in Firebase Authentication.';
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
      } else {
        this.errorMessage = `Registration failed${errorCode ? ` (${errorCode})` : ''}. Check your Firebase configuration and try again.`;
      }
    } finally {
      this.isLoading = false;
    }
  }
}
