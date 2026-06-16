import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';

// User's manual Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyBSRdMfnR3REw5O8F8t0M7-5R1sS0kv90I",
  authDomain: "print-online-d38f5.firebaseapp.com",
  projectId: "print-online-d38f5",
  storageBucket: "print-online-d38f5.firebasestorage.app",
  messagingSenderId: "107368862030",
  appId: "1:107368862030:web:8076ebb01aa5e829254e1f"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Error Handling helper as per Firestore-Integration Guidelines
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
