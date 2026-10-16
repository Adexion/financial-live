import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User, 
  signOut 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { DatabaseState } from '../domain/types.ts';
import { encryptDatabasePayload, decryptDatabasePayload } from '../domain/cryptoBackup.ts';

// Initialize Firebase App singleton safely
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Restricted scope specifically for AppDataFolder (strict compliance with Google Play Store data privacy)
provider.addScope('https://www.googleapis.com/auth/drive.appdata');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export interface RemoteBackupFileInfo {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
}

export interface SyncStatus {
  isSignedIn: boolean;
  user: User | null;
  lastBackupDate: string | null;
  remoteBackupFound: RemoteBackupFileInfo | null;
  isSyncing: boolean;
  errorMessage: string | null;
}

/**
 * Initialize auth listener
 */
export function initAuthListener(
  onSuccess: (user: User, token: string) => void,
  onSignedOut: () => void
) {
  return onAuthStateChanged(auth, async (user) => {
    if (user && cachedAccessToken) {
      onSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      onSignedOut();
    }
  });
}

/**
 * Perform Google Sign-In with popup
 */
export async function signInWithGoogleDrive(): Promise<{ user: User; accessToken: string }> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Brak tokenu dostępu Google OAuth');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Drive sign-in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
}

export async function signOutGoogleDrive(): Promise<void> {
  await signOut(auth);
  cachedAccessToken = null;
}

export function getCachedAccessToken(): string | null {
  return cachedAccessToken;
}

/**
 * Queries Google Drive AppDataFolder for existing finguard_backup.db
 */
export async function findRemoteBackup(token?: string): Promise<RemoteBackupFileInfo | null> {
  const accessToken = token || cachedAccessToken;
  if (!accessToken) return null;

  try {
    const url = 'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,modifiedTime,size)&q=name=%27finguard_backup.db%27%20and%20trashed=false';
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        cachedAccessToken = null;
        throw new Error('Sesja wygasła. Zaloguj się ponownie.');
      }
      throw new Error(`Błąd wyszukiwania kopii na Dysku Google (${response.status})`);
    }

    const data = await response.json();
    if (data.files && data.files.length > 0) {
      // Return newest backup
      data.files.sort((a: any, b: any) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());
      return data.files[0];
    }
    return null;
  } catch (err: any) {
    console.error('findRemoteBackup failed:', err);
    throw err;
  }
}

/**
 * Encrypts local state and uploads/replaces finguard_backup.db in Google Drive AppDataFolder
 */
export async function uploadEncryptedBackup(
  state: DatabaseState,
  token?: string
): Promise<{ fileId: string; modifiedTime: string }> {
  const accessToken = token || cachedAccessToken;
  if (!accessToken) {
    throw new Error('Brak autoryzacji Google Drive. Zaloguj się najpierw.');
  }

  // 1. Encrypt Database State
  const encryptedBytes = await encryptDatabasePayload(state);

  // 2. Check if file already exists in AppDataFolder
  const existingFile = await findRemoteBackup(accessToken);

  if (existingFile) {
    // Update existing file using PATCH upload
    const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`;
    const response = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
      body: new Blob([encryptedBytes as BlobPart]),
    });

    if (!response.ok) {
      throw new Error(`Błąd aktualizacji kopii na Dysku (${response.status})`);
    }

    const updated = await response.json();
    return { fileId: updated.id, modifiedTime: new Date().toISOString() };
  } else {
    // Create new file in AppDataFolder using multipart upload
    const metadata = {
      name: 'finguard_backup.db',
      parents: ['appDataFolder'],
      mimeType: 'application/octet-stream',
    };

    const boundary = '-------FinGuardBoundary7MA4YWxkTrZu0gW';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadataPart = delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/octet-stream\r\n\r\n';

    const enc = new TextEncoder();
    const metadataBytes = enc.encode(metadataPart);
    const closeBytes = enc.encode(closeDelimiter);

    const fullBody = new Uint8Array(metadataBytes.length + encryptedBytes.length + closeBytes.length);
    fullBody.set(metadataBytes, 0);
    fullBody.set(encryptedBytes, metadataBytes.length);
    fullBody.set(closeBytes, metadataBytes.length + encryptedBytes.length);

    const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: new Blob([fullBody as BlobPart]),
    });

    if (!response.ok) {
      throw new Error(`Błąd tworzenia kopii na Dysku Google (${response.status})`);
    }

    const created = await response.json();
    return { fileId: created.id, modifiedTime: new Date().toISOString() };
  }
}

/**
 * Downloads finguard_backup.db from Google Drive AppDataFolder and decrypts it
 */
export async function downloadAndDecryptBackup(
  fileId: string,
  token?: string
): Promise<DatabaseState> {
  const accessToken = token || cachedAccessToken;
  if (!accessToken) {
    throw new Error('Brak autoryzacji Google Drive.');
  }

  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const response = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Nie udało się pobrać pliku kopii (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const encryptedBytes = new Uint8Array(arrayBuffer);

  // Decrypt
  return await decryptDatabasePayload(encryptedBytes);
}
