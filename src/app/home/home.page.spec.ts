import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Timestamp } from 'firebase/firestore';
import { BehaviorSubject } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { HapticsFeedbackService } from '../haptics-feedback.service';
import type { StudentProfile } from '../auth/auth.service';
import { LostItemsService } from '../lost-items/lost-items.service';
import type { LostItem } from '../lost-items/lost-items.service';

import { HomePage } from './home.page';

describe('HomePage', () => {
  const signedInUser = {
    uid: 'student-uid',
    email: 'student@example.edu',
    displayName: 'Test Student',
  };
  const userSubject = new BehaviorSubject<typeof signedInUser | null>(
    signedInUser,
  );
  const feedUnsubscribe = vi.fn();
  const hapticsStub = {
    success: vi.fn().mockResolvedValue(undefined),
  };
  const authStub = {
    currentUser: signedInUser as typeof signedInUser | null,
    user$: userSubject.asObservable(),
    ensureAuthenticated: vi.fn().mockResolvedValue(true),
    loadProfile: vi.fn<(uid?: string) => Promise<StudentProfile | null>>(
      (uid = 'student-uid') =>
        Promise.resolve({
          uid,
          fullName:
            uid === 'another-student-uid' ? 'Account B Name' : 'Test Student',
          studentId: 'TEST-001',
          email: 'student@example.edu',
          role: 'student',
        }),
    ),
    logout: vi.fn().mockResolvedValue(undefined),
  };
  const lostItemsStub = {
    watchOpenItems: vi.fn((onItems: (items: LostItem[]) => void) => {
      onItems([]);
      return feedUnsubscribe;
    }),
    getConversationsForUser: vi.fn().mockResolvedValue([]),
    requestOwnership: vi.fn(),
  };

  beforeEach(async () => {
    authStub.currentUser = signedInUser;
    userSubject.next(signedInUser);
    authStub.ensureAuthenticated.mockReset().mockResolvedValue(true);
    authStub.loadProfile.mockClear();
    authStub.logout.mockReset().mockResolvedValue(undefined);
    hapticsStub.success.mockReset().mockResolvedValue(undefined);
    feedUnsubscribe.mockClear();
    lostItemsStub.watchOpenItems.mockClear();
    lostItemsStub.getConversationsForUser.mockClear();
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
        { provide: HapticsFeedbackService, useValue: hapticsStub },
        { provide: LostItemsService, useValue: lostItemsStub },
      ],
    }).compileComponents();
  });

  it('loads the signed-in student profile and real item feed', async () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    await fixture.componentInstance.ionViewWillEnter();

    expect(fixture.componentInstance.displayName).toBe('Test Student');
    expect(authStub.ensureAuthenticated).toHaveBeenCalledOnce();
    expect(lostItemsStub.watchOpenItems).toHaveBeenCalledOnce();
    expect(lostItemsStub.getConversationsForUser).toHaveBeenCalledWith('student-uid');
  });

  it('waits for Firebase authentication before starting the feed listener', async () => {
    let finishAuthentication!: (authenticated: boolean) => void;
    authStub.ensureAuthenticated.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishAuthentication = resolve;
        }),
    );

    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    const initialization = fixture.componentInstance.ionViewWillEnter();

    expect(lostItemsStub.watchOpenItems).not.toHaveBeenCalled();

    finishAuthentication(true);
    await initialization;

    expect(lostItemsStub.watchOpenItems).toHaveBeenCalledOnce();
  });

  it('does not start the feed when Firebase has no authenticated user', async () => {
    authStub.currentUser = null;
    userSubject.next(null);
    authStub.ensureAuthenticated.mockResolvedValue(false);

    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    await fixture.componentInstance.ionViewWillEnter();

    expect(lostItemsStub.watchOpenItems).not.toHaveBeenCalled();
  });

  it('stops the feed on sign-out and starts it once for the next account', async () => {
    const fixture = TestBed.createComponent(HomePage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    await page.ionViewWillEnter();

    expect(lostItemsStub.watchOpenItems).toHaveBeenCalledOnce();

    authStub.currentUser = null;
    userSubject.next(null);

    expect(feedUnsubscribe).toHaveBeenCalledOnce();

    const nextUser = {
      uid: 'another-student-uid',
      email: 'another@example.edu',
      displayName: 'Another Student',
    };
    authStub.currentUser = nextUser;
    userSubject.next(nextUser);

    expect(lostItemsStub.watchOpenItems).toHaveBeenCalledTimes(2);

    page.ionViewWillLeave();
    expect(feedUnsubscribe).toHaveBeenCalledTimes(2);
  });

  it('displays the profile associated with the newly signed-in account UID', async () => {
    const fixture = TestBed.createComponent(HomePage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    await page.ionViewWillEnter();

    const nextUser = {
      uid: 'another-student-uid',
      email: 'another@example.edu',
      displayName: 'Different Auth Display Name',
    };
    authStub.currentUser = nextUser;
    userSubject.next(nextUser);

    await vi.waitFor(() => {
      expect(page.displayName).toBe('Account B Name');
    });
    expect(authStub.loadProfile).toHaveBeenCalledWith(nextUser.uid);
  });

  it('does not retain the previous name when the current account has no profile', async () => {
    const fixture = TestBed.createComponent(HomePage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    await page.ionViewWillEnter();

    authStub.loadProfile.mockImplementation((uid = 'student-uid') =>
      Promise.resolve(
        uid === 'another-student-uid'
          ? null
          : {
              uid,
              fullName: 'Test Student',
              studentId: 'TEST-001',
              email: 'student@example.edu',
              role: 'student' as const,
            },
      ),
    );

    const nextUser = {
      uid: 'another-student-uid',
      email: 'another@example.edu',
      displayName: 'Different Auth Display Name',
    };
    authStub.currentUser = nextUser;
    userSubject.next(nextUser);

    await vi.waitFor(() => {
      expect(page.profileErrorMessage).toContain('profile could not be found');
    });
    expect(page.displayName).toBe('Student');
  });

  it('vibrates only after an ownership request succeeds', async () => {
    const fixture = TestBed.createComponent(HomePage);
    const page = fixture.componentInstance;
    const order: string[] = [];
    fixture.detectChanges();

    lostItemsStub.requestOwnership.mockImplementation(async () => {
      order.push('firestore');
      return 'conversation-id';
    });
    hapticsStub.success.mockImplementation(async () => {
      order.push('haptics');
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await page.requestItem({
      id: 'item-id',
      ownerUid: 'owner-uid',
      ownerName: 'Owner',
      itemName: 'Wallet',
      description: 'Black wallet',
      lastSeenLocation: 'Library',
      lastSeenAt: Timestamp.fromDate(new Date()),
      status: 'lost',
    });

    expect(order).toEqual(['firestore', 'haptics']);
  });

  it('does not vibrate when an ownership request fails', async () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    lostItemsStub.requestOwnership.mockRejectedValueOnce(
      new Error('Firestore request failed'),
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await fixture.componentInstance.requestItem({
      id: 'item-id',
      ownerUid: 'owner-uid',
      ownerName: 'Owner',
      itemName: 'Wallet',
      description: 'Black wallet',
      lastSeenLocation: 'Library',
      lastSeenAt: Timestamp.fromDate(new Date()),
      status: 'lost',
    });

    expect(hapticsStub.success).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('stops the feed before logout and restarts it if logout fails', async () => {
    const fixture = TestBed.createComponent(HomePage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    await page.ionViewWillEnter();

    authStub.logout.mockImplementation(async () => {
      expect(feedUnsubscribe).toHaveBeenCalledOnce();
      throw new Error('Sign out failed');
    });

    await page.logout();

    expect(lostItemsStub.watchOpenItems).toHaveBeenCalledTimes(2);
    expect(page.errorMessage).toBe('');
    expect(page.actionError).toBe('Could not sign out. Please try again.');
  });

  it('unsubscribes while Home is cached and restarts only on re-entry', async () => {
    const fixture = TestBed.createComponent(HomePage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    await page.ionViewWillEnter();

    page.ionViewWillLeave();
    expect(feedUnsubscribe).toHaveBeenCalledOnce();
    expect(lostItemsStub.watchOpenItems).toHaveBeenCalledOnce();

    await page.ionViewWillEnter();
    expect(lostItemsStub.watchOpenItems).toHaveBeenCalledTimes(2);
  });

  it('shows the empty-feed message and zero unread badge', async () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'No lost items yet. Be the first to report one!',
    );
    expect(
      fixture.nativeElement.querySelector('.unread-count')?.textContent.trim(),
    ).toBe('0');
  });

  it('filters reports by item details and location', () => {
    const fixture = TestBed.createComponent(HomePage);
    const page = fixture.componentInstance;
    page.items = [
      {
        id: 'item-1',
        ownerUid: 'owner-1',
        ownerName: 'Campus Student',
        itemName: 'Blue Backpack',
        description: 'Contains notebooks',
        lastSeenLocation: 'Main Library',
        lastSeenAt: Timestamp.fromDate(new Date('2026-11-09T08:00:00Z')),
        status: 'lost',
      },
    ];

    page.searchText = 'library';
    expect(page.filteredItems).toHaveLength(1);
    page.searchText = 'wallet';
    expect(page.filteredItems).toHaveLength(0);
  });
});
