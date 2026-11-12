
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
import type { Unsubscribe } from 'firebase/firestore';

import { AuthService } from '../auth/auth.service';
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
  private readonly lostItemsService = inject(LostItemsService);
  private readonly router = inject(Router);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  searchText = '';
  currentUid = '';
  displayName = 'Student';
  expandedItemId: string | null = null;

  items: LostItem[] = [];
  conversations: OwnershipConversation[] = [];

  isLoading = true;
  errorMessage = '';
  actionError = '';

  private feedSubscription?: Unsubscribe;

  get filteredItems(): LostItem[] {
    const search = this.searchText.trim().toLowerCase();

    return this.items.filter((item) =>
      `${item.itemName} ${item.description} ${item.lastSeenLocation} ${item.ownerName}`
        .toLowerCase()
        .includes(search),
    );
  }

  async ngOnInit(): Promise<void> {
    await this.authService.ensureAuthenticated();

    const user = this.authService.currentUser;

    if (!user) {
      this.isLoading = false;
      this.errorMessage = 'Please sign in again to view lost item reports.';
      this.cdr.detectChanges();
      return;
    }

    this.currentUid = user.uid;
    this.displayName = user.displayName || user.email || 'Student';
    this.isLoading = true;
    this.errorMessage = '';

    // Real-time Lost Items feed.
    this.feedSubscription = this.lostItemsService.watchOpenItems(
      (items) => {
        this.ngZone.run(() => {
          this.items = [...items];
          this.isLoading = false;
          this.errorMessage = '';
          this.cdr.detectChanges();
        });
      },
      (error) => {
        this.ngZone.run(() => {
          this.handleFeedError(error);
          this.cdr.detectChanges();
        });
      },
    );

    // Load student profile independently.
    try {
      const profile = await this.authService.loadProfile(user.uid);

      if (profile) {
        this.ngZone.run(() => {
          this.displayName = profile.fullName;
          this.cdr.detectChanges();
        });
      }
    } catch (error: unknown) {
      console.error('Profile could not be loaded:', error);
    }

    // Load existing conversations.
    try {
      const conversations =
        await this.lostItemsService.getConversationsForUser(user.uid);

      this.ngZone.run(() => {
        this.conversations = conversations;
        this.cdr.detectChanges();
      });
    } catch (error: unknown) {
      console.error('Conversations could not be loaded:', {
        code: getErrorCode(error) ?? 'unknown',
      });

      this.ngZone.run(() => {
        this.conversations = [];
        this.cdr.detectChanges();
      });
    }
  }

  ngOnDestroy(): void {
    this.feedSubscription?.();
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
    try {
      await this.authService.logout();
    } catch (error: unknown) {
      console.error('Sign out failed:', error);
      this.actionError = 'Could not sign out. Please try again.';
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
