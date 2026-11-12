
import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  inject,
  NgZone,
} from '@angular/core';
import type { OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonSpinner,
  IonIcon,
} from '@ionic/angular';
import type { Unsubscribe } from 'firebase/firestore';

import { AuthService } from '../auth/auth.service';

import {
  LostItemsService,
  type LostItem,
  type LostItemMessage,
  type OwnershipConversation,
} from './lost-items.service';

import { addIcons } from 'ionicons';
import { imageOutline, closeCircle } from 'ionicons/icons';

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : undefined;
  }

  return undefined;
}

function getErrorStage(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'stage' in error) {
    return typeof error.stage === 'string' ? error.stage : undefined;
  }

  return undefined;
}

@Component({
  selector: 'app-item-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonButton,
    IonContent,
    IonSpinner,
    IonIcon,
    RouterLink,
  ],
  template: `
    <ion-content [fullscreen]="true">
      <main class="chat-container">
        <a routerLink="/home" class="back-link">← Back to lost items</a>

        @if (isLoading) {
          <p class="notice">Loading private conversation...</p>
        } @else if (errorMessage && !conversation) {
          <p class="error-message" role="alert">{{ errorMessage }}</p>
        } @else if (conversation && item) {
          <section class="item-summary">
            <h1>{{ item.itemName }}</h1>
            <p>
              <strong>{{ item.ownerName }}</strong>
              <span aria-hidden="true"> · </span>
              {{ item.lastSeenLocation }}
            </p>
          </section>

          <section class="verification-note">
            @if (conversation.status === 'pending') {
              <p>
                Ownership is unverified. Discuss identifying details privately.
                Only the item owner can manually confirm a match.
              </p>
            } @else {
              <p>Ownership was manually verified by the item owner.</p>
            }
          </section>

          <section class="messages" aria-label="Private messages">
            @if (isLoadingMessages) {
              <div class="inline-loading" role="status">
                <ion-spinner name="crescent"></ion-spinner>
                <span>Loading messages...</span>
              </div>
            } @else if (messages.length === 0) {
              <p class="empty-state">
                No messages yet. Start a private conversation below.
              </p>
            } @else {
              @for (message of messages; track message.id) {
                <article
                  class="message"
                  [class.own-message]="message.senderUid === currentUid"
                >
                  @if (message.text) {
                    <p>{{ message.text }}</p>
                  }

                  @if (message.photoUrl) {
                    <img
                      [src]="message.photoUrl"
                      alt="Photo shared in this private conversation"
                    />
                  }
                </article>
              }
            }
          </section>

          <form class="compose" (ngSubmit)="sendMessage()">
            <textarea
              name="messageText"
              [(ngModel)]="messageText"
              placeholder="Ask or answer an identifying question"
              aria-label="Message"
              rows="2"
              [disabled]="isSending"
            ></textarea>

            <div class="compose-actions">
              <div class="chat-attachment">
                <input
                  #chatPhotoInput
                  type="file"
                  accept="image/*"
                  hidden
                  [disabled]="isSending"
                  (change)="selectPhoto($event)"
                />

                <button
                  type="button"
                  class="chat-photo-button"
                  aria-label="Attach photo from gallery"
                  [disabled]="isSending"
                  (click)="chatPhotoInput.click()"
                >
                  <ion-icon name="image-outline"></ion-icon>
                </button>

                @if (photoPreviewUrl) {
                  <div class="chat-photo-preview">
                    <img
                      [src]="photoPreviewUrl"
                      alt="Selected attachment"
                    />
                    <button
                      type="button"
                      class="remove-chat-photo"
                      aria-label="Remove selected photo"
                      [disabled]="isSending"
                      (click)="clearSelectedPhoto()"
                    >
                      <ion-icon name="close-circle"></ion-icon>
                    </button>
                  </div>
                }
              </div>

              <ion-button
                class="send-button"
                type="submit"
                [disabled]="isSending"
              >
                {{ isSending ? 'Sending...' : 'Send' }}
              </ion-button>
            </div>
          </form>

          @if (errorMessage) {
            <p class="error-message" role="alert">{{ errorMessage }}</p>
          }

          @if (isOwner && conversation.status === 'pending') {
            <ion-button
              expand="block"
              (click)="verifyOwnership()"
              [disabled]="isUpdating"
            >
              {{ isUpdating ? 'Verifying...' : 'Confirm requester owns this item' }}
            </ion-button>
          }

          @if (
            isOwner &&
            conversation.status === 'verified' &&
            item.status !== 'returned'
          ) {
            <ion-button
              expand="block"
              (click)="markReturned()"
              [disabled]="isUpdating"
            >
              {{ isUpdating ? 'Updating...' : 'Mark item as returned' }}
            </ion-button>
          }

          @if (conversation.status === 'verified') {
            <p class="notice">
              Ownership is verified. Agree on a safe meetup in chat before
              opening the map.
            </p>

            <a
              class="map-link"
              [href]="mapUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open map for meetup
            </a>
          }
        }
      </main>
    </ion-content>
  `,
  styles: [
    `
      ion-content {
        --background: #f4f7fc;
      }

      .chat-container {
        max-width: 700px;
        margin: auto;
        padding: 24px 20px 40px;
      }

      .back-link,
      .map-link {
        color: #2368c7;
        text-decoration: none;
        font-size: 13px;
        font-weight: 700;
      }

      .item-summary,
      .verification-note,
      .messages {
        margin-top: 12px;
        padding: 12px 14px;
        border: 1px solid #e9eef6;
        border-radius: 14px;
        background: white;
      }

      .item-summary {
        display: grid;
        gap: 4px;
      }

      h1 {
        margin: 0;
        color: #172b4d;
        font-size: 19px;
      }

      .item-summary p {
        margin: 0;
        color: #52657e;
        font-size: 12px;
        line-height: 1.4;
      }

      .item-summary strong {
        color: #263c5b;
      }

      .notice,
      .verification-note p {
        color: #718096;
        font-size: 12px;
      }

      .verification-note p {
        margin: 0;
      }

      .messages {
        display: flex;
        min-height: 56px;
        max-height: min(42vh, 360px);
        flex-direction: column;
        gap: 8px;
        overflow-y: auto;
      }

      .empty-state {
        margin: 0;
        padding: 4px 0;
        color: #718096;
        font-size: 12px;
        text-align: center;
      }

      .inline-loading {
        display: flex;
        min-height: 32px;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: #718096;
        font-size: 12px;
      }

      .inline-loading ion-spinner {
        width: 18px;
        height: 18px;
        color: #2368c7;
      }

      .message {
        width: fit-content;
        max-width: 82%;
        margin: 8px 0;
        padding: 10px 12px;
        border-radius: 12px;
        background: #f0f4fa;
        overflow-wrap: anywhere;
      }

      .message p {
        margin: 0;
        font-size: 13px;
        color: #263c5b;
      }

      .message img {
        display: block;
        max-width: 220px;
        max-height: 220px;
        margin-top: 6px;
        border-radius: 8px;
      }

      .own-message {
        margin-left: auto;
        background: #e1efff;
      }

      .compose {
        position: sticky;
        bottom: 0;
        z-index: 2;
        display: grid;
        gap: 8px;
        margin: 12px 0 20px;
        padding: 10px;
        border: 1px solid #e4eaf2;
        border-radius: 16px;
        background: #fff;
        box-shadow: 0 4px 16px rgba(30, 60, 100, 0.06);
      }

      .compose textarea {
        box-sizing: border-box;
        width: 100%;
        min-height: 48px;
        padding: 10px;
        border: none;
        border-radius: 10px;
        outline: none;
        background: #f8faff;
        color: #172b4d;
        font: inherit;
        font-size: 14px;
        line-height: 1.4;
        resize: vertical;
      }

      .compose textarea::placeholder {
        color: #718096;
        opacity: 1;
      }

      .compose textarea:focus {
        box-shadow: 0 0 0 2px rgb(35 104 199 / 15%);
      }

      .compose-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .chat-attachment {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .chat-photo-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: #00c985;
        font-size: 26px;
        cursor: pointer;
      }

      .chat-photo-button:active {
        background: #e6fff5;
      }

      .chat-photo-button:disabled {
        opacity: 0.5;
      }

      .chat-photo-preview {
        position: relative;
        width: 65px;
        height: 65px;
      }

      .chat-photo-preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 10px;
      }

      .remove-chat-photo {
        position: absolute;
        top: -8px;
        right: -8px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: white;
        color: #e34b4b;
        font-size: 21px;
      }

      .send-button {
        --background: #2368c7;
        --border-radius: 22px;
        min-width: 80px;
        height: 38px;
        margin: 0;
        font-weight: 700;
      }

      .error-message {
        color: #d93434;
        font-size: 12px;
      }

      ion-button:not(.send-button) {
        --background: #2368c7;
        --border-radius: 11px;
      }

      .map-link {
        display: inline-block;
        margin-top: 8px;
      }
    `,
  ],
})
export class ItemChatPage implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly lostItems = inject(LostItemsService);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  constructor() {
    addIcons({
      'image-outline': imageOutline,
      'close-circle': closeCircle,
    });

