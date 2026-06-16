import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Smartphone, 
  Upload, 
  Image as ImageIcon, 
  Loader2, 
  CheckCircle2, 
  Trash2,
  Sparkles,
  CloudLightning,
  User,
  ArrowRight
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface MobileViewProps {
  sessionId: string;
}

export default function MobileView({ sessionId }: MobileViewProps) {
  const [uploading, setUploading] = useState(false);
  const [statusText, setStatusText] = useState<'idle' | 'compressing' | 'uploading' | 'success'>('idle');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [senderName, setSenderName] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to format bytes
  const formatBytes = (bytes: number, decimals = 1) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Drag and drop event handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0]);
    }
  };

  const processSelectedFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพเท่านั้นครับ');
      return;
    }
    setSelectedFile(file);

    // Create local preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800; // Resize to max 800px width for fast cloud routing
          const scaleSize = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;
          
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          } else {
            reject(new Error('Canvas 2D Context initialization failed'));
            return;
          }
          
          // Output as JPEG with 0.7 quality to ensure small sized base64 string (typically < 100KB)
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
          resolve(compressedBase64);
        };
        img.onerror = () => {
          reject(new Error('Image loading failed'));
        };
      };
      reader.onerror = () => {
        reject(new Error('File reading failed'));
      };
    });
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setStatusText('compressing');
    setUploadError(null);

    try {
      // Step 1: Compress picture
      const base64Image = await compressImage(selectedFile);
      
      // Step 2: Upload to firestore
      setStatusText('uploading');
      
      const fileLabel = senderName.trim() 
        ? `ส่งโดย: ${senderName.trim()}` 
        : `มือถือ (${selectedFile.name})`;

      const jobsRef = collection(db, 'printJobs');
      await addDoc(jobsRef, {
        sessionId: sessionId,
        imageData: base64Image,
        createdAt: serverTimestamp(),
        status: 'pending',
        fileName: fileLabel,
        fileSize: formatBytes(selectedFile.size)
      });

      setStatusText('success');
    } catch (error: any) {
      console.error("Upload failed:", error);
      setUploadError(error?.message || String(error));
      setStatusText('idle');
      setUploading(false);
    }
  };

  const resetSelectors = () => {
    setSelectedFile(null);
    setPreviewImage(null);
    setStatusText('idle');
    setUploadError(null);
    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen shadow-2xl flex flex-col justify-between">
      {/* Phone View Header */}
      <header className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-6 rounded-b-[2.5rem] shadow-lg shadow-blue-500/10 text-center relative overflow-hidden">
        {/* Decorative dynamic circles */}
        <div className="absolute -top-12 -left-12 w-32 h-32 bg-white/5 rounded-full blur-xl" />
        <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-white/10 rounded-full blur-xl" />
        
        <Smartphone className="w-12 h-12 mb-3 mx-auto text-blue-100" />
        <h1 className="text-2xl font-display font-bold tracking-tight">ส่งรูปลงเครื่องปริ้น</h1>
        <p className="text-blue-100/80 text-sm mt-1">อัปโหลดภาพด่วนจากสมาร์ทโฟนของคุณ</p>

        {/* Info panel showing connection status */}
        <div className="mt-4 inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-mono">
          <CloudLightning className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
          Connected to Receiver #{sessionId.substring(0, 8)}
        </div>
      </header>

      {/* Main interaction Container */}
      <main className="flex-1 p-5 flex flex-col justify-center -mt-8 relative z-20">
        <div className="w-full bg-white rounded-3xl shadow-xl border border-gray-100/80 p-6 sm:p-8">
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileChange}
            disabled={uploading}
          />

          <AnimatePresence mode="wait">
            {statusText === 'idle' && !previewImage && !uploadError && (
              <motion.div
                key="dropzone"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-6 text-center select-none cursor-pointer transition-all duration-300 ${
                  isDragging 
                    ? 'border-blue-500 bg-blue-50/50 scale-[1.01]' 
                    : 'border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-slate-50'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-16 h-16 bg-blue-500/5 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100">
                  <Upload className="w-7 h-7" />
                </div>
                
                <h3 className="text-base font-semibold text-slate-800 mb-1">
                  แตะเพื่อถ่ายรูป หรือ เลือกรูปภาพ
                </h3>
                <p className="text-xs text-slate-400 max-w-[240px] mx-auto leading-relaxed">
                  รองรับการลากไฟล์รูปภาพมาวางได้โดยตรง ระบบบีบอัดความละเอียดอัตโนมัติ
                </p>

                <div className="mt-5 inline-flex items-center gap-1.5 bg-white border border-slate-100 shadow-sm px-3.5 py-1.5 rounded-full text-xs font-semibold text-slate-700">
                  <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                  Select Image File
                </div>
              </motion.div>
            )}

            {/* Editing/Preview State before pressing Upload */}
            {previewImage && statusText === 'idle' && !uploadError && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-5"
              >
                {/* Crop or View container */}
                <div className="relative aspect-[4/3] bg-slate-900 rounded-2xl overflow-hidden shadow-inner border border-slate-100">
                  <img 
                    src={previewImage} 
                    alt="Current file selection"
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                  <button
                    onClick={resetSelectors}
                    className="absolute top-3 right-3 bg-rose-500 hover:bg-rose-600 text-white p-2 rounded-xl transition-colors shadow-lg shadow-rose-500/20"
                    title="ยกเลิกภาพนี้"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {selectedFile && (
                    <div className="absolute bottom-3 left-3 bg-slate-950/70 backdrop-blur-md text-white text-[10px] font-mono px-2.5 py-1 rounded-lg">
                      {formatBytes(selectedFile.size)}
                    </div>
                  )}
                </div>

                {/* Caption / Sender Name form */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                    เพิ่มชื่อของคุณ (ทางเลือก)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input 
                      type="text" 
                      placeholder="ใส่ชื่อหรือข้อความกำกับรูปภาพ..." 
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      maxLength={40}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Action CTA Buttons */}
                <div className="flex gap-3 pt-1">
                  <button 
                    onClick={resetSelectors}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-2xl text-sm transition-all focus:outline-none"
                  >
                    เปลี่ยนรูปใหม่
                  </button>
                  <button 
                    onClick={handleUpload}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3.5 rounded-2xl text-sm shadow-md shadow-blue-600/10 active:scale-95 transition-all flex items-center justify-center gap-1.5 focus:outline-none"
                  >
                    ส่งภาพทันที <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* In-Progress Compression & Cloud Upload Statuses */}
            {(statusText === 'compressing' || statusText === 'uploading') && (
              <motion.div
                key="loading-state"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center py-8 text-center"
              >
                <div className="relative mb-5">
                  <Loader2 className="animate-spin w-14 h-14 text-blue-500" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
                  </div>
                </div>

                <h3 className="text-lg font-semibold text-slate-800">
                  {statusText === 'compressing' ? 'ระบบกำลังบีบอัดรูปภาพ...' : 'กำลังส่งรูปภาพไปยัง Receiver...'}
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
                  {statusText === 'compressing' 
                    ? 'ปรับขนาดไฟล์รูปเพื่อให้อัปโหลดเข้าเครื่องปริ้นได้อย่างรวดเร็วพิเศษ' 
                    : 'กำลังอัปโหลดผ่านเซิร์ฟเวอร์แบบเรียลไทม์'}
                </p>

                {/* Simulated bar progress indicators */}
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-6 max-w-xs">
                  <motion.div 
                    className="h-full bg-blue-600"
                    initial={{ width: '0%' }}
                    animate={{ width: statusText === 'compressing' ? '40%' : '85%' }}
                    transition={{ duration: 1.5, ease: 'easeOut' }}
                  />
                </div>
              </motion.div>
            )}

            {/* Succesful upload screen wrapper */}
            {statusText === 'success' && (
              <motion.div
                key="success-card"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center py-6 text-center text-emerald-600"
              >
                <div className="bg-emerald-50 text-emerald-500 p-4 rounded-full mb-4 border border-emerald-100">
                  <CheckCircle2 className="w-16 h-16 animate-bounce" />
                </div>
                
                <h2 className="text-xl font-bold text-slate-900 mb-1">
                  ส่งรูปภาพสำเร็จแล้ว!
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed max-w-[240px] mb-6">
                  รูปของคุณได้ไปปรากฏอยู่บนหน้าจอคอมพิวเตอร์และคิวพิมพ์เรียบร้อยแล้ว
                </p>

                <button 
                  onClick={resetSelectors}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-2xl text-sm shadow-md shadow-emerald-600/10 active:scale-95 transition-all"
                >
                  เลือกรูปอื่นเพื่อส่งเพิ่ม
                </button>
              </motion.div>
            )}

            {/* Upload Error / Diagnostics Card */}
            {uploadError && (
              <motion.div
                key="error-card"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center py-4 text-center text-rose-600"
              >
                <div className="bg-rose-50 text-rose-500 p-4 rounded-full mb-4 border border-rose-100">
                  <CloudLightning className="w-12 h-12" />
                </div>
                
                <h2 className="text-lg font-bold text-slate-900 mb-1">
                  เกิดข้อผิดพลาดในการส่งรูปภาพ
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed max-w-[260px] mb-4">
                  ไม่สามารถบันทึกข้อมูลลงฐานข้อมูล Firebase ได้สำเร็จ กรุณาตรวจสอบการตั้งค่าหลักดังนี้:
                </p>

                <div className="bg-slate-50 rounded-2xl p-4 text-left space-y-2.5 text-xs border border-slate-100 w-full mb-5 text-slate-700">
                  <div className="font-semibold text-[10px] text-slate-500 uppercase tracking-wider font-mono">
                    คู่มือตรวจสอบแก้ไขปัญหา (Troubleshooting):
                  </div>
                  <div className="space-y-2 text-[11px] leading-relaxed">
                    <p>
                      <strong>1. ตั้งค่า Security Rules หรือยัง?</strong><br />
                      หากข้อผิดพลาดแสดง <code className="font-mono text-rose-600 bg-rose-50 px-1 rounded">permission-denied</code> โปรดนำเนื้อหาของไฟล์ <code className="font-mono bg-slate-200 px-1 rounded text-slate-700">firestore.rules</code> (อยู่บนเครื่อง Host หรือในโปรเจกต์) ไปวางทับ Rules ในหน้า Console ของ Firestore
                    </p>
                    <p>
                      <strong>2. ตาราง/Collection ไม่ถูกเปิดใช้งาน?</strong><br />
                      เครื่อง Host และเครื่อง Mobile ต้องใช้แอมป์ DB ตัวเดียวกัน และสร้างฐานข้อมูลในโหมด <span className="font-medium text-slate-800">"Native Mode"</span> ในโปรเจกต์ Firebase ของคุณ
                    </p>
                    <p>
                      <strong>ข้อผิดพลาดทางเทคนิค (Raw Error):</strong>
                      <div className="mt-1 bg-slate-900 text-red-400 p-2 rounded-lg font-mono text-[9px] break-all max-h-20 overflow-y-auto">
                        {uploadError}
                      </div>
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 w-full">
                  <button 
                    onClick={resetSelectors}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-2xl text-xs"
                  >
                    เลือกภาพใหม่
                  </button>
                  <button 
                    onClick={handleUpload}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-2xl text-xs shadow-md shadow-blue-500/10 cursor-pointer"
                  >
                    ลองใหม่อีกครั้ง
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Styled Footer */}
      <footer className="p-5 text-center text-[10px] text-slate-400 bg-slate-100 font-mono tracking-wider border-t border-slate-200">
        POWERED BY CLOUD PRINT REAL-TIME • SESSION: {sessionId}
      </footer>
    </div>
  );
}
