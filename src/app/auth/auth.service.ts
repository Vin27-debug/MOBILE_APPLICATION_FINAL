import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  doc,
  getDoc,
  type DocumentData,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { BehaviorSubject } from 'rxjs';

import { auth, db, logFirestoreOperationError } from '../firebase';

export interface StudentProfile {
  uid: string;
  fullName: string;
  studentId: string;
  email: string;
  role: 'student';
}

function isStudentProfile(
  profile: DocumentData,
  uid: string,
): profile is StudentProfile {
  return (
    profile['uid'] === uid &&
    typeof profile['fullName'] === 'string' &&
    Boolean(profile['fullName'].trim()) &&
    typeof profile['studentId'] === 'string' &&
    typeof profile['email'] === 'string' &&
    profile['role'] === 'student'
  );
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
      const previousUid = this.userSubject.value?.uid;
      this.userSubject.next(user);

      if (previousUid !== user?.uid) {
        this.profileSubject.next(null);
      }

      if (!user) {
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
    if (!uid?.trim() || auth.currentUser?.uid !== uid) {
      return null;
    }

    if (this.profileSubject.value?.uid !== uid) {
      this.profileSubject.next(null);
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

    if (auth.currentUser?.uid !== uid) {
      return null;
    }

    if (!snapshot.exists()) {
      this.profileSubject.next(null);
      return null;
    }

    const data = snapshot.data();
    if (!isStudentProfile(data, uid)) {
      this.profileSubject.next(null);
      throw new Error(`Student profile /users/${uid} is invalid.`);
    }

    const profile: StudentProfile = {
      uid,
      fullName: data['fullName'].trim(),
      studentId: data['studentId'],
      email: data['email'],
      role: 'student',
    };
    this.profileSubject.next(profile);
    return profile;
  }

  async ensureAuthenticated(): Promise<boolean> {
    await auth.authStateReady();
    return Boolean(auth.currentUser?.uid.trim());
  }

  async logout(): Promise<void> {
    await this.clearSession();
    await this.router.navigate(['/login']);
  }

  async clearSession(): Promise<void> {
    await signOut(auth);
    this.profileSubject.next(null);
  }
}