    void this.loadConversation();
  }

  conversation: OwnershipConversation | null = null;
  item: LostItem | null = null;
  messages: LostItemMessage[] = [];

  currentUid = '';
  messageText = '';
  photo: File | null = null;
  photoPreviewUrl: string | null = null;

  isLoadingMessages = true;
  isLoading = true;
  isSending = false;
  isUpdating = false;
  errorMessage = '';

  private messagesSubscription?: Unsubscribe;
  private conversationSubscription?: Unsubscribe;
  private itemSubscription?: Unsubscribe;

  get isOwner(): boolean {
    return this.conversation?.ownerUid === this.currentUid;
  }

  get mapUrl(): string {
    const location = encodeURIComponent(
      this.item?.lastSeenLocation ?? '',
    );

    return `https://www.google.com/maps/search/?api=1&query=${location}`;
  }

  private refreshView(): void {
    this.ngZone.run(() => {
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy(): void {
    this.messagesSubscription?.();
    this.conversationSubscription?.();
    this.itemSubscription?.();

    if (this.photoPreviewUrl) {
      URL.revokeObjectURL(this.photoPreviewUrl);
    }
  }

  selectPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (
      file &&
      (!file.type.startsWith('image/') ||
        file.size > 5 * 1024 * 1024)
    ) {
      this.clearSelectedPhoto();
      this.errorMessage = 'Choose an image no larger than 5 MB.';
      input.value = '';
      this.refreshView();
      return;
    }

    if (this.photoPreviewUrl) {
      URL.revokeObjectURL(this.photoPreviewUrl);
    }

    this.errorMessage = '';
    this.photo = file;
    this.photoPreviewUrl = file
      ? URL.createObjectURL(file)
      : null;

    this.refreshView();
  }

  clearSelectedPhoto(): void {
    if (this.photoPreviewUrl) {
      URL.revokeObjectURL(this.photoPreviewUrl);
    }

    this.photo = null;
    this.photoPreviewUrl = null;

    const input = document.querySelector(
      '.chat-attachment input[type="file"]',
    ) as HTMLInputElement | null;

    if (input) {
      input.value = '';
    }
  }

  private async loadConversation(): Promise<void> {
    this.currentUid = this.authService.currentUser?.uid ?? '';

    const conversationId =
      this.route.snapshot.paramMap.get('conversationId');

    if (!conversationId || !this.currentUid) {
      this.errorMessage =
        'This private conversation could not be opened.';
      this.isLoading = false;
      this.refreshView();
      return;
    }

    try {
      const conversation =
        await this.lostItems.getConversation(conversationId);

      if (
        !conversation ||
        (conversation.ownerUid !== this.currentUid &&
          conversation.requesterUid !== this.currentUid)
      ) {
        this.errorMessage =
          'You are not a participant in this conversation.';
        return;
      }

      this.conversation = conversation;
      this.item = await this.lostItems.getItem(conversation.itemId);

      if (!this.item) {
        this.errorMessage =
          'The reported item could not be found.';
        return;
      }

      this.conversationSubscription =
        this.lostItems.watchConversation(
          conversationId,
          (updatedConversation) =>
            this.ngZone.run(() => {
              if (updatedConversation) {
                this.conversation = updatedConversation;
              }

              this.cdr.detectChanges();
            }),
          (error) =>
            this.handleLiveReadError(error, 'conversation'),
        );

      this.itemSubscription = this.lostItems.watchItem(
        this.item.id,
        (updatedItem) =>
          this.ngZone.run(() => {
            if (updatedItem) {
              this.item = updatedItem;
            }

            this.cdr.detectChanges();
          }),
        (error) => this.handleLiveReadError(error, 'item'),
      );

      this.messagesSubscription = this.lostItems.watchMessages(
        conversationId,
        (updatedMessages) =>
          this.ngZone.run(() => {
            this.messages = updatedMessages;
            this.isLoadingMessages = false;
            this.cdr.detectChanges();
          }),
        (error) =>
          this.handleLiveReadError(error, 'private messages'),
      );
    } catch (error: unknown) {
      const code = getErrorCode(error);

      console.error('Private conversation could not be loaded:', {
        code: code ?? 'unknown',
        message:
          error instanceof Error ? error.message : String(error),
      });

      this.errorMessage =
        code === 'permission-denied'
          ? 'Firestore rules denied access. Only the owner and requester can open this conversation.'
          : `Could not load this conversation${code ? ` (${code})` : ''}.`;
    } finally {
      this.isLoading = false;
      this.refreshView();
    }
  }

  private handleLiveReadError(
    error: Error,
    resource: string,
  ): void {
    const code = getErrorCode(error);

    console.error(`Could not refresh ${resource}:`, {
      code: code ?? 'unknown',
      message: error.message,
    });

    this.ngZone.run(() => {
      if (resource === 'private messages') {
        this.isLoadingMessages = false;
      }

      this.errorMessage =
        code === 'permission-denied'
          ? 'Firestore rules denied access to this private conversation.'
          : `Could not refresh ${resource}${code ? ` (${code})` : ''}.`;

      this.cdr.detectChanges();
    });
  }

  async sendMessage(): Promise<void> {
    if (this.isSending || !this.conversation) {
      return;
    }

    const user = this.authService.currentUser;
    const conversation = this.conversation;

    if (
      !user ||
      user.uid !== this.currentUid ||
      (user.uid !== conversation.ownerUid &&
        user.uid !== conversation.requesterUid)
    ) {
      this.errorMessage =
        'Your signed-in account is not a participant in this conversation. Sign in again to send a message.';
      this.refreshView();
      return;
    }

    const text = this.messageText.trim();
    const selectedPhoto = this.photo;

    if (!text && !selectedPhoto) {
      this.errorMessage =
        'Enter a message or attach a photo.';
      this.refreshView();
      return;
    }

    const conversationId = conversation.id;

    this.ngZone.run(() => {
      this.isSending = true;
      this.errorMessage = '';
      this.cdr.detectChanges();
    });

    try {
      console.info('[Chat] Sending message', {
        conversationId,
        uid: user.uid,
        hasPhoto: Boolean(selectedPhoto),
      });

      await this.lostItems.sendMessage(
        conversationId,
        text,
        selectedPhoto ?? undefined,
      );

      this.ngZone.run(() => {
        this.messageText = '';
        this.clearSelectedPhoto();
        this.errorMessage = '';
        this.cdr.detectChanges();
      });

      console.info('[Chat] Message acknowledged by Firebase', {
        conversationId,
        uid: user.uid,
      });
    } catch (error: unknown) {
      const code = getErrorCode(error);
      const stage = getErrorStage(error);

      console.error('[Chat] Message sending failed:', {
        code: code ?? 'unknown',
        stage: stage ?? 'unknown',
        message:
          error instanceof Error ? error.message : String(error),
        conversationId,
        uid: user.uid,
      });

      this.ngZone.run(() => {
        if (stage === 'image-upload') {
          this.errorMessage =
            `Photo upload failed${code ? ` (${code})` : ''}. Your message and selected photo are preserved.`;
        } else if (stage === 'download-url') {
          this.errorMessage =
            'The photo uploaded, but its URL could not be retrieved.';
        } else if (code === 'permission-denied') {
          this.errorMessage =
            'Firestore denied this message. Check your conversation permissions.';
        } else {
          this.errorMessage =
            `Could not send this message${code ? ` (${code})` : ''}. Your message and photo are preserved.`;
        }

        this.cdr.detectChanges();
      });
    } finally {
      this.ngZone.run(() => {
        this.isSending = false;
        this.cdr.detectChanges();
      });
    }
  }

  async verifyOwnership(): Promise<void> {
    if (
      !this.conversation ||
      !this.isOwner ||
      this.conversation.status !== 'pending'
    ) {
      return;
    }

    if (
      !window.confirm(
        'Have you manually verified the item using identifying details in this private chat?',
      )
    ) {
      return;
    }

    this.isUpdating = true;
    this.errorMessage = '';
    this.refreshView();

    try {
      await this.lostItems.verifyOwnership(
        this.conversation.id,
      );

      this.conversation = {
        ...this.conversation,
        status: 'verified',
      };
    } catch (error: unknown) {
      const code = getErrorCode(error);

      console.error('Ownership verification failed:', {
        code: code ?? 'unknown',
      });

      this.errorMessage =
        `Could not verify ownership${code ? ` (${code})` : ''}. Only the reporting owner may confirm it.`;
    } finally {
      this.isUpdating = false;
      this.refreshView();
    }
  }

  async markReturned(): Promise<void> {
    if (
      !this.conversation ||
      !this.item ||
      !this.isOwner ||
      this.conversation.status !== 'verified' ||
      this.item.status === 'returned'
    ) {
      return;
    }

    this.isUpdating = true;
    this.errorMessage = '';
    this.refreshView();

    try {
      await this.lostItems.markReturned(
        this.item.id,
        this.conversation.id,
      );

      this.item = {
        ...this.item,
        status: 'returned',
      };
    } catch (error: unknown) {
      const code = getErrorCode(error);

      console.error('Item could not be marked returned:', {
        code: code ?? 'unknown',
      });

      this.errorMessage =
        `Could not mark the item as returned${code ? ` (${code})` : ''}. Verify ownership first.`;
    } finally {
      this.isUpdating = false;
      this.refreshView();
    }
  }
}
