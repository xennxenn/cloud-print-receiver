/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  signInAnonymously, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  doc, 
  getDocFromServer 
} from 'firebase/firestore';
import { Loader2, Printer, Cloud } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { PrintJob, ViewMode } from './types';
import HostView from './components/HostView';
import MobileView from './components/MobileView';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('loading');
  const [sessionId, setSessionId] = useState<string>('');
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);

  // ==========================================
  // 1. Connection Validation & Authentication Setup
  // ==========================================
  useEffect(() => {
    // Check connection as per the Firebase-Integration Skill guidelines
    const checkDbConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        setDbConnected(true);
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.warn("Please check your Firebase configuration: Firestore appears offline.");
          setDbConnected(false);
        } else {
          // Other permission errors are acceptable for connection tests
          setDbConnected(true);
        }
      }
    };
    checkDbConnection();

    // Initialize Anonymous Authentication
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Firebase Anonymous Auth error:", error);
      }
    };
    initAuth();

    // Listen for Auth changes
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        determineRoute();
      }
    });

    return () => unsubscribe();
  }, []);

  // ==========================================
  // 2. Resolve viewMode and Session identifier
  // ==========================================
  const determineRoute = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionFromUrl = urlParams.get('session');

    if (sessionFromUrl) {
      setSessionId(sessionFromUrl);
      setViewMode('mobile');
    } else {
      // Host side: persist Session ID so browser refreshes do not clear queue list
      let hostSession = localStorage.getItem('cloud_print_host_session');
      if (!hostSession) {
        // Generate robust 8-character unique alphanumeric code
        hostSession = Math.random().toString(36).substring(2, 10).toUpperCase();
        localStorage.setItem('cloud_print_host_session', hostSession);
      }
      setSessionId(hostSession);
      setViewMode('host');
    }
  };

  // ==========================================
  // 3. Real-time Database Observer (Host Side)
  // ==========================================
  useEffect(() => {
    if (!user || viewMode !== 'host' || !sessionId) return;

    const jobsRef = collection(db, 'printJobs');
    
    // Listen to printJobs and filter in memory per user preferences
    const unsubscribe = onSnapshot(jobsRef, (snapshot) => {
      const jobs: PrintJob[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.sessionId === sessionId) {
          jobs.push({ 
            id: docSnap.id, 
            sessionId: data.sessionId,
            imageData: data.imageData,
            createdAt: data.createdAt,
            status: data.status || 'pending',
            fileName: data.fileName,
            fileSize: data.fileSize
          });
        }
      });
      
      // Sort so most recent jobs appear first in list
      jobs.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return timeB - timeA;
      });

      setPrintJobs(jobs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'printJobs');
    });

    return () => unsubscribe();
  }, [user, viewMode, sessionId]);

  // Determine dynamic absolute share URL for mobile scanning
  const getBaseUrl = () => {
    if (typeof window === 'undefined') return 'https://demo-app.com';
    const url = window.location.href.split('?')[0];
    if (!url || url === 'about:srcdoc') return 'https://demo-app.com';
    return url;
  };

  const shareUrl = `${getBaseUrl()}?session=${sessionId}`;

  // ==========================================
  // UI Display Cases
  // ==========================================
  if (viewMode === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-800">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center"
        >
          <div className="relative mb-4">
            <Loader2 className="animate-spin text-blue-600 w-12 h-12" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Cloud className="w-5 h-5 text-indigo-500 animate-pulse" />
            </div>
          </div>
          <h2 className="text-sm font-semibold tracking-wider text-slate-500 uppercase flex items-center gap-1.5 animate-pulse">
            <Printer className="w-4 h-4 text-blue-500" />
            Initializing printer cloud...
          </h2>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 selection:bg-blue-500 selection:text-white transition-colors duration-200">
      <AnimatePresence mode="wait">
        {viewMode === 'host' ? (
          <motion.div
            key="host-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <HostView 
              sessionId={sessionId} 
              printJobs={printJobs} 
              shareUrl={shareUrl} 
            />
          </motion.div>
        ) : (
          <motion.div
            key="mobile-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <MobileView 
              sessionId={sessionId} 
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
