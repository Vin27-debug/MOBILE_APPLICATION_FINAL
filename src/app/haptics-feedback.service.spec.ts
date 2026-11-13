import { Capacitor } from '@capacitor/core';

const hapticsMocks = vi.hoisted(() => ({
  notification: vi.fn(),
}));

vi.mock('@capacitor/haptics', () => ({
  Haptics: { notification: hapticsMocks.notification },
  NotificationType: { Success: 'SUCCESS' },
}));

import { HapticsFeedbackService } from './haptics-feedback.service';

describe('HapticsFeedbackService', () => {
  beforeEach(() => {
    hapticsMocks.notification.mockReset().mockResolvedValue(undefined);
  });

  it('skips feedback when the plugin is unavailable', async () => {
    vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(false);
    const service = new HapticsFeedbackService();

    await service.success();

    expect(hapticsMocks.notification).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('does not fail the completed operation if haptics are unsupported', async () => {
    vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true);
    hapticsMocks.notification.mockRejectedValue(
      new Error('Haptics unavailable'),
    );
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const service = new HapticsFeedbackService();

    await expect(service.success()).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });
});
