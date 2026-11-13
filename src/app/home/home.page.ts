
import { CommonModule } from '@angular/common';
import {
  Component,
  inject,
  NgZone,
  ChangeDetectorRef,
} from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent } from '@ionic/angular';
import type { User } from 'firebase/auth';
import type { Unsubscribe } from 'firebase/firestore';
import type { Subscription } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { HapticsFeedbackService } from '../haptics-feedback.service';
import { LostItemsService } from '../lost-items/lost-items.service';
import type {
  LostItem,
  OwnershipConversation,
} from '../lost-items/lost-items.service';

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : undefined;
  }

  return undefined;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [CommonModule, IonButton, IonContent, RouterLink],
})
export class HomePage implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly haptics = inject(HapticsFeedbackService);
  private readonly lostItemsService = inject(LostItemsService);
  private readonly router = inject(Router);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  private authStateSubscription?: Subscription;
  searchText = '';
  currentUid = '';
  displayName = 'Student';
  expandedItemId: string | null = null;

  items: LostItem[] = [];
  conversations: OwnershipConversation[] = [];

  isLoading = true;
  errorMessage = '';
  profileErrorMessage = '';
  actionError = '';

  private feedSubscription?: Unsubscribe;
  private activeUid?: string;
  private isViewActive = false;
  private authStateReady = false;

  get filteredItems(): LostItem[] {
    const search = this.searchText.trim().toLowerCase();

    return this.items.filter((item) =>
      `${item.itemName} ${item.description} ${item.lastSeenLocation} ${item.ownerName}`
        .toLowerCase()
        .includes(search),
    );
  }

  ngOnInit(): void {
    this.authStateSubscription = this.authService.user$.subscribe((user) => {
      if (this.isViewActive && this.authStateReady) {
        this.handleAuthStateChange(user);
      }
    });
  }

  async ionViewWillEnter(): Promise<void> {
    this.isViewActive = true;
    this.authStateReady = false;
    this.isLoading = true;

    const isAuthenticated = await this.authService.ensureAuthenticated();

    if (!this.isViewActive) {
      return;
    }

    this.authStateReady = true;
    const user = this.authService.currentUser;

    if (!isAuthenticated || !user?.uid.trim()) {
      this.handleUnauthenticated();
      return;
    }

    await this.loadForUser(user);
  }

  ionViewWillLeave(): void {
    this.isViewActive = false;
    this.authStateReady = false;
    this.stopFeed();
  }

  ngOnDestroy(): void {
    this.ionViewWillLeave();
    this.authStateSubscription?.unsubscribe();
  }

  private handleAuthStateChange(user: User | null): void {
    if (!user?.uid.trim()) {
      this.handleUnauthenticated();
      return;
    }

    void this.loadForUser(user);
  }

  private async loadForUser(user: User): Promise<void> {
    const uid = user.uid;
    if (!uid.trim() || this.authService.currentUser?.uid !== uid) {
      this.handleUnauthenticated();
      return;
    }

    if (this.activeUid === uid && this.feedSubscription) {
      return;
    }

    this.stopFeed();
    this.activeUid = uid;
    this.currentUid = user.uid;
    this.displayName = 'Student';
    this.isLoading = true;
    this.errorMessage = '';
    this.profileErrorMessage = '';
    this.items = [];
    this.conversations = [];
    this.cdr.detectChanges();

    // Real-time Lost Items feed.
    this.feedSubscription = this.lostItemsService.watchOpenItems(
      (items) => {
        if (
          !this.isViewActive ||
          this.activeUid !== uid ||
          this.authService.currentUser?.uid !== uid
        ) {
          return;
        }

        this.ngZone.run(() => {
          this.items = [...items];
          this.isLoading = false;
          this.errorMessage = '';
          this.cdr.detectChanges();
        });
      },
      (error) => {
        if (
          !this.isViewActive ||
          this.activeUid !== uid ||
          this.authService.currentUser?.uid !== uid
        ) {
          return;
        }

        this.ngZone.run(() => {
          this.handleFeedError(error);
          this.cdr.detectChanges();
        });
      },
    );

    // Load student profile independently.
    try {
      const profile = await this.authService.loadProfile(user.uid);

      if (
        this.isViewActive &&
        this.activeUid === uid &&
        this.authService.currentUser?.uid === uid
      ) {
        this.ngZone.run(() => {
          if (profile?.uid === uid) {
            this.displayName = profile.fullName;
          } else {
            this.profileErrorMessage =
              'Your student profile could not be found. Please sign in again or contact the application administrator.';
          }

          this.cdr.detectChanges();
        });
      }
    } catch (error: unknown) {
      console.error('Profile could not be loaded:', error);

      if (
        this.isViewActive &&
        this.activeUid === uid &&
        this.authService.currentUser?.uid === uid
      ) {
        this.ngZone.run(() => {
          this.profileErrorMessage =
            'Your student profile could not be loaded. Check your connection and try again.';
          this.cdr.detectChanges();
        });
      }
    }

    if (
      !this.isViewActive ||
      this.activeUid !== uid ||
      this.authService.currentUser?.uid !== uid
    ) {
      return;
    }

    // Load existing conversations.
    try {
      const conversations =
        await this.lostItemsService.getConversationsForUser(uid);

      if (this.isViewActive && this.activeUid === uid) {
        this.ngZone.run(() => {
          this.conversations = conversations;
          this.cdr.detectChanges();
        });
      }
    } catch (error: unknown) {
      console.error('Conversations could not be loaded:', {
        code: getErrorCode(error) ?? 'unknown',
      });

      if (this.isViewActive && this.activeUid === uid) {
        this.ngZone.run(() => {
          this.conversations = [];
          this.cdr.detectChanges();
        });
      }
    }
  }

  private stopFeed(): void {
    this.feedSubscription?.();
    this.feedSubscription = undefined;
    this.activeUid = undefined;
  }

  private handleUnauthenticated(): void {
    this.stopFeed();
    this.currentUid = '';
    this.displayName = 'Student';
    this.profileErrorMessage = '';
    this.items = [];
    this.conversations = [];
    this.isLoading = false;
    this.errorMessage = 'Please sign in again to view lost item reports.';
    this.cdr.detectChanges();
  }

  getInitials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'S';
  }

  toggleDetails(itemId: string): void {
    this.expandedItemId =
      this.expandedItemId === itemId ? null : itemId;
  }

  clearSearch(): void {
    this.searchText = '';
    this.expandedItemId = null;
  }

  private handleFeedError(error: unknown): void {
    const code = getErrorCode(error);

    console.error('Lost item feed could not be loaded:', {
      code: code ?? 'unknown',
      message: error instanceof Error ? error.message : String(error),
      error,
    });

    this.errorMessage =
      code === 'permission-denied'
        ? 'Firestore denied access to the lost items feed. Confirm the deployed Firestore rules allow authenticated users to read lostItems.'
        : `Could not load lost item reports${code ? ` (${code})` : ''}. Check your connection and Firebase settings.`;

    this.isLoading = false;
  }

  searchItems(event: Event): void {
    this.searchText = (event.target as HTMLInputElement).value;
    this.expandedItemId = null;
  }

  async requestItem(item: LostItem): Promise<void> {
    this.actionError = '';

    try {
      const conversationId =
        await this.lostItemsService.requestOwnership(item);

      await this.haptics.success();
      await this.router.navigate(['/chat', conversationId]);
    } catch (error: unknown) {
      const code = getErrorCode(error);

      console.error('Ownership request could not be started:', {
        code: code ?? 'unknown',
        error,
      });

      this.actionError =
        `Could not start a private ownership chat${code ? ` (${code})` : ''}.`;

      this.cdr.detectChanges();
    }
  }

  async logout(): Promise<void> {
    this.stopFeed();

    try {
      await this.authService.logout();
    } catch (error: unknown) {
      console.error('Sign out failed:', error);
      this.actionError = 'Could not sign out. Please try again.';

      const user = this.authService.currentUser;
      if (this.isViewActive && user?.uid.trim()) {
        void this.loadForUser(user);
      }

      this.cdr.detectChanges();
    }
  }

  get totalUnread(): number {
    return this.conversations.reduce((total, conversation) => {
      const unread =
        conversation.ownerUid === this.currentUid
          ? conversation.ownerUnread || 0
          : conversation.requesterUnread || 0;

      return total + unread;
    }, 0);
  }

}
