import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
} from '@angular/router';
import { Timestamp } from 'firebase/firestore';

import { AuthService } from '../auth/auth.service';
import { HapticsFeedbackService } from '../haptics-feedback.service';

import { LostItemsService } from './lost-items.service';
import type {
  LostItem,
  OwnershipConversation,
} from './lost-items.service';
import { ItemChatPage } from './item-chat.page';

describe('ItemChatPage haptics', () => {
  const conversation: OwnershipConversation = {
    id: 'conversation-id',
    itemId: 'item-id',
    itemName: 'Wallet',
    requesterUid: 'requester-uid',
    ownerUid: 'owner-uid',
    status: 'pending',
  };
  const item: LostItem = {
    id: 'item-id',
    ownerUid: 'owner-uid',
    ownerName: 'Owner',
    itemName: 'Wallet',
    description: 'Black wallet',
    lastSeenLocation: 'Library',
    lastSeenAt: Timestamp.fromDate(new Date()),
    status: 'lost',
  };
  const hapticsStub = {
    success: vi.fn().mockResolvedValue(undefined),
  };
  const lostItemsStub = {
    getConversation: vi.fn().mockResolvedValue(conversation),
    getItem: vi.fn().mockResolvedValue(item),
    watchConversation: vi.fn(() => () => undefined),
    watchItem: vi.fn(() => () => undefined),
    watchMessages: vi.fn(() => () => undefined),
    verifyOwnership: vi.fn().mockResolvedValue(undefined),
    markReturned: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    hapticsStub.success.mockReset().mockResolvedValue(undefined);
    lostItemsStub.getConversation.mockReset().mockResolvedValue(conversation);
    lostItemsStub.getItem.mockReset().mockResolvedValue(item);
    lostItemsStub.verifyOwnership.mockReset().mockResolvedValue(undefined);
    lostItemsStub.markReturned.mockReset().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [ItemChatPage],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({
                conversationId: 'conversation-id',
              }),
            },
          },
        },
        {
          provide: AuthService,
          useValue: { currentUser: { uid: 'owner-uid' } },
        },
        { provide: HapticsFeedbackService, useValue: hapticsStub },
        { provide: LostItemsService, useValue: lostItemsStub },
      ],
    }).compileComponents();
  });

  async function createLoadedPage(): Promise<ItemChatPage> {
    const fixture = TestBed.createComponent(ItemChatPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      expect(fixture.componentInstance.item).not.toBeNull();
    });
    return fixture.componentInstance;
  }

  it('vibrates after successful ownership verification', async () => {
    const page = await createLoadedPage();
    const order: string[] = [];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    lostItemsStub.verifyOwnership.mockImplementation(async () => {
      order.push('firestore');
    });
    hapticsStub.success.mockImplementation(async () => {
      order.push('haptics');
    });

    await page.verifyOwnership();

    expect(order).toEqual(['firestore', 'haptics']);
    expect(page.conversation?.status).toBe('verified');
    vi.restoreAllMocks();
  });

  it('does not vibrate when ownership verification fails', async () => {
    const page = await createLoadedPage();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    lostItemsStub.verifyOwnership.mockRejectedValueOnce(
      new Error('Firestore verification failed'),
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await page.verifyOwnership();

    expect(hapticsStub.success).not.toHaveBeenCalled();
    consoleError.mockRestore();
    vi.restoreAllMocks();
  });

  it('vibrates after an item is successfully marked returned', async () => {
    const page = await createLoadedPage();
    page.conversation = { ...conversation, status: 'verified' };
    const order: string[] = [];
    lostItemsStub.markReturned.mockImplementation(async () => {
      order.push('firestore');
    });
    hapticsStub.success.mockImplementation(async () => {
      order.push('haptics');
    });

    await page.markReturned();

    expect(order).toEqual(['firestore', 'haptics']);
    expect(page.item?.status).toBe('returned');
  });

  it('does not vibrate when marking an item returned fails', async () => {
    const page = await createLoadedPage();
    page.conversation = { ...conversation, status: 'verified' };
    lostItemsStub.markReturned.mockRejectedValueOnce(
      new Error('Firestore update failed'),
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await page.markReturned();

    expect(hapticsStub.success).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
