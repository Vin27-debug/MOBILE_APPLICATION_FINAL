import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Capacitor } from '@capacitor/core';

const cameraMocks = vi.hoisted(() => ({
  takePhoto: vi.fn(),
  errorCodes: {
    CameraPermissionDenied: 'OS-PLUG-CAMR-0003',
    NoCameraAvailable: 'OS-PLUG-CAMR-0007',
    TakePhotoCancelled: 'OS-PLUG-CAMR-0006',
  },
}));

vi.mock('@capacitor/camera', () => ({
  Camera: { takePhoto: cameraMocks.takePhoto },
  CameraErrorCode: cameraMocks.errorCodes,
  EncodingType: { JPEG: 0 },
}));

import { AuthService } from '../auth/auth.service';
import { LostItemsService } from './lost-items.service';
import { ReportLostItemPage } from './report-lost-item.page';

describe('ReportLostItemPage camera capture', () => {
  const authStub = {
    currentUser: { uid: 'owner-uid' },
    loadProfile: vi.fn(),
  };
  const lostItemsStub = {
    createLostItem: vi.fn(),
  };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    cameraMocks.takePhoto.mockReset();
    authStub.loadProfile.mockReset();
    lostItemsStub.createLostItem.mockReset();
    vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo-preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await TestBed.configureTestingModule({
      imports: [ReportLostItemPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
        { provide: LostItemsService, useValue: lostItemsStub },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function createPage(): ReportLostItemPage {
    const fixture = TestBed.createComponent(ReportLostItemPage);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('keeps the gallery file input alongside the Take Photo option', () => {
    const fixture = TestBed.createComponent(ReportLostItemPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Take Photo');
    expect(fixture.nativeElement.textContent).toContain('Choose from Gallery');
    expect(
      fixture.nativeElement.querySelector(
        'input[type="file"][accept="image/*"]',
      ),
    ).not.toBeNull();
  });

  it('converts a captured photo to a previewable image File', async () => {
    const page = createPage();
    cameraMocks.takePhoto.mockResolvedValue({
      type: 0,
      webPath: 'capacitor://camera/photo.jpg',
      saved: false,
    });
    const blob = new Blob(['captured photo'], { type: 'image/jpeg' });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => blob,
    });

    await page.takePhoto();

    expect(cameraMocks.takePhoto).toHaveBeenCalledWith(
      expect.objectContaining({ quality: 90, encodingType: 0 }),
    );
    expect(fetchMock).toHaveBeenCalledWith('capacitor://camera/photo.jpg');
    expect(page.photo).toBeInstanceOf(File);
    expect(page.photo?.type).toBe('image/jpeg');
    expect(page.photo?.size).toBe(blob.size);
    expect(page.photoPreviewUrl).toBe('blob:photo-preview');
    expect(page.errorMessage).toBe('');
  });

  it('keeps the existing selection when camera capture is cancelled', async () => {
    const page = createPage();
    const selectedFile = new File(['existing'], 'existing.jpg', {
      type: 'image/jpeg',
    });
    page.photo = selectedFile;
    page.photoPreviewUrl = 'blob:existing-preview';
    cameraMocks.takePhoto.mockRejectedValue({
      code: cameraMocks.errorCodes.TakePhotoCancelled,
    });

    await page.takePhoto();

    expect(page.photo).toBe(selectedFile);
    expect(page.photoPreviewUrl).toBe('blob:existing-preview');
    expect(page.errorMessage).toBe('');
  });

  it('explains camera permission denial and leaves the gallery available', async () => {
    const page = createPage();
    cameraMocks.takePhoto.mockRejectedValue({
      code: cameraMocks.errorCodes.CameraPermissionDenied,
    });

    await page.takePhoto();

    expect(page.errorMessage).toContain('Camera access was denied');
    expect(page.photo).toBeNull();
  });

  it('rejects camera photos larger than 5 MB', async () => {
    const page = createPage();
    cameraMocks.takePhoto.mockResolvedValue({
      type: 0,
      webPath: 'capacitor://camera/photo.jpg',
      saved: false,
    });
    const oversizedBlob = new Blob(
      [new Uint8Array(5 * 1024 * 1024 + 1)],
      { type: 'image/jpeg' },
    );
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => oversizedBlob,
    });

    await page.takePhoto();

    expect(page.photo).toBeNull();
    expect(page.errorMessage).toBe('The photo must be 5 MB or smaller.');
  });
});
