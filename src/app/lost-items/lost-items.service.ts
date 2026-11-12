
import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Timestamp,
  type DocumentData,
  type Query,
  type Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';

import { auth, db, logFirestoreOperationError } from '../firebase';

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : undefined;
  }

  return undefined;
}

const CLOUDINARY_CLOUD_NAME = 'scfxamed';
const CLOUDINARY_UPLOAD_PRESET = 'campus_lost_found';
const MAX_LOST_ITEM_PHOTO_SIZE = 5 * 1024 * 1024;

interface CloudinaryUploadResponse {
  secure_url?: string;
  error?: {
    message?: string;
  };
}

/**
 * Upload an image to Cloudinary.
 * Used by both Lost Item reports and Messenger.
 */
async function uploadImageToCloudinary(photo: File): Promise<string> {
  if (!photo.type.startsWith('image/')) {
    throw new Error('Please select a valid image file.');
  }

  const formData = new FormData();
  formData.append('file', photo);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  let response: Response;

  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      {
        method: 'POST',
        body: formData,
      },
    );
  } catch (error) {
    console.error('[Cloudinary] Network upload failed:', error);
    throw new Error(
      'Could not connect to Cloudinary. Check your internet connection.',
    );
  }

  let result: CloudinaryUploadResponse;

  try {
    result = (await response.json()) as CloudinaryUploadResponse;
  } catch {
    throw new Error('Cloudinary returned an invalid response.');
  }

  if (!response.ok || !result.secure_url) {
    throw new Error(
      result.error?.message ??
        `Cloudinary upload failed (${response.status}).`,
    );
  }

  return result.secure_url;
}

export interface LostItem {
  id: string;
  ownerUid: string;
  ownerName: string;
  itemName: string;
  description: string;
  lastSeenLocation: string;
  lastSeenAt: Timestamp;
  photoUrl?: string;
  status: 'lost' | 'returned';
  createdAt?: Timestamp;
}

export interface LostItemMessage {
  id: string;
  senderUid: string;
  text: string;
  photoUrl?: string;
  photoStatus?: 'uploading' | 'uploaded' | 'failed';
  createdAt?: Timestamp;
}

export interface OwnershipConversation {
  id: string;
  itemId: string;
  itemName: string;
  requesterUid: string;
  ownerUid: string;
  status: 'pending' | 'verified';
  createdAt?: Timestamp;
  lastMessage?: string;
  lastMessageAt?: Timestamp;
  ownerUnread?: number;
  requesterUnread?: number;
  ownerLastReadAt?: Timestamp;
  requesterLastReadAt?: Timestamp;
}

@Injectable({ providedIn: 'root' })
export class LostItemsService {

  // ==========================================
  // LOST ITEMS FEED
  // ==========================================

