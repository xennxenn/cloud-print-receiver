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
  Download, 
  File, 
  FileText, 
  FileArchive, 
  Home,
  Camera,
  Share2,
  FolderDown,
  Layers,
  Keyboard,
  Maximize2
} from 'lucide-react';
import { PrintJob } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
import QRScannerModal from './QRScannerModal';
import FileActionModal from './FileActionModal';
import { getJobBlob, saveFileWithPicker, shareFileToApps } from '../utils/fileActions';

interface HostViewProps {
  sessionId: string;
  printJobs: PrintJob[];
  shareUrl: string;
  onBackToHome?: () => void;
  onSessionChange?: (newSessionId: string) => void;
}

export default function HostView({ 
  sessionId, 
  printJobs, 
  shareUrl, 
  onBackToHome,
  onSessionChange 
}: HostViewProps) {
  const [copied, setCopied] = useState(false);
  const [printingJob, setPrintingJob] = useState<PrintJob | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);
  
  // Scanner Modal & Action Modal states
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedJobForAction, setSelectedJobForAction] = useState<PrintJob | null>(null);
  const [isQRZoomed, setIsQRZoomed] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const copyToClipboard = async () => {
    try {
      if (shareUrl) {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handlePrint = (job: PrintJob) => {
    setPrintingJob(job);
    setTimeout(() => {
      const originalTitle = document.title;
      document.title = `Print_Job_${job.fileName || job.id.substring(0, 5)}`;
      window.print();
      document.title = originalTitle;
      
      try {
        const docRef = doc(db, 'printJobs', job.id);
        updateDoc(docRef, { status: 'printed' });
      } catch (error) {
        console.error("Failed to update status", error);
      }
      setPrintingJob(null);
    }, 400);
  };

  const handleQuickSave = async (job: PrintJob) => {
    try {
      const blob = await getJobBlob(job.imageData, job.mimeType);
      const res = await saveFileWithPicker(blob, job.fileName || 'file', job.mimeType);
      if (res.success) {
        showToast(res.method === 'picker' ? 'บันทึกไฟล์ลงโฟลเดอร์เรียบร้อยแล้ว!' : 'ดาวน์โหลดไฟล์เรียบร้อยแล้ว!');
        const docRef = doc(db, 'printJobs', job.id);
        updateDoc(docRef, { status: 'printed' });
      }
    } catch (e: any) {
      console.error('Quick save failed:', e);
      showToast('เกิดข้อผิดพลาดในการบันทึกไฟล์');
    }
  };

  const handleQuickShare = async (job: PrintJob) => {
    try {
      const blob = await getJobBlob(job.imageData, job.mimeType);
      const res = await shareFileToApps(blob, job.fileName || 'file', job.mimeType);
      if (res.success) {
        showToast('ส่งต่อไปยังแอปพลิเคชันเรียบร้อยแล้ว!');
        const docRef = doc(db, 'printJobs', job.id);
        updateDoc(docRef, { status: 'printed' });
      } else if (res.fallback) {
        // Open action modal for fallback options
        setSelectedJobForAction(job);
      }
    } catch (e: any) {
      console.error('Quick share failed:', e);
      setSelectedJobForAction(job);
    }
  };

  const handleSaveAll = async () => {
    if (printJobs.length === 0) return;
    setIsSavingAll(true);
    let count = 0;
    try {
      for (const job of printJobs) {
        const blob = await getJobBlob(job.imageData, job.mimeType);
        // Anchor fallback for batch ensures multiple downloads without multiple picker prompts
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = job.fileName || `file_${job.id.substring(0, 5)}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        count++;
      }
      showToast(`บันทึกไฟล์ทั้งหมด ${count} รายการเรียบร้อยแล้ว!`);
    } catch (err) {
      console.error('Save all failed:', err);
      showToast('เกิดข้อผิดพลาดในการบันทึกไฟล์ทั้งหมด');
    } finally {
      setIsSavingAll(false);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      const docRef = doc(db, 'printJobs', jobId);
      await deleteDoc(docRef);
      showToast('ลบรายการงานเรียบร้อยแล้ว');
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
      showToast('ล้างคิวทั้งหมดเรียบร้อยแล้ว');
    } catch (error) {
      console.error("Failed to clear queue", error);
    } finally {
      setIsClearingAll(false);
    }
  };

  const generateNewSession = () => {
    const newSession = Math.random().toString(36).substring(2, 10).toUpperCase();
    localStorage.setItem('cloud_print_host_session', newSession);
    if (onSessionChange) {
      onSessionChange(newSession);
    }
    showToast(`สร้างรหัส Session ใหม่: ${newSession}`);
  };

  const handleScannedSenderCode = (scannedCode: string) => {
    const sanitized = scannedCode.trim().toUpperCase();
    if (sanitized && onSessionChange) {
      onSessionChange(sanitized);
      showToast(`เชื่อมต่อไปยังเครื่องส่ง: ${sanitized}`);
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
      {/* Toast alert banner */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold border border-slate-700"
          >
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Printable Section (visible only when printing) */}
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

      {/* Screen Layout Header */}
      <header className="no-print flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white p-3 rounded-2xl shadow-md shadow-blue-500/20">
            <Printer className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 tracking-tight">
                เครื่องรับ (Receiver Console)
              </h1>
              <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Max 200MB
              </span>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 font-sans mt-0.5">
              ศูนย์กลางรับรูปภาพและไฟล์ขนาดใหญ่สูงสุด 200MB เลือกโฟลเดอร์บันทึก หรือส่งต่อไปยังแอปอื่นได้ทันใจ
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 self-start md:self-auto">
          {onBackToHome && (
            <button 
              onClick={onBackToHome}
              className="text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 px-3.5 py-2.5 rounded-xl transition duration-200 cursor-pointer flex items-center gap-1.5 font-medium border border-slate-200 shadow-sm"
              title="สลับหน้าจอ / เปลี่ยนโหมด"
            >
              <Home className="w-4 h-4 text-slate-500" /> 
              หน้าแรก
            </button>
          )}

          {/* Connect to Sender via QR Scan / Code */}
          <button
            onClick={() => setIsScannerOpen(true)}
            className="text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3.5 py-2.5 rounded-xl transition duration-200 cursor-pointer flex items-center gap-1.5 font-semibold shadow-sm"
            title="สแกน QR Code หรือกรอกรหัสของเครื่องส่งเพื่อเชื่อมต่อ"
          >
            <Camera className="w-4 h-4 text-blue-600" />
            สแกน QR / กรอกรหัสเครื่องส่ง
          </button>

          {/* Active Session Badge with Generate New Button */}
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-mono font-bold text-emerald-800">
              {sessionId}
            </span>
            <button
              onClick={generateNewSession}
              className="text-emerald-600 hover:text-emerald-900 p-1 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer ml-1"
              title="สร้างรหัส Session ID ใหม่แบบไม่ซ้ำ"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid Content */}
      <div className="no-print grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: QR Code & Connection Info (Width 4 on lg) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white p-6 sm:p-7 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
            <div className="bg-blue-50 p-3.5 rounded-2xl mb-3 text-blue-600">
              <QrCode className="w-7 h-7" />
            </div>
            
            <h2 className="text-lg sm:text-xl font-display font-semibold text-gray-900 mb-1">
              QR Code ประจำเครื่องรับ
            </h2>
            <p className="text-gray-500 text-xs leading-relaxed mb-4">
              ให้เครื่องส่ง (มือถือ หรือคอมพิวเตอร์อีกเครื่อง) สแกนโค้ดนี้ หรือกรอกรหัส <strong className="text-blue-600 font-mono">{sessionId}</strong> เพื่อส่งไฟล์เข้ามา
            </p>

            {/* QR Code Container */}
            <div className="relative group bg-slate-50 p-4 rounded-2xl border border-gray-200/60 max-w-xs w-full mb-4">
              {shareUrl ? (
                <div className="relative flex flex-col items-center bg-white p-3 rounded-xl shadow-inner">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(shareUrl)}`} 
                    alt="Scan to upload"
                    className="w-44 h-44 sm:w-52 sm:h-52 object-contain"
                    referrerPolicy="no-referrer"
                  />
                  <div className="mt-2.5 flex items-center justify-between w-full text-xs">
                    <span className="font-mono text-slate-700 font-bold bg-slate-100 px-2.5 py-0.5 rounded-md">
                      ID: {sessionId}
                    </span>
                    <button
                      onClick={() => setIsQRZoomed(true)}
                      className="text-blue-600 hover:text-blue-700 flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <Maximize2 className="w-3.5 h-3.5" /> ซูมใหญ่
                    </button>
                  </div>
                </div>
              ) : (
                <div className="w-48 h-48 mx-auto bg-gray-100 rounded-xl flex flex-col items-center justify-center text-gray-400">
                  <RefreshCw className="w-7 h-7 animate-spin mb-2" />
                  <span className="text-xs">กำลังสร้าง QR Code...</span>
                </div>
              )}
            </div>

            {/* Copy Link & Scanner Buttons */}
            <div className="w-full space-y-2 pt-2 border-t border-gray-100">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={shareUrl} 
                  className="flex-1 bg-gray-50 border border-gray-200 text-gray-500 px-3 py-2 rounded-xl text-xs font-mono select-all truncate"
                />
                <button 
                  onClick={copyToClipboard}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 p-2.5 rounded-xl text-xs transition-colors font-medium flex items-center justify-center shadow-sm shrink-0 cursor-pointer"
                  title="คัดลอกลิงก์"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              {/* Scan Sender Button */}
              <button
                onClick={() => setIsScannerOpen(true)}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold py-2.5 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Camera className="w-4 h-4 text-blue-400" />
                สแกน QR Code หรือกรอกรหัสของเครื่องส่ง
              </button>
            </div>
          </div>

          {/* Transmission & Capability Stats */}
          <div className="bg-slate-900 text-white p-5 rounded-3xl shadow-lg border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" /> ข้อกำหนดการรับส่ง
              </span>
              <span className="bg-blue-500/20 text-blue-400 text-[10px] font-mono px-2 py-0.5 rounded-full border border-blue-500/30">
                ACTIVE
              </span>
            </div>
            
            <div className="space-y-2 text-xs text-slate-300">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">ขนาดไฟล์สูงสุด:</span>
                <span className="font-bold text-white font-mono">200 MB</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">การบันทึกไฟล์:</span>
                <span className="text-emerald-400 font-medium">เลือกโฟลเดอร์ได้เอง</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">การส่งต่อแอป:</span>
                <span className="text-indigo-400 font-medium">LINE, Drive, WhatsApp ฯลฯ</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">คิวในระบบขณะนี้:</span>
                <span className="font-bold text-white font-mono">{printJobs.length} รายการ</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Print & File Queue (Width 8 on lg) */}
        <div className="lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h2 className="text-xl font-display font-semibold text-gray-900 flex items-center gap-2">
              <Monitor className="w-5 h-5 text-gray-700" /> 
              คิวไฟล์และรูปภาพที่ได้รับ
              <span className="bg-blue-600 text-white text-xs px-2.5 py-0.5 rounded-full font-bold ml-1">
                {printJobs.length}
              </span>
            </h2>

            {printJobs.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveAll}
                  disabled={isSavingAll}
                  className="text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="บันทึกไฟล์ทั้งหมดในคิวลงเครื่อง"
                >
                  <Download className="w-3.5 h-3.5" />
                  บันทึกทั้งหมด
                </button>
                <button
                  onClick={handleClearAll}
                  disabled={isClearingAll}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-xl transition-colors border border-transparent hover:border-red-100 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  ล้างคิว
                </button>
              </div>
            )}
          </div>

          {/* Empty Queue State */}
          {printJobs.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-gray-200 rounded-3xl p-10 sm:p-12 text-center flex flex-col items-center justify-center min-h-[420px]">
              <div className="bg-blue-50 text-blue-500 p-5 rounded-2xl mb-4 shadow-sm">
                <ImageIcon className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-display font-bold text-gray-800 mb-1">
                กำลังรอรับไฟล์จากเครื่องส่ง...
              </h3>
              <p className="text-gray-400 text-xs sm:text-sm max-w-md mb-6 leading-relaxed">
                ใช้โทรศัพท์มือถือสแกน QR Code ทางซ้าย หรือใช้ปุ่ม <strong className="text-slate-700">"สแกน QR / กรอกรหัสเครื่องส่ง"</strong> ด้านบนเพื่อเชื่อมโยงกับเครื่องส่งได้ทันที
              </p>
              
              <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-gray-600">
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-xl">
                  <Clock className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
                  สแตนด์บายรับไฟล์ขนาดสูงสุด 200MB
                </div>
                <button
                  onClick={() => setIsScannerOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Camera className="w-3.5 h-3.5" />
                  เปิดกล้องสแกนเครื่องส่ง
                </button>
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
                      job.status === 'printed' ? 'border-emerald-200 shadow-emerald-500/5' : 'border-gray-100 shadow-slate-200/50'
                    } overflow-hidden flex flex-col group relative`}
                  >
                    {/* Status Badge */}
                    {job.status === 'printed' ? (
                      <div className="absolute top-3 left-3 bg-emerald-500 text-white text-[10px] uppercase font-bold tracking-wide px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm z-10">
                        <Check className="w-3 h-3" /> รับงานแล้ว
                      </div>
                    ) : (
                      <div className="absolute top-3 left-3 bg-blue-600 text-white text-[10px] uppercase font-bold tracking-wide px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm z-10 animate-pulse">
                        <Sparkles className="w-3 h-3" /> มาใหม่
                      </div>
                    )}

                    {/* Image / File Preview Box */}
                    <div className="relative aspect-[4/3] bg-slate-50 overflow-hidden border-b border-gray-100 flex items-center justify-center p-4">
                      {job.fileType === 'document' || job.fileType === 'other' ? (
                        <div className="flex flex-col items-center justify-center text-center p-4 h-full">
                          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm mb-2.5 ${
                            job.fileName?.endsWith('.pdf') 
                              ? 'bg-rose-50 text-rose-500 border border-rose-100'
                              : job.fileName?.match(/\.(zip|rar|7z|tar|gz)$/)
                              ? 'bg-amber-50 text-amber-500 border border-amber-100'
                              : 'bg-indigo-50 text-indigo-500 border border-indigo-100'
                          }`}>
                            {job.fileName?.endsWith('.pdf') ? (
                              <FileText className="w-8 h-8" />
                            ) : job.fileName?.match(/\.(zip|rar|7z|tar|gz)$/) ? (
                              <FileArchive className="w-8 h-8" />
                            ) : (
                              <File className="w-8 h-8" />
                            )}
                          </div>
                          
                          <span className="text-xs font-semibold text-slate-800 line-clamp-2 max-w-[200px] leading-relaxed">
                            {job.fileName}
                          </span>
                        </div>
                      ) : (
                        <img 
                          src={job.imageData} 
                          alt="Submitted print job" 
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500 cursor-pointer"
                          onClick={() => setSelectedJobForAction(job)}
                          referrerPolicy="no-referrer"
                        />
                      )}

                      {/* Floating actions on hover */}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3 justify-between z-10">
                        <span className="text-[10px] font-mono text-white/90">
                          {job.fileName || `ID: ${job.id.substring(0, 8)}`}
                        </span>
                        
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setSelectedJobForAction(job)}
                            className="bg-white/90 hover:bg-white text-slate-900 p-1.5 rounded-lg transition-colors shadow text-xs font-semibold flex items-center gap-1 cursor-pointer"
                            title="เลือกบันทึก / ส่งต่อ"
                          >
                            <Share2 className="w-3.5 h-3.5 text-blue-600" />
                          </button>
                          <button
                            onClick={() => handleDeleteJob(job.id)}
                            className="bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-lg transition-colors shadow cursor-pointer"
                            title="ลบออกจากคิว"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Info Card Body */}
                    <div className="p-4 flex flex-col flex-1 bg-white">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs text-gray-400 flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3" />
                            {formatTime(job.createdAt)}
                          </span>
                          <span className="text-xs font-semibold text-gray-800 mt-1 truncate" title={job.fileName}>
                            {job.fileName ? job.fileName : `ไฟล์ภาพที่ #${index + 1}`}
                          </span>
                        </div>
                        {job.fileSize && (
                          <span className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md font-mono shrink-0 font-semibold">
                            {job.fileSize}
                          </span>
                        )}
                      </div>

                      {/* Primary Action Button: Opens the Save / Share / Both Dialog */}
                      <div className="mt-auto space-y-2">
                        <button
                          onClick={() => setSelectedJobForAction(job)}
                          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-2.5 px-3.5 rounded-xl text-xs font-bold shadow-md shadow-blue-500/10 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          บันทึกโฟลเดอร์ / ส่งต่อแอปอื่น (เลือกได้)
                        </button>

                        {/* Quick Action Sub-bar */}
                        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
                          <button
                            onClick={() => handleQuickSave(job)}
                            className="flex-1 py-1.5 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg flex items-center justify-center gap-1 text-[11px] font-medium cursor-pointer transition-colors"
                            title="บันทึกลงโฟลเดอร์เครื่อง"
                          >
                            <FolderDown className="w-3.5 h-3.5 text-blue-600" />
                            บันทึก
                          </button>

                          <button
                            onClick={() => handleQuickShare(job)}
                            className="flex-1 py-1.5 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg flex items-center justify-center gap-1 text-[11px] font-medium cursor-pointer transition-colors"
                            title="ส่งต่อเข้าแอปพลิเคชัน"
                          >
                            <Share2 className="w-3.5 h-3.5 text-indigo-600" />
                            ส่งต่อแอป
                          </button>

                          {job.fileType === 'image' && (
                            <button
                              onClick={() => handlePrint(job)}
                              className="py-1.5 px-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg flex items-center justify-center text-[11px] font-medium cursor-pointer transition-colors"
                              title="สั่งพิมพ์ภาพ"
                            >
                              <Printer className="w-3.5 h-3.5 text-slate-600" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </div>

      {/* QR Code Zoom Modal */}
      {isQRZoomed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center space-y-4 shadow-2xl border border-slate-100">
            <h3 className="font-display font-bold text-slate-900 text-xl">
              QR Code เครื่องรับ
            </h3>
            <p className="text-xs text-slate-500">
              หันกล้องมือถือสแกน หรือกรอกรหัส <strong className="text-blue-600 font-mono text-sm">{sessionId}</strong>
            </p>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex justify-center">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(shareUrl)}`} 
                alt="QR Code Zoomed"
                className="w-64 h-64 object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <button
              onClick={() => setIsQRZoomed(false)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-xl text-xs cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}

      {/* QR Scanner Modal (For Receiver scanning Sender QR or entering code) */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScannedSenderCode}
        title="สแกน QR Code หรือกรอกรหัสเครื่องส่ง"
        subtitle="เครื่องรับสามารถสแกน QR Code ของเครื่องส่ง หรือกรอกรหัส Session เพื่อเชื่อมต่อได้"
      />

      {/* File Action Modal: Save to folder / Share to apps / Both */}
      <FileActionModal
        job={selectedJobForAction}
        isOpen={selectedJobForAction !== null}
        onClose={() => setSelectedJobForAction(null)}
        onPrint={handlePrint}
        onJobStatusChange={(jobId, status) => {
          try {
            const docRef = doc(db, 'printJobs', jobId);
            updateDoc(docRef, { status });
          } catch (e) {
            console.error('Update status error:', e);
          }
        }}
      />
    </div>
  );
}
