
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonInput,
  IonTextarea,
  IonIcon,
} from '@ionic/angular';
import { Timestamp } from 'firebase/firestore';

import { AuthService } from '../auth/auth.service';
import { LostItemsService } from './lost-items.service';

import { addIcons } from 'ionicons';
import { imageOutline, closeCircle } from 'ionicons/icons';

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : undefined;
  }
  return undefined;
}

@Component({
  selector: 'app-report-lost-item',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonButton,
    IonContent,
    IonInput,
    IonTextarea,
    IonIcon,
    RouterLink,
  ],
  template: `
    <ion-content [fullscreen]="true">
      <main class="report-container">
        <a routerLink="/home" class="back-link">← Back to lost items</a>

        <section class="report-card">
          <h1>Report a Lost Item</h1>
          <p>Share enough details to help its finder identify and return it.</p>

          <form (ngSubmit)="submitReport()">
            <label for="item-name">Item name</label>
            <ion-input
              id="item-name"
              name="itemName"
              [(ngModel)]="itemName"
              required
              placeholder="e.g. Blue backpack"
              fill="outline"
            ></ion-input>

            <label for="item-description">Description</label>
            <ion-textarea
              id="item-description"
              name="description"
              [(ngModel)]="description"
              required
              rows="4"
              placeholder="Describe identifying details"
              fill="outline"
            ></ion-textarea>

            <label for="last-seen-location">Last seen location</label>
            <ion-input
              id="last-seen-location"
              name="location"
              [(ngModel)]="lastSeenLocation"
              required
              placeholder="Building, room, or area"
              fill="outline"
            ></ion-input>

            <label for="last-seen-at">Date and time last seen</label>
            <input
              id="last-seen-at"
              class="native-input"
              type="datetime-local"
              name="lastSeenAt"
              [(ngModel)]="lastSeenAt"
              required
            />

            <label>Photo (optional, up to 5 MB)</label>

            <div class="photo-upload">
              <input
                #photoInput
                id="item-photo"
                type="file"
                accept="image/*"
                hidden
                (change)="selectPhoto($event)"
              />

              <button
                type="button"
                class="photo-icon-button"
                aria-label="Choose photo from gallery"
                (click)="photoInput.click()"
              >
                <ion-icon name="image-outline"></ion-icon>
              </button>

              @if (photoPreviewUrl) {
                <div class="photo-preview">
                  <img
                    [src]="photoPreviewUrl"
                    alt="Selected lost item photo"
                  />
                  <button
                    type="button"
                    class="remove-photo"
                    aria-label="Remove selected photo"
                    (click)="clearPhoto()"
                  >
                    <ion-icon name="close-circle"></ion-icon>
                  </button>
                </div>
              }
            </div>

            @if (errorMessage) {
              <p class="error-message" role="alert">
                {{ errorMessage }}
              </p>
            }

            @if (successMessage) {
              <p class="success-message" role="status">
                {{ successMessage }}
              </p>
            }

            <ion-button
              expand="block"
              type="submit"
              [disabled]="isLoading"
            >
              {{ isLoading ? 'Submitting Report...' : 'Submit Lost Item' }}
            </ion-button>
          </form>
        </section>
      </main>
    </ion-content>
  `,
  styles: [
    `
      ion-content {
        --background: #f4f7fc;
      }

      .report-container {
        max-width: 620px;
        margin: auto;
        padding: 24px 20px 40px;
      }

      .back-link {
        color: #2368c7;
        text-decoration: none;
        font-size: 13px;
        font-weight: 700;
      }

      .report-card {
        margin-top: 20px;
        padding: 24px 20px;
        border-radius: 20px;
        background: #fff;
        box-shadow: 0 8px 30px rgba(30, 60, 100, 0.07);
      }

      h1 {
        margin: 0 0 8px;
        color: #172b4d;
        font-size: 23px;
      }

      .report-card > p {
        color: #8190a5;
        font-size: 12px;
      }

      label {
        display: block;
        margin: 16px 0 7px;
        color: #263c5b;
        font-size: 12px;
        font-weight: 700;
      }

      ion-input,
      ion-textarea,
      .native-input {
        width: 100%;
        --background: #f8faff;
        --border-color: #dce5f1;
        --border-radius: 10px;
      }

      .native-input {
        box-sizing: border-box;
        padding: 12px;
        border: 1px solid #dce5f1;
        border-radius: 10px;
        color: #263c5b;
      }

      .photo-upload {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-top: 8px;
      }

      .photo-icon-button {
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
        font-size: 25px;
        cursor: pointer;
      }

      .photo-icon-button:active {
        background: #e6fff5;
      }

      .photo-preview {
        position: relative;
        width: 110px;
        height: 110px;
      }

      .photo-preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 12px;
      }

      .remove-photo {
        position: absolute;
        top: -8px;
        right: -8px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: white;
        color: #e34b4b;
        font-size: 22px;
      }

      ion-button {
        --background: #2368c7;
        --border-radius: 11px;
        height: 48px;
        margin-top: 20px;
        font-weight: 800;
      }

      .error-message {
        color: #d93434;
        font-size: 12px;
      }

      .success-message {
        color: #22945a;
        font-size: 12px;
      }
    `,
  ],
})
export class ReportLostItemPage {
  private readonly authService = inject(AuthService);
  private readonly lostItems = inject(LostItemsService);
  private readonly router = inject(Router);

