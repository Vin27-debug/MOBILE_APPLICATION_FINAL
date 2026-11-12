import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyCjdRTNhwcivYeFsQLBet9PxDeLsFt0b1Q',
  authDomain: 'campus-lost-and-found-8cb17.firebaseapp.com',
  projectId: 'campus-lost-and-found-8cb17',
  storageBucket: 'campus-lost-and-found-8cb17.firebasestorage.app',
  messagingSenderId: '686396237765',
  appId: '1:686396237765:web:81861e4e3ea9397208cdac',
  measurementId: 'G-XXCN9SHC7C',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

console.info('[Firebase] initialized', {
  projectId: app.options.projectId,
  apiKeyConfigured: Boolean(app.options.apiKey),
  appIdConfigured: Boolean(app.options.appId),
});