  watchOpenItems(
    onItems: (items: LostItem[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const uid = auth.currentUser?.uid ?? null;
    const itemQuery = query(
      collection(db, 'lostItems'),
      orderBy('createdAt', 'desc'),
      limit(100),
    );

    console.info('[Firestore] Operation started', {
      projectId: db.app.options.projectId,
      databaseId: '(default)',
      uid,
      collectionPath: '/lostItems',
      operation: 'onSnapshot list query',
      query: 'orderBy(createdAt desc), limit(100)',
    });

    return onSnapshot(
      itemQuery,
      (snapshot) => {
        console.log('[LostItems] Firestore snapshot received');
        console.log('[LostItems] Documents found:', snapshot.size);
        console.log('[LostItems] From cache:', snapshot.metadata.fromCache);

        const items = snapshot.docs
          .map((document) => ({
            id: document.id,
            ...document.data(),
          }) as LostItem)
          .filter((item) => item.status === 'lost');

        console.log('[LostItems] Active lost items:', items.length);
        console.log('[LostItems] Item data:', items);

        onItems(items);
      },
      (error) => {
        logFirestoreOperationError(
          'onSnapshot list query: orderBy(createdAt desc), limit(100)',
          '/lostItems',
          error,
          auth.currentUser?.uid ?? null,
        );

        onError(error);
      },
    );
  }

  // ==========================================
  // CREATE LOST ITEM
  // ==========================================

  async createLostItem(
    input: Omit<LostItem, 'id' | 'createdAt' | 'status' | 'photoUrl'>,
    photo?: File,
  ): Promise<string> {
    const user = auth.currentUser;

    if (!user || user.uid !== input.ownerUid) {
      throw new Error('You must be signed in to report a lost item.');
    }

    if (photo) {
      if (!photo.type.startsWith('image/')) {
        throw new Error('Please select a valid image file.');
      }

      if (photo.size > MAX_LOST_ITEM_PHOTO_SIZE) {
        throw new Error('Photo must not exceed 5 MB.');
      }
    }

    const itemRef = doc(collection(db, 'lostItems'));

    let photoUrl: string | undefined;

    // Upload the photo to Cloudinary instead of Firebase Storage.
    if (photo) {
      console.log('[LostItems] Uploading report photo to Cloudinary...');

      photoUrl = await uploadImageToCloudinary(photo);

      console.log('[LostItems] Photo uploaded successfully.');
    }

    // Save the item details and Cloudinary URL in Firestore.
    await setDoc(itemRef, {
      ...input,
      ...(photoUrl ? { photoUrl } : {}),
      status: 'lost',
      createdAt: serverTimestamp(),
    });

    console.log('[LostItems] Report successfully saved:', itemRef.id);

    return itemRef.id;
  }

  // ==========================================
  // OWNERSHIP REQUEST
  // ==========================================

  async requestOwnership(item: LostItem): Promise<string> {
    const requester = auth.currentUser;

    if (!requester) {
      throw new Error('Please sign in first.');
    }

    if (requester.uid === item.ownerUid) {
      throw new Error('You cannot request your own item.');
    }

    const conversationId = `${item.id}_${requester.uid}`;
    const conversationRef = doc(db, 'conversations', conversationId);

    const existing = await getDoc(conversationRef);

    if (!existing.exists()) {
      await setDoc(conversationRef, {
        itemId: item.id,
        itemName: item.itemName,
        requesterUid: requester.uid,
        ownerUid: item.ownerUid,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
    }

    console.log(
      '[Chat] Conversation created or already exists:',
      conversationId,
    );

    return conversationId;
  }

  // ==========================================
  // GET AND WATCH ITEMS
  // ==========================================

  async getItem(itemId: string): Promise<LostItem | null> {
    const snapshot = await getDoc(doc(db, 'lostItems', itemId));

    return snapshot.exists()
      ? ({ id: snapshot.id, ...snapshot.data() } as LostItem)
      : null;
  }

  watchItem(
    itemId: string,
    onItem: (item: LostItem | null) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    return onSnapshot(
      doc(db, 'lostItems', itemId),
      (snapshot) => {
        onItem(
          snapshot.exists()
            ? ({ id: snapshot.id, ...snapshot.data() } as LostItem)
            : null,
        );
      },
      onError,
    );
  }

  // ==========================================
  // CONVERSATIONS
  // ==========================================

  async getConversation(
    conversationId: string,
  ): Promise<OwnershipConversation | null> {
    const snapshot = await getDoc(
      doc(db, 'conversations', conversationId),
    );

    return snapshot.exists()
      ? ({
          id: snapshot.id,
          ...snapshot.data(),
        } as OwnershipConversation)
      : null;
  }

  watchConversation(
    conversationId: string,
    onConversation: (conversation: OwnershipConversation | null) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    return onSnapshot(
      doc(db, 'conversations', conversationId),
      (snapshot) => {
        onConversation(
          snapshot.exists()
            ? ({
                id: snapshot.id,
                ...snapshot.data(),
              } as OwnershipConversation)
            : null,
        );
      },
      onError,
    );
  }

  async getConversationsForUser(
    uid: string,
  ): Promise<OwnershipConversation[]> {
    const conversations = collection(db, 'conversations');

    const [owned, requested] = await Promise.all([
      this.getConversationQuery(
        query(conversations, where('ownerUid', '==', uid), limit(50)),
        'getDocs where(ownerUid == current UID), limit(50)',
        uid,
      ),
      this.getConversationQuery(
        query(conversations, where('requesterUid', '==', uid), limit(50)),
        'getDocs where(requesterUid == current UID), limit(50)',
        uid,
      ),
    ]);

    const byId = new Map<string, OwnershipConversation>();

    for (const snapshot of [...owned.docs, ...requested.docs]) {
      byId.set(
        snapshot.id,
        { id: snapshot.id, ...snapshot.data() } as OwnershipConversation,
      );
    }

    return [...byId.values()].sort(
      (left, right) =>
        (right.createdAt?.toMillis() ?? 0) -
        (left.createdAt?.toMillis() ?? 0),
    );
  }

  private async getConversationQuery(
    conversationQuery: Query<DocumentData, DocumentData>,
    operation: string,
    uid: string,
  ) {
    try {
      return await getDocs(conversationQuery);
    } catch (error: unknown) {
      logFirestoreOperationError(operation, '/conversations', error, uid);
      throw error;
    }
  }

  watchConversationsForUser(
    uid: string,
    onConversations: (items: OwnershipConversation[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const conversationsRef = collection(db, 'conversations');

    let owned: OwnershipConversation[] = [];
    let requested: OwnershipConversation[] = [];

    const publish = () => {
      const byId = new Map<string, OwnershipConversation>();

      for (const conversation of [...owned, ...requested]) {
        byId.set(conversation.id, conversation);
      }

      const result = [...byId.values()].sort(
        (a, b) =>
          (b.lastMessageAt?.toMillis() ?? b.createdAt?.toMillis() ?? 0) -
          (a.lastMessageAt?.toMillis() ?? a.createdAt?.toMillis() ?? 0),
      );

      onConversations(result);
    };

    const unsubscribeOwned = onSnapshot(
      query(conversationsRef, where('ownerUid', '==', uid), limit(50)),
      (snapshot) => {
        owned = snapshot.docs.map(
          (item) =>
            ({
              id: item.id,
              ...item.data(),
            }) as OwnershipConversation,
        );

        publish();
      },
      onError,
    );

    const unsubscribeRequested = onSnapshot(
      query(conversationsRef, where('requesterUid', '==', uid), limit(50)),
      (snapshot) => {
        requested = snapshot.docs.map(
          (item) =>
            ({
              id: item.id,
              ...item.data(),
            }) as OwnershipConversation,
        );

        publish();
      },
      onError,
    );

    return () => {
      unsubscribeOwned();
      unsubscribeRequested();
    };
  }

  // ==========================================
  // MARK CONVERSATION AS READ
  // ==========================================

  async markConversationRead(
    conversation: OwnershipConversation,
  ): Promise<void> {
    const user = auth.currentUser;

    if (!user) {
      throw new Error('Please sign in first.');
    }

    if (user.uid === conversation.ownerUid) {
      await updateDoc(doc(db, 'conversations', conversation.id), {
        ownerUnread: 0,
        ownerLastReadAt: serverTimestamp(),
      });

      return;
    }

    if (user.uid === conversation.requesterUid) {
      await updateDoc(doc(db, 'conversations', conversation.id), {
        requesterUnread: 0,
        requesterLastReadAt: serverTimestamp(),
      });

      return;
    }

    throw new Error('You are not a participant in this conversation.');
  }

  // ==========================================
  // MESSAGES
  // ==========================================

  watchMessages(
    conversationId: string,
    onMessages: (messages: LostItemMessage[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const messageQuery = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(200),
    );

    return onSnapshot(
      messageQuery,
      (snapshot) =>
        onMessages(
          snapshot.docs.map(
            (document) =>
              ({
                id: document.id,
                ...document.data(),
              }) as LostItemMessage,
          ),
        ),
      onError,
    );
  }

  async sendMessage(
    conversationId: string,
    text: string,
    photo?: File,
  ): Promise<void> {
    const user = auth.currentUser;

    if (!user) {
      throw new Error('Sign in before sending a message.');
    }

    const cleanText = text.trim();

    if (!cleanText && !photo) {
      throw new Error('Enter a message or attach a photo.');
    }

    const conversationRef = doc(db, 'conversations', conversationId);
    const conversationSnapshot = await getDoc(conversationRef);

    if (!conversationSnapshot.exists()) {
      throw new Error('Conversation not found.');
    }

    const conversation = conversationSnapshot.data();

    const isOwner = conversation['ownerUid'] === user.uid;
    const isRequester = conversation['requesterUid'] === user.uid;

    if (!isOwner && !isRequester) {
      throw new Error('You are not a participant in this conversation.');
    }

    const messageRef = doc(
      collection(db, 'conversations', conversationId, 'messages'),
    );

    const messageData: Record<string, unknown> = {
      senderUid: user.uid,
      text: cleanText,
      createdAt: serverTimestamp(),
    };

    if (photo) {
      messageData['photoStatus'] = 'uploading';
    }

    // Save the message first.
    await setDoc(messageRef, messageData);

    // Update Messenger inbox preview and recipient unread count.
    await updateDoc(conversationRef, {
      lastMessage: cleanText || '📷 Photo',
      lastMessageAt: serverTimestamp(),
      ...(isOwner
        ? { requesterUnread: increment(1) }
        : { ownerUnread: increment(1) }),
    });

    // Upload the photo in the background.
    if (photo) {
      void (async () => {
        try {
          const photoUrl = await uploadImageToCloudinary(photo);

          await updateDoc(messageRef, {
            photoUrl,
            photoStatus: 'uploaded',
          });
        } catch (error) {
          console.error('[Chat] Background photo upload failed:', error);

          try {
            await updateDoc(messageRef, {
              photoStatus: 'failed',
            });
          } catch (updateError) {
            console.error(
              '[Chat] Could not update photo status:',
              updateError,
            );
          }
        }
      })();
    }
  }

  // ==========================================
  // VERIFY OWNERSHIP
  // ==========================================

  async verifyOwnership(conversationId: string): Promise<void> {
    const user = auth.currentUser;

    if (!user) {
      throw new Error('Sign in to verify this ownership request.');
    }

    await updateDoc(doc(db, 'conversations', conversationId), {
      status: 'verified',
      verifiedBy: user.uid,
      verifiedAt: serverTimestamp(),
    });
  }

  // ==========================================
  // MARK ITEM AS RETURNED
  // ==========================================

  async markReturned(
    itemId: string,
    conversationId: string,
  ): Promise<void> {
    await updateDoc(doc(db, 'lostItems', itemId), {
      status: 'returned',
      resolvedByConversationId: conversationId,
      returnedAt: serverTimestamp(),
    });
  }
}
