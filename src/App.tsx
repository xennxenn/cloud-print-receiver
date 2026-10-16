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
import { 
  Loader2, 
  Printer, 
  Cloud, 
  Laptop, 
  Send, 
  ArrowRight, 
  Sparkles,
  Camera,
  FolderDown,
  Share2,
  HardDrive,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { PrintJob, ViewMode } from './types';
import HostView from './components/HostView';
import MobileView from './components/MobileView';
import QRScannerModal from './components/QRScannerModal';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('loading');
  const [sessionId, setSessionId] = useState<string>('');
  const [enteredSessionId, setEnteredSessionId] = useState<string>('');
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSlowOrStuck, setIsSlowOrStuck] = useState<boolean>(false);
  const [isHomeScannerOpen, setIsHomeScannerOpen] = useState<boolean>(false);

  // ==========================================
  // 1. Connection Validation & Authentication Setup
  // ==========================================
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsSlowOrStuck(true);
    }, 6000);

    const checkDbConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        setDbConnected(true);
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.warn("Please check your Firebase configuration: Firestore appears offline.");
          setDbConnected(false);
        } else {
          setDbConnected(true);
        }
      }
    };
    checkDbConnection();

    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error: any) {
        console.error("Firebase Anonymous Auth error:", error);
        setAuthError(error?.message || String(error));
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        clearTimeout(timer);
        determineRoute();
      }
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  // ==========================================
  // 2. Resolve viewMode and Session identifier
  // ==========================================
  const determineRoute = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionFromUrl = urlParams.get('session');
    const modeFromUrl = urlParams.get('mode');

    if (sessionFromUrl) {
      setSessionId(sessionFromUrl);
      if (modeFromUrl === 'host') {
        setViewMode('host');
      } else {
        setViewMode('mobile');
      }
    } else {
      setViewMode('home');
    }
  };

  const startHostMode = (customId?: string) => {
    let hostSession = customId || localStorage.getItem('cloud_print_host_session');
    if (!hostSession) {
      hostSession = Math.random().toString(36).substring(2, 10).toUpperCase();
      localStorage.setItem('cloud_print_host_session', hostSession);
    }
    setSessionId(hostSession);
    setViewMode('host');
  };

  const startSendMode = (id?: string) => {
    let targetId = id?.trim().toUpperCase();
    if (!targetId) {
      targetId = Math.random().toString(36).substring(2, 10).toUpperCase();
    }
    setSessionId(targetId);
    setViewMode('mobile');
  };

  // ==========================================
  // 3. Real-time Database Observer (Host Side)
  // ==========================================
  useEffect(() => {
    if (!user || viewMode !== 'host' || !sessionId) return;

    const jobsRef = collection(db, 'printJobs');
    
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
            fileSize: data.fileSize,
            fileType: data.fileType || 'image',
            mimeType: data.mimeType || 'image/jpeg',
            senderName: data.senderName
          });
        }
      });
      
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-800 p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center max-w-md w-full bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50"
        >
          {authError || isSlowOrStuck ? (
            <div className="w-full text-center space-y-4">
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-500 border border-amber-100 animate-pulse">
                <Cloud className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-display font-bold text-gray-900">
                ระบบเชื่อมต่อใช้เวลานานผิดปกติ
              </h2>
              <p className="text-xs text-slate-500">
                กำลังเชื่อมต่อไปยัง Firebase แต่อาจเกิดข้อผิดพลาดในการยืนยันตัวตน
              </p>
              
              <button 
                onClick={() => window.location.reload()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl text-xs transition-colors shadow-md shadow-blue-500/10 cursor-pointer"
              >
                ลองโหลดหน้าใหม่อีกครั้ง
              </button>
            </div>
          ) : (
            <div className="text-center">
              <div className="relative mb-4 flex justify-center">
                <Loader2 className="animate-spin text-blue-600 w-12 h-12" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Cloud className="w-5 h-5 text-indigo-500 animate-pulse" />
                </div>
              </div>
              <h2 className="text-sm font-semibold tracking-wider text-slate-500 uppercase flex items-center justify-center gap-1.5 animate-pulse">
                <Printer className="w-4 h-4 text-blue-500" />
                Initializing cloud transfer...
              </h2>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // Home Selection Landing Screen
  if (viewMode === 'home') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 font-sans">
        <div className="max-w-4xl w-full text-center space-y-4 mb-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            Cloud Transfer & Print • ปลดล็อกไฟล์สูงสุด 200MB
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl sm:text-5xl font-display font-extrabold text-slate-900 tracking-tight leading-tight"
          >
            ระบบ ส่ง-รับ รูปภาพและไฟล์เรียลไทม์
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-slate-500 text-xs sm:text-base max-w-2xl mx-auto leading-relaxed"
          >
            โอนย้ายไฟล์ขนาดใหญ่สูงสุด 200MB สแกน QR Code หรือกรอกรหัสได้ทั้งสองฝั่ง เครื่องรับเลือกโฟลเดอร์สำหรับบันทึก หรือส่งต่อไปยังแอปพลิเคชันอื่นได้ตามใจ
          </motion.p>
        </div>

        {/* Feature Highlights Banner */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-w-4xl w-full mb-8"
        >
          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <HardDrive className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="font-bold text-slate-900 text-xs">ไฟล์สูงสุด 200MB</div>
              <div className="text-[10px] text-slate-400">รูป/เอกสาร/ZIP/วิดีโอ</div>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="font-bold text-slate-900 text-xs">สแกน QR ได้ 2 ฝั่ง</div>
              <div className="text-[10px] text-slate-400">หรือกรอกรหัสหากไร้กล้อง</div>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <FolderDown className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="font-bold text-slate-900 text-xs">เลือกโฟลเดอร์เซฟ</div>
              <div className="text-[10px] text-slate-400">เลือกตำแหน่งบันทึกเอง</div>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
              <Share2 className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="font-bold text-slate-900 text-xs">ส่งต่อแอปอื่นได้</div>
              <div className="text-[10px] text-slate-400">LINE/Drive/WhatsApp</div>
            </div>
          </div>
        </motion.div>

        {/* Action Cards */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full"
        >
          {/* Card 1: Receiver */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-xl shadow-slate-200/40 flex flex-col justify-between hover:border-blue-200/80 transition-all duration-300">
            <div className="space-y-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                <Laptop className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-display font-bold text-gray-900">
                เครื่องรับ (Receiver Console)
              </h2>
              <p className="text-slate-500 text-xs sm:text-sm leading-relaxed">
                ทำหน้าที่เป็นศูนย์กลางรับไฟล์และคิวงานพิมพ์แบบเรียลไทม์ เหมาะสำหรับคอมพิวเตอร์ที่ต่อเครื่องพิมพ์ หรือเครื่องที่ต้องการดาวน์โหลดไฟล์เข้าโฟลเดอร์เฉพาะ สามารถสแกน QR Code หรือกรอกรหัสเครื่องส่งได้
              </p>
            </div>
            
            <button
              onClick={() => startHostMode()}
              className="mt-8 w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-4 px-6 rounded-2xl text-sm transition-all duration-200 shadow-lg shadow-slate-900/10 hover:shadow-slate-800/20 flex items-center justify-center gap-1.5 cursor-pointer group"
            >
              เปิดหน้าจอเครื่องรับ
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Card 2: Sender */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-xl shadow-slate-200/40 flex flex-col justify-between hover:border-indigo-200/80 transition-all duration-300">
            <div className="space-y-4">
              <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                <Send className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-display font-bold text-gray-900">
                เครื่องส่ง (Sender Mode)
              </h2>
              <p className="text-slate-500 text-xs sm:text-sm leading-relaxed">
                ส่งรูปภาพความละเอียดสูง เอกสาร PDF, Word, Excel, ZIP ขนาดสูงสุด 200MB สามารถกรอกรหัส Session, สแกน QR Code ของเครื่องรับ หรือเปิด QR Code ให้เครื่องรับสแกนได้
              </p>

              {/* Code Input */}
              <div className="pt-2 space-y-2">
                <label className="text-[10px] uppercase font-mono tracking-wider font-semibold text-slate-400">
                  กรอกรหัสห้องเครื่องรับ (หรือเว้นว่างเพื่อสร้างรหัสใหม่)
                </label>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    placeholder="เช่น ZRSAZ778 หรือ TR-8942"
                    value={enteredSessionId}
                    onChange={(e) => setEnteredSessionId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') startSendMode(enteredSessionId);
                    }}
                    className="flex-1 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-indigo-500 font-mono text-center uppercase font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => setIsHomeScannerOpen(true)}
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 rounded-xl text-xs font-semibold flex items-center gap-1 border border-indigo-200 cursor-pointer"
                    title="สแกน QR Code"
                  >
                    <Camera className="w-4 h-4" />
                    สแกน
                  </button>
                </div>
              </div>
            </div>
            
            <button
              onClick={() => startSendMode(enteredSessionId)}
              className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 px-6 rounded-2xl text-sm transition-all duration-200 shadow-lg shadow-indigo-600/10 hover:shadow-indigo-700/20 flex items-center justify-center gap-1.5 cursor-pointer group"
            >
              เข้าสู่หน้าจอการส่ง
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </motion.div>

        {/* Global QR Scanner Modal from Home */}
        <QRScannerModal
          isOpen={isHomeScannerOpen}
          onClose={() => setIsHomeScannerOpen(false)}
          onScanSuccess={(code) => {
            setEnteredSessionId(code);
            startSendMode(code);
          }}
          title="สแกน QR Code เพื่อเชื่อมต่อ"
          subtitle="หันกล้องไปที่หน้าจอ หรือเลือกภาพถ่าย QR Code"
        />
      </div>
    );
  }

  // Active View Modes (Host or Mobile)
  return (
    <div className="min-h-screen bg-slate-50 selection:bg-blue-500 selection:text-white transition-colors duration-200">
      <AnimatePresence mode="wait">
        {viewMode === 'host' ? (
          <motion.div
            key="host-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <HostView 
              sessionId={sessionId} 
              printJobs={printJobs} 
              shareUrl={shareUrl} 
              onBackToHome={() => setViewMode('home')}
              onSessionChange={(newId) => setSessionId(newId)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="mobile-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <MobileView 
              sessionId={sessionId} 
              onBackToHome={() => setViewMode('home')}
              onSessionChange={(newId) => setSessionId(newId)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
