import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Printer, 
  QrCode, 
  Monitor, 
  ImageIcon, 
  Clock, 
  Trash2, 
  Check, 
  ExternalLink, 
  Copy, 
  RefreshCw,
  Sparkles,
  Scissors
} from 'lucide-react';
import { PrintJob } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, deleteDoc, updateDoc, writeBatch, collection, query, where, getDocs } from 'firebase/firestore';

interface HostViewProps {
  sessionId: string;
  printJobs: PrintJob[];
  shareUrl: string;
}

export default function HostView({ sessionId, printJobs, shareUrl }: HostViewProps) {
  const [copied, setCopied] = useState(false);
  const [printingJob, setPrintingJob] = useState<PrintJob | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handlePrint = (job: PrintJob) => {
    setPrintingJob(job);
    
    // Smooth transition into printing state
    setTimeout(() => {
      // Set print section title to print nicely
      const originalTitle = document.title;
      document.title = `Print_Session_${sessionId}_Job_${job.id.substring(0, 5)}`;
      
      window.print();
      
      // Restore title
      document.title = originalTitle;
      
      // Update status in Firestore
      try {
        const docRef = doc(db, 'printJobs', job.id);
        updateDoc(docRef, { status: 'printed' });
      } catch (error) {
        console.error("Failed to update status", error);
      }
      
      setPrintingJob(null);
    }, 400);
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      const docRef = doc(db, 'printJobs', jobId);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `printJobs/${jobId}`);
    }
  };

  const handleClearAll = async () => {
    if (printJobs.length === 0) return;
    if (!window.confirm('คุณต้องการล้างคิวงานพิมพ์ทั้งหมดสำหรับ Session นี้ใช่หรือไม่?')) return;
    
    setIsClearingAll(true);
    try {
      const batch = writeBatch(db);
      printJobs.forEach((job) => {
        const docRef = doc(db, 'printJobs', job.id);
        batch.delete(docRef);
      });
      await batch.commit();
    } catch (error) {
      console.error("Failed to clear queue", error);
    } finally {
      setIsClearingAll(false);
    }
  };

  const formatTime = (createdAt: any) => {
    if (!createdAt) return 'เมื่อสักครู่';
    try {
      const date = createdAt.toMillis ? new Date(createdAt.toMillis()) : new Date(createdAt);
      return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return 'เมื่อสักครู่';
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 font-sans">
      {/* Printable Section (hidden on browser screen, visible only when printing) */}
      <AnimatePresence>
        {printingJob && (
          <div id="print-section" className="hidden fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-0 text-black">
            <div className="w-full h-full flex items-center justify-center overflow-hidden">
              <img 
                src={printingJob.imageData} 
                alt="Print Content" 
                className="max-w-full max-h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Screen Layout header */}
      <header className="no-print flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 text-white p-3 rounded-2xl shadow-md shadow-blue-500/10">
            <Printer className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 tracking-tight">
              Cloud Print Receiver
            </h1>
            <p className="text-sm text-gray-500 font-sans mt-0.5">
              รับรูปภาพแบบเรียลไทม์ผ่านคลาวด์ สั่งพิมพ์ได้ทันทีโดยไม่ต้องลงแอป
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <div className="text-sm font-mono text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 font-medium">
            Active Session ID: {sessionId}
          </div>
        </div>
      </header>

      <div className="no-print grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left column: QR code and Link share (Width 4 on large screens) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
            <div className="bg-blue-50 p-4 rounded-2xl mb-4 text-blue-600 block">
              <QrCode className="w-8 h-8" />
            </div>
            
            <h2 className="text-xl font-display font-semibold text-gray-900 mb-2">
              สแกนเพื่อส่งรูปภาพ
            </h2>
            <p className="text-gray-500 text-xs sm:text-sm leading-relaxed mb-6">
              ใช้กล้องมือถือสแกนคิวอาร์โค้ดนี้ เพื่อเปิดเว็บบนมือถือสำหรับเลือกรูปและส่งรูปภาพมายังเครื่องนี้ได้ทันที (คนละเครือข่ายก็ส่งได้)
            </p>

            {/* QR Card Container */}
            <div className="relative group bg-slate-50 p-5 rounded-2xl border border-gray-200/60 max-w-xs w-full mb-6">
              <div className="absolute inset-0 border border-blue-500/0 group-hover:border-blue-500/40 rounded-2xl transition-all duration-300 pointer-events-none" />
              {shareUrl ? (
                <div className="relative flex flex-col items-center bg-white p-3 rounded-xl shadow-inner">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(shareUrl)}`} 
                    alt="Scan to upload"
                    className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
                    referrerPolicy="no-referrer"
                  />
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-blue-600 font-medium bg-blue-50 px-2.5 py-1 rounded-full">
                    <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    scan.cloudprint.ready
                  </div>
                </div>
              ) : (
                <div className="w-56 h-56 mx-auto bg-gray-100 rounded-xl flex flex-col items-center justify-center text-gray-400">
                  <RefreshCw className="w-8 h-8 animate-spin mb-2" />
                  <span className="text-xs">กำลังสร้าง QR Code...</span>
                </div>
              )}
            </div>

            {/* Action buttons for link copying */}
            <div className="w-full pt-2 border-t border-gray-100">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={shareUrl} 
                  className="flex-1 bg-gray-50 border border-gray-200 text-gray-500 px-3 py-2 rounded-xl text-xs focus:outline-none font-mono select-all truncate"
                />
                <button 
                  onClick={copyToClipboard}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 p-2.5 rounded-xl text-xs transition-colors font-medium flex items-center justify-center shadow-sm shrink-0"
                  title="Copy link"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Animated Virtual Printer Device (Visual aesthetic reinforcement, anti-ai slop) */}
          <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-lg border border-slate-800 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-600/10 blur-xl rounded-full" />
            <h3 className="text-sm font-semibold tracking-wider text-slate-400 uppercase mb-4 flex items-center gap-2">
              <Monitor className="w-4 h-4" /> Virtual Server Status
            </h3>
            
            {/* The physical printer animation */}
            <div className="relative py-4 flex flex-col items-center">
              <div className="w-40 h-20 bg-slate-800 rounded-t-2xl border-t border-x border-slate-700 relative shadow-inner flex flex-col justify-end items-center px-4">
                {/* Paper tray/slit */}
                <div className="w-28 h-2 bg-slate-950 rounded-full mb-3 relative overflow-hidden">
                  <div className="absolute left-0 top-0 h-full w-full bg-gradient-to-r from-blue-500/20 via-blue-400 to-blue-500/20 animate-pulse" />
                </div>
                {/* Printer details */}
                <div className="absolute bottom-1 right-2 text-[8px] font-mono text-slate-500">ONLINE v1.0</div>
                <div className="absolute bottom-1 left-2 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              </div>

              {/* Rolling paper illustration when printing */}
              <motion.div 
                className="w-32 bg-white text-slate-900 border-x border-b border-gray-200 shadow-md p-2 rounded-b-md text-[6px] font-mono origin-top overflow-hidden"
                initial={{ height: 0 }}
                animate={{ height: printJobs.length > 0 ? 36 : 0 }}
                transition={{ type: 'spring', damping: 15 }}
              >
                <div className="flex justify-between items-center mb-1 text-[5px] text-blue-600 font-bold border-b border-gray-100 pb-0.5">
                  <span>PRINT QUEUE</span>
                  <span>{printJobs.length} JOBS</span>
                </div>
                <div className="truncate text-[5px] text-gray-500">
                  {printJobs.length > 0 ? `active: ${printJobs[0].id.substring(0, 8)}` : 'standing by'}
                </div>
                <div className="h-4 bg-gray-100 mt-1 opacity-50 rounded" />
              </motion.div>
            </div>
            
            <div className="flex justify-between text-xs text-slate-400 border-t border-slate-800 pt-4 mt-2 font-mono">
              <span>Total Received:</span>
              <span className="font-bold text-white">{printJobs.length}</span>
            </div>
          </div>
        </div>

        {/* Right column: Print Queue (Width 8 on large screens) */}
        <div className="lg:col-span-8">
          <div className="flex items-center justify-between gap-4 mb-5">
            <h2 className="text-xl font-display font-semibold text-gray-900 flex items-center gap-2">
              <Monitor className="w-5 h-5 text-gray-700" /> 
              คิวภาพที่รอดำเนินการ 
              <span className="bg-gray-200 text-gray-700 text-xs px-2.5 py-0.5 rounded-full font-medium ml-1.5">
                {printJobs.length}
              </span>
            </h2>

            {printJobs.length > 0 && (
              <button
                onClick={handleClearAll}
                disabled={isClearingAll}
                className="text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-xl transition-colors border border-transparent hover:border-red-100 flex items-center gap-1 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                ล้างคิวทั้งหมด
              </button>
            )}
          </div>

          {printJobs.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-gray-200 rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
              <div className="bg-gray-50 text-gray-400 p-5 rounded-2xl mb-4 shadow-sm">
                <ImageIcon className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-display font-medium text-gray-800 mb-1">ยังไม่มีคิวงานพิมพ์</h3>
              <p className="text-gray-400 text-sm max-w-sm mb-6">
                สแกนคิวอาร์โค้ดในมุมซ้ายด้วยมือถือของคุณ เพื่ออัปโหลดและส่งรูปภาพเข้ามาแสดงในทันที!
              </p>
              
              <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-100 px-4 py-2 rounded-2xl">
                <Clock className="w-4 h-4 animate-pulse text-blue-500" />
                เชื่อมต่อฐานข้อมูลเรียลไทม์... เฝ้ารอรับข้อมูล
              </div>
            </div>
          ) : (
            <motion.div 
              layout
              className="grid grid-cols-1 sm:grid-cols-2 gap-6"
            >
              <AnimatePresence mode="popLayout">
                {printJobs.map((job, index) => (
                  <motion.div
                    key={job.id}
                    layout
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9, y: -20 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    className={`bg-white rounded-3xl shadow-sm border ${
                      job.status === 'printed' ? 'border-emerald-200' : 'border-gray-100'
                    } overflow-hidden flex flex-col group relative`}
                  >
                    {/* Status Badge overlay */}
                    {job.status === 'printed' && (
                      <div className="absolute top-3 left-3 bg-emerald-500 text-white text-[10px] uppercase font-bold tracking-wide px-2 py-1 rounded-full flex items-center gap-1 shadow-sm z-10">
                        <Check className="w-3 h-3" /> Printed
                      </div>
                    )}

                    {/* Image Container */}
                    <div className="relative aspect-[4/3] bg-gray-50 overflow-hidden border-b border-gray-100">
                      <img 
                        src={job.imageData} 
                        alt="Submitted print job" 
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4 justify-between">
                        <span className="text-[10px] font-mono text-white/90">
                          ID: {job.id.substring(0, 10).toUpperCase()}
                        </span>
                        
                        {/* Instant delete from floating screen */}
                        <button
                          onClick={() => handleDeleteJob(job.id)}
                          className="bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-lg transition-colors shadow-lg shadow-red-500/10"
                          title="ลบออกจากประวัติ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Info Card Body */}
                    <div className="p-4 flex flex-col flex-1 bg-white">
                      <div className="flex items-start justify-between gap-2 mb-4">
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-400 flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3" />
                            {formatTime(job.createdAt)}
                          </span>
                          <span className="text-xs font-semibold text-gray-700 mt-1">
                            {job.fileName ? job.fileName : `ไฟล์ภาพที่ #${index + 1}`}
                          </span>
                        </div>
                        {job.fileSize && (
                          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                            {job.fileSize}
                          </span>
                        )}
                      </div>

                      {/* Command actions */}
                      <div className="mt-auto flex gap-2">
                        <button
                          onClick={() => handlePrint(job)}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white py-2.5 px-4 rounded-2xl text-xs font-semibold shadow-md active:scale-95 transition-all duration-150 flex items-center justify-center gap-1.5"
                        >
                          <Printer className="w-4 h-4" /> สั่งบริ้นรูปภาพ
                        </button>

                        <button
                          onClick={() => handleDeleteJob(job.id)}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-700 p-2.5 rounded-2xl transition-all duration-150 flex items-center justify-center"
                          title="ลบคัดออก"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