  constructor() {
  addIcons({
    'image-outline': imageOutline,
    'close-circle': closeCircle,
  });
}

  itemName = '';
  description = '';
  lastSeenLocation = '';
  lastSeenAt = '';

  photo: File | null = null;
  photoPreviewUrl: string | null = null;

  isLoading = false;
  errorMessage = '';
  successMessage = '';

  selectPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    this.errorMessage = '';

    if (file && !file.type.startsWith('image/')) {
      this.clearPhoto();
      this.errorMessage = 'Please select an image file.';
      input.value = '';
      return;
    }

    if (file && file.size > 5 * 1024 * 1024) {
      this.clearPhoto();
      this.errorMessage = 'The photo must be 5 MB or smaller.';
      input.value = '';
      return;
    }

    if (this.photoPreviewUrl) {
      URL.revokeObjectURL(this.photoPreviewUrl);
    }

    this.photo = file;
    this.photoPreviewUrl = file ? URL.createObjectURL(file) : null;
  }

  clearPhoto(): void {
    if (this.photoPreviewUrl) {
      URL.revokeObjectURL(this.photoPreviewUrl);
    }

    this.photo = null;
    this.photoPreviewUrl = null;

    const input = document.getElementById(
      'item-photo',
    ) as HTMLInputElement | null;

    if (input) {
      input.value = '';
    }
  }

  async submitReport(): Promise<void> {
    if (this.isLoading) return;

    this.errorMessage = '';
    this.successMessage = '';

    const user = this.authService.currentUser;

    if (!user) {
      this.errorMessage =
        'Your sign-in session has expired. Sign in and try again.';
      return;
    }

    const itemName = this.itemName.trim();
    const description = this.description.trim();
    const lastSeenLocation = this.lastSeenLocation.trim();
    const lastSeenDate = new Date(this.lastSeenAt);

    if (
      !itemName ||
      !description ||
      !lastSeenLocation ||
      !this.lastSeenAt ||
      Number.isNaN(lastSeenDate.getTime())
    ) {
      this.errorMessage =
        'Complete all required fields with a valid date and time.';
      return;
    }

    this.isLoading = true;

    try {
      const profile = await this.authService.loadProfile(user.uid);

      if (!profile) {
        this.errorMessage =
          'Your student profile could not be found. Complete registration before reporting an item.';
        return;
      }

      await this.lostItems.createLostItem(
        {
          ownerUid: user.uid,
          ownerName: profile.fullName,
          itemName,
          description,
          lastSeenLocation,
          lastSeenAt: Timestamp.fromDate(lastSeenDate),
        },
        this.photo ?? undefined,
      );

      this.successMessage = 'Your lost item report was published.';
      this.clearPhoto();

      await this.router.navigate(['/home']);
    } catch (error: unknown) {
      const code = getErrorCode(error);

      console.error('Lost item report failed:', {
        code: code ?? 'unknown',
      });

      this.errorMessage =
        code === 'permission-denied'
          ? 'Firestore rules denied this report. Confirm that signed-in students may create their own lost-item listings.'
          : code === 'storage/unauthorized'
            ? 'Firebase Storage denied the photo upload. Check the Storage rules, or remove the photo and submit again.'
            : `Could not submit the report${code ? ` (${code})` : ''}. Check your connection and Firebase settings.`;
    } finally {
      this.isLoading = false;
    }
  }
}
