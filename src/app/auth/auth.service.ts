import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc, type DocumentSnapshot } from 'firebase/firestore';
import { BehaviorSubject } from 'rxjs';

import { auth, db, logFirestoreOperationError } from '../firebase';

export interface StudentProfile {
  uid: string;
  fullName: string;
  studentId: string;
  email: string;
  role: 'student';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userSubject = new BehaviorSubject<User | null>(auth.currentUser);
  private readonly profileSubject = new BehaviorSubject<StudentProfile | null>(null);

  readonly user$ = this.userSubject.asObservable();
  readonly profile$ = this.profileSubject.asObservable();

  private readonly router = inject(Router);

  constructor() {
    onAuthStateChanged(auth, (user) => {
      this.userSubject.next(user);
      if (!user) {
        this.profileSubject.next(null);
        return;
      }

      void this.loadProfile(user.uid).catch((error) => {
        console.error('Could not load the signed-in student profile:', error);
      });
    });
  }

  get currentUser(): User | null {
    return auth.currentUser;
  }

  async loadProfile(uid = auth.currentUser?.uid): Promise<StudentProfile | null> {
    if (!uid) {
      this.profileSubject.next(null);
      return null;
    }

    let snapshot: DocumentSnapshot;

    try {
      snapshot = await getDoc(doc(db, 'users', uid));
    } catch (error: unknown) {
      logFirestoreOperationError(
        `getDoc /users/${uid}`,
        `/users/${uid}`,
        error,
        auth.currentUser?.uid ?? null,
      );
      throw error;
    }

    if (!snapshot.exists()) {
      this.profileSubject.next(null);
      return null;
    }

    const profile = snapshot.data() as StudentProfile;
    this.profileSubject.next(profile);
    return profile;
  }

  async ensureAuthenticated(): Promise<boolean> {
    await auth.authStateReady();
    return auth.currentUser !== null;
  }

  async logout(): Promise<void> {
    await this.clearSession();
    await this.router.navigate(['/login']);
  }

  async clearSession(): Promise<void> {
    await signOut(auth);
  }
}
