
import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  inject,
  NgZone,
} from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent } from '@ionic/angular';
import type { Unsubscribe } from 'firebase/firestore';

import { AuthService } from '../auth/auth.service';
import {
  LostItemsService,
  type OwnershipConversation,
} from './lost-items.service';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, RouterLink, IonButton, IonContent],
  template: `
    <ion-content [fullscreen]="true">
      <main class="inbox-container">

        <header class="inbox-header">
          <a routerLink="/home" class="back-link">← Home</a>
          <h1>Messages</h1>
          <p>Your private conversations</p>
        </header>

        <div class="inbox-search">
          <span>🔍</span>
          <input
            type="search"
            placeholder="Search conversations..."
            aria-label="Search conversations"
            [value]="searchText"
            (input)="onSearch($event)"
          />
        </div>

        @if (isLoading) {
          <div class="empty-state">Loading conversations...</div>
        } @else if (errorMessage) {
          <div class="error-message">{{ errorMessage }}</div>
        } @else if (filteredConversations.length === 0) {
          <div class="empty-state">
            <div class="empty-icon">💬</div>
            <h2>No conversations yet</h2>
            <p>
              When you message an item owner or someone contacts you,
              your conversations will appear here.
            </p>
            <ion-button routerLink="/home">Explore Lost Items</ion-button>
          </div>
        } @else {
          <section class="conversation-list">
            <h2>Recent conversations</h2>

            @for (
              conversation of filteredConversations;
              track conversation.id
            ) {
              <a
                class="conversation-card"
                [routerLink]="['/chat', conversation.id]"
              >
                <div class="avatar">
                  💬
                </div>

                <div class="conversation-info">
                  <div class="conversation-top">
                    <h3>{{ conversation.itemName }}</h3>
                    <time>
                      {{
                        (conversation.lastMessageAt ||
                          conversation.createdAt)?.toDate()
                          | date:'short'
                      }}
                    </time>
                  </div>

                  <p class="participant">
                    {{
                      conversation.ownerUid === currentUid
                        ? 'You reported this item'
                        : 'Item owner'
                    }}
                  </p>

                  <p class="last-message">
                    {{ conversation.lastMessage || 'Start a conversation' }}
                  </p>

                  @if (conversation.status === 'verified') {
                    <span class="verified">✓ Ownership verified</span>
                  } @else {
                    <span class="pending">Pending verification</span>
                  }
                </div>

                @if (getUnreadCount(conversation) > 0) {
                  <span class="unread-badge">
                    {{ getUnreadCount(conversation) }}
                  </span>
                }
              </a>
            }
          </section>
        }

      </main>
    </ion-content>
  `,
  styles: [`
    ion-content {
      --background: #f0f2f5;
    }

    .inbox-container {
      max-width: 680px;
      min-height: 100%;
      margin: auto;
      padding: 22px 16px 40px;
      box-sizing: border-box;
    }

    .inbox-header {
      margin-bottom: 22px;
    }

    .back-link {
      color: #2875d0;
      text-decoration: none;
      font-size: 13px;
      font-weight: 700;
    }

    .inbox-header h1 {
      margin: 20px 0 5px;
      color: #172b4d;
      font-size: 27px;
      font-weight: 800;
    }

    .inbox-header p {
      margin: 0;
      color: #8290a3;
      font-size: 13px;
    }

    .inbox-search {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 13px 15px;
      margin-bottom: 24px;
      background: white;
      border: 1px solid #e1e5eb;
      border-radius: 25px;
    }

    .inbox-search input {
      width: 100%;
      border: 0;
      outline: none;
      background: transparent;
      color: #172b4d;
      font-size: 13px;
    }

    .conversation-list h2 {
      margin: 0 0 13px;
      color: #172b4d;
      font-size: 17px;
      font-weight: 800;
    }

    .conversation-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 15px;
      margin-bottom: 10px;
      background: white;
      border: 1px solid #e1e5eb;
      border-radius: 15px;
      text-decoration: none;
      color: inherit;
      transition: background 0.2s;
    }

    .conversation-card:active {
      background: #eaf2ff;
    }

    .avatar {
      width: 48px;
      height: 48px;
      flex-shrink: 0;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: #e4efff;
      font-size: 21px;
    }

    .conversation-info {
      flex: 1;
      min-width: 0;
    }

    .conversation-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }

    .conversation-top h3 {
      overflow: hidden;
      margin: 0;
      color: #172b4d;
      font-size: 14px;
      font-weight: 800;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .conversation-top time {
      flex-shrink: 0;
      color: #9aa5b3;
      font-size: 10px;
    }

    .participant {
      margin: 4px 0;
      color: #2875d0;
      font-size: 10px;
      font-weight: 700;
    }

    .last-message {
      overflow: hidden;
      margin: 0;
      color: #718198;
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .verified,
    .pending {
      display: inline-block;
      margin-top: 7px;
      font-size: 10px;
      font-weight: 700;
    }

    .verified {
      color: #15945b;
    }

    .pending {
      color: #d18b20;
    }

    .unread-badge {
      min-width: 22px;
      height: 22px;
      display: grid;
      place-items: center;
      padding: 0 5px;
      border-radius: 20px;
      background: #2875d0;
      color: white;
      font-size: 11px;
      font-weight: 800;
    }

    .empty-state {
      padding: 45px 20px;
      text-align: center;
      background: white;
      border: 1px solid #e1e5eb;
      border-radius: 16px;
    }

    .empty-icon {
      font-size: 40px;
    }

    .empty-state h2 {
      color: #172b4d;
      font-size: 17px;
    }

    .empty-state p {
      color: #8290a3;
      font-size: 12px;
      line-height: 1.6;
    }

    .error-message {
      padding: 15px;
      color: #d93434;
      background: white;
      border-radius: 12px;
      font-size: 12px;
    }

    ion-button {
      --background: #2875d0;
      --border-radius: 10px;
    }
  `],
})
export class MessagesPage implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly lostItems = inject(LostItemsService);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  conversations: OwnershipConversation[] = [];
  currentUid = '';
  searchText = '';
  isLoading = true;
  errorMessage = '';

  private subscription?: Unsubscribe;

  get filteredConversations(): OwnershipConversation[] {
    const search = this.searchText.trim().toLowerCase();

    return this.conversations.filter((conversation) =>
      `${conversation.itemName} ${conversation.lastMessage || ''}`
        .toLowerCase()
        .includes(search),
    );
  }

  ngOnInit(): void {
    const user = this.auth.currentUser;

    if (!user) {
      this.isLoading = false;
      this.errorMessage = 'Please sign in again.';
      return;
    }

    this.currentUid = user.uid;

    this.subscription =
      this.lostItems.watchConversationsForUser(
        user.uid,
        (conversations) => {
          this.zone.run(() => {
            this.conversations = conversations;
            this.isLoading = false;
            this.cdr.detectChanges();
          });
        },
        (error) => {
          this.zone.run(() => {
            console.error('Inbox error:', error);
            this.errorMessage = 'Could not load your conversations.';
            this.isLoading = false;
            this.cdr.detectChanges();
          });
        },
      );
  }

  ngOnDestroy(): void {
    this.subscription?.();
  }

  getUnreadCount(conversation: OwnershipConversation): number {
    return conversation.ownerUid === this.currentUid
      ? conversation.ownerUnread || 0
      : conversation.requesterUnread || 0;
  }

  onSearch(event: Event): void {
    this.searchText = (event.target as HTMLInputElement).value;
  }
}
