import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Timestamp } from 'firebase/firestore';

import { AuthService } from '../auth/auth.service';
import { LostItemsService } from '../lost-items/lost-items.service';
import type { LostItem } from '../lost-items/lost-items.service';

import { HomePage } from './home.page';

describe('HomePage', () => {
  const authStub = {
    currentUser: {
      uid: 'student-uid',
      email: 'student@example.edu',
      displayName: 'Test Student',
    },
    ensureAuthenticated: vi.fn().mockResolvedValue(true),
    loadProfile: vi.fn().mockResolvedValue({
      uid: 'student-uid',
      fullName: 'Test Student',
      studentId: 'TEST-001',
      email: 'student@example.edu',
      role: 'student',
    }),
    logout: vi.fn().mockResolvedValue(undefined),
  };
  const lostItemsStub = {
    watchOpenItems: vi.fn((onItems: (items: LostItem[]) => void) => {
      onItems([]);
      return () => undefined;
    }),
    getConversationsForUser: vi.fn().mockResolvedValue([]),
    requestOwnership: vi.fn(),
  };

  beforeEach(async () => {
    authStub.ensureAuthenticated.mockReset().mockResolvedValue(true);
    authStub.loadProfile.mockClear();
    lostItemsStub.watchOpenItems.mockClear();
    lostItemsStub.getConversationsForUser.mockClear();
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
        { provide: LostItemsService, useValue: lostItemsStub },
      ],
    }).compileComponents();
  });

  it('loads the signed-in student profile and real item feed', async () => {
    const fixture = TestBed.createComponent(HomePage);
    await fixture.componentInstance.ngOnInit();

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
    const initialization = fixture.componentInstance.ngOnInit();

    expect(lostItemsStub.watchOpenItems).not.toHaveBeenCalled();

    finishAuthentication(true);
    await initialization;

    expect(lostItemsStub.watchOpenItems).toHaveBeenCalledOnce();
  });

  it('shows the empty-feed message and zero unread badge', async () => {
    const fixture = TestBed.createComponent(HomePage);
    await fixture.componentInstance.ngOnInit();
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
