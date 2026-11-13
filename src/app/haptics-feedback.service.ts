import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Haptics, NotificationType } from '@capacitor/haptics';

@Injectable({ providedIn: 'root' })
export class HapticsFeedbackService {
  async success(): Promise<void> {
    if (!Capacitor.isPluginAvailable('Haptics')) {
      return;
    }

    try {
      await Haptics.notification({ type: NotificationType.Success });
    } catch (error: unknown) {
      console.warn('Success haptic feedback is unavailable:', error);
    }
  }
}
