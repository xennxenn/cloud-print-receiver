import React, { useState, useRef, useEffect } from 'react';
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
  ArrowRight,
  File,
  FileText,
  FileArchive,
  ArrowLeft,
  QrCode,
  Camera,
  RefreshCw,
  Maximize2,
  Sliders,
  Check,
  Send,
  HelpCircle,
  AlertTriangle
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import QRScannerModal from './QRScannerModal';

interface MobileViewProps {
  sessionId: string;
  onBackToHome?: () => void;
  onSessionChange?: (newSessionId: string) => void;
}

const getFileTypeCategory = (mime: string, name: string): 'image' | 'document' | 'other' => {
  if (mime.startsWith('image/')) return 'image';
  const docExtensions = ['.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.rtf'];
  const nameLower = name.toLowerCase();
  const isDocExtension = docExtensions.some(ext => nameLower.endsWith(ext));
  if (
    mime.startsWith('text/') || 
    mime.includes('pdf') || 
    mime.includes('word') || 
    mime.includes('excel') || 
    mime.includes('spreadsheet') || 
    mime.includes('presentation') || 
    isDocExtension
  ) {
    return 'document';
  }
  return 'other';
};

export default function MobileView({ sessionId, onBackToHome, onSessionChange }: MobileViewProps) {
  const [uploading, setUploading] = useState(false);
  const [statusText, setStatusText] = useState<'idle' | 'uploading' | 'saving' | 'success'>('idle');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [senderName, setSenderName] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Upload Progress & Options
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [uploadedBytes, setUploadedBytes] = useState<number>(0);
  const [imageQualityMode, setImageQualityMode] = useState<'original' | 'compressed'>('original');

  // QR Modals
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isShowMyQROpen, setIsShowMyQROpen] = useState(false);
  const [manualCodeInput, setManualCodeInput] = useState('');
  const [isChangingSession, setIsChangingSession] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to format bytes up to 200MB nicely
  const formatBytes = (bytes: number, decimals = 1) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
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
    // 200MB hard limit as requested
    const MAX_SIZE = 200 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert(`ขนาดไฟล์เกิน 200 MB! (ไฟล์ของคุณขนาด ${formatBytes(file.size)}) กรุณาเลือกไฟล์ที่มีขนาดไม่เกิน 200 MB ครับ`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    
    setSelectedFile(file);
    setUploadPercent(0);
    setUploadedBytes(0);

    const isImg = file.type.startsWith('image/');
    if (isImg) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPreviewImage('FILE_PLACEHOLDER');
    }
  };

  // Optional fast compression for quick photo transfers
  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1600; // High resolution 1600px
          const scaleSize = img.width > MAX_WIDTH ? (MAX_WIDTH / img.width) : 1;
          canvas.width = img.width * scaleSize;
          canvas.height = img.height * scaleSize;
          
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          } else {
            reject(new Error('Canvas Context Error'));
            return;
          }
          
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas toBlob failed'));
          }, 'image/jpeg', 0.85);
        };
        img.onerror = () => reject(new Error('Image loading failed'));
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Upload file with XHR for accurate 0-100% progress up to 200MB
  const uploadFileToServer = (fileToUpload: Blob | File, originalFilename: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', fileToUpload, originalFilename);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadPercent(percent);
          setUploadedBytes(event.loaded);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (e) {
            reject(new Error('Invalid response from server'));
          }
        } else {
          try {
            const errRes = JSON.parse(xhr.responseText);
            reject(new Error(errRes.error || `Upload failed with status ${xhr.status}`));
          } catch (e) {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่ายระหว่างอัปโหลด'));
      xhr.open('POST', '/api/upload', true);
      xhr.send(formData);
    });
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setStatusText('uploading');
    setUploadError(null);
    setUploadPercent(0);

    try {
      let fileToSend: Blob | File = selectedFile;

      // If user selected compressed mode for images
      if (selectedFile.type.startsWith('image/') && imageQualityMode === 'compressed') {
        fileToSend = await compressImage(selectedFile);
      }

      // Step 1: Upload to Server (Supports up to 200MB)
      const uploadResult = await uploadFileToServer(fileToSend, selectedFile.name);
      
      // Step 2: Register in Firestore Realtime Queue
      setStatusText('saving');
      const fileCategory = getFileTypeCategory(selectedFile.type, selectedFile.name);
      const jobsRef = collection(db, 'printJobs');
      
      await addDoc(jobsRef, {
        sessionId: sessionId,
        imageData: uploadResult.fileUrl, // Store file URL to be accessed by receiver
        createdAt: serverTimestamp(),
        status: 'pending',
        fileName: selectedFile.name,
        fileSize: formatBytes(selectedFile.size),
        fileType: fileCategory,
        mimeType: selectedFile.type || 'application/octet-stream',
        senderName: senderName.trim() || 'เครื่องส่ง'
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
    setUploadPercent(0);
    setUploadedBytes(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const generateNewSession = () => {
    const newCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    if (onSessionChange) {
      onSessionChange(newCode);
    }
  };

  const handleManualCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualCodeInput.trim().toUpperCase();
    if (clean.length < 3) {
      alert('กรุณากรอกรหัส Session อย่างน้อย 3 ตัวอักษร');
      return;
    }
    if (onSessionChange) {
      onSessionChange(clean);
    }
    setIsChangingSession(false);
    setManualCodeInput('');
  };

  const shareUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}?session=${sessionId}` 
    : `https://demo.app?session=${sessionId}`;

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen shadow-2xl flex flex-col justify-between relative font-sans">
      {/* Phone View Header */}
      <header className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-blue-800 text-white p-6 rounded-b-[2.5rem] shadow-lg shadow-indigo-500/20 text-center relative overflow-hidden">
        {/* Decorative dynamic circles */}
        <div className="absolute -top-12 -left-12 w-32 h-32 bg-white/5 rounded-full blur-xl pointer-events-none" />
        <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
        
        {onBackToHome && (
          <button 
            onClick={onBackToHome}
            className="absolute top-4 left-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl transition duration-200 cursor-pointer flex items-center gap-1"
            title="กลับไปหน้าหลัก"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}

        {/* Top Right Quick Action: Show QR / Scan */}
        <div className="absolute top-4 right-4 flex items-center gap-1.5">
          <button
            onClick={() => setIsShowMyQROpen(true)}
            className="text-white/90 hover:text-white bg-white/15 hover:bg-white/25 p-2 rounded-xl transition duration-200 cursor-pointer"
            title="แสดง QR Code ของเครื่องส่งให้เครื่องรับสแกน"
          >
            <QrCode className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsScannerOpen(true)}
            className="text-white/90 hover:text-white bg-white/15 hover:bg-white/25 p-2 rounded-xl transition duration-200 cursor-pointer"
            title="สแกน QR Code ของเครื่องรับ"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>

        <Smartphone className="w-10 h-10 mb-2 mx-auto text-indigo-100 mt-2" />
        <h1 className="text-2xl font-display font-bold tracking-tight">เครื่องส่งไฟล์และรูปภาพ</h1>
        <p className="text-indigo-100/90 text-xs mt-0.5">
          ส่งไฟล์ขนาดใหญ่ได้สูงสุด <span className="font-bold underline decoration-amber-300">200 MB</span>
        </p>

        {/* Pairing Bar */}
        <div className="mt-3 inline-flex items-center gap-2 bg-black/25 backdrop-blur-md px-3.5 py-1.5 rounded-2xl text-xs font-mono">
          <CloudLightning className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
          <span>Session: <strong className="text-white font-bold">{sessionId}</strong></span>
          <button
            onClick={() => setIsChangingSession(true)}
            className="text-indigo-200 hover:text-white underline text-[11px] ml-1 cursor-pointer"
          >
            เปลี่ยนรหัส
          </button>
        </div>
      </header>

      {/* Main interaction Container */}
      <main className="flex-1 p-4 sm:p-5 flex flex-col justify-center -mt-6 relative z-20">
        <div className="w-full bg-white rounded-3xl shadow-xl border border-gray-100/80 p-5 sm:p-7">
          <input 
            type="file" 
            accept="*/*" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileChange}
            disabled={uploading}
          />

          {/* Quick Dual Pairing Options bar */}
          <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-100 rounded-2xl mb-4 text-xs">
            <button
              onClick={() => setIsShowMyQROpen(true)}
              className="flex-1 py-1.5 px-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-700 font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5 text-indigo-600" />
              โชว์ QR ให้เครื่องรับสแกน
            </button>
            <button
              onClick={() => setIsScannerOpen(true)}
              className="flex-1 py-1.5 px-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-700 font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-blue-600" />
              สแกน QR เครื่องรับ
            </button>
          </div>

          <AnimatePresence mode="wait">
            {/* Step 1: Idle Dropzone */}
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
                className={`border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center select-none cursor-pointer transition-all duration-300 ${
                  isDragging 
                    ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]' 
                    : 'border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-slate-50'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500/10 to-blue-500/10 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-indigo-100 shadow-sm">
                  <Upload className="w-8 h-8" />
                </div>
                
                <h3 className="text-base font-bold text-slate-800 mb-1">
                  แตะเพื่อเลือกไฟล์ หรือถ่ายภาพ
                </h3>
                <p className="text-xs text-slate-400 max-w-[240px] mx-auto leading-relaxed">
                  รองรับรูปภาพความละเอียดสูง, เอกสาร PDF, Word, Excel, ZIP และวิดีโอ (สูงสุด 200 MB)
                </p>

                <div className="mt-5 inline-flex items-center gap-2 bg-white border border-slate-200 shadow-sm px-4 py-2 rounded-2xl text-xs font-bold text-slate-700 hover:text-indigo-600">
                  <ImageIcon className="w-4 h-4 text-indigo-500" />
                  เลือกไฟล์จากเครื่อง (สูงสุด 200MB)
                </div>
              </motion.div>
            )}

            {/* Step 2: Selected File Preview & Quality Settings */}
            {previewImage && statusText === 'idle' && !uploadError && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-4"
              >
                {/* Preview Box */}
                <div className="relative aspect-[4/3] bg-slate-900 rounded-2xl overflow-hidden shadow-inner border border-slate-800 flex items-center justify-center p-4">
                  {previewImage === 'FILE_PLACEHOLDER' ? (
                    <div className="flex flex-col items-center text-center text-slate-300">
                      <div className="w-16 h-16 bg-slate-800 rounded-2xl border border-slate-700 flex items-center justify-center text-indigo-400 mb-2 shadow-lg">
                        {selectedFile?.name.endsWith('.pdf') ? (
                          <FileText className="w-8 h-8 text-rose-400" />
                        ) : selectedFile?.name.match(/\.(zip|rar|7z|tar|gz)$/) ? (
                          <FileArchive className="w-8 h-8 text-amber-400" />
                        ) : (
                          <File className="w-8 h-8 text-sky-400" />
                        )}
                      </div>
                      <span className="text-xs font-semibold max-w-[200px] truncate text-white block">
                        {selectedFile?.name}
                      </span>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        {selectedFile?.type || 'ไม่ระบุประเภท'}
                      </span>
                    </div>
                  ) : (
                    <img 
                      src={previewImage} 
                      alt="Current file selection"
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  )}

                  <button
                    onClick={resetSelectors}
                    className="absolute top-3 right-3 bg-rose-500 hover:bg-rose-600 text-white p-2 rounded-xl transition-colors shadow-lg cursor-pointer"
                    title="ยกเลิกไฟล์นี้"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  {selectedFile && (
                    <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md text-white text-[11px] font-mono px-2.5 py-1 rounded-lg font-bold border border-white/10">
                      {formatBytes(selectedFile.size)}
                    </div>
                  )}
                </div>

                {/* Quality Toggle for Images */}
                {selectedFile?.type.startsWith('image/') && (
                  <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1.5 text-xs">
                    <span className="font-semibold text-slate-600 block">
                      คุณภาพการส่งรูปภาพ:
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setImageQualityMode('original')}
                        className={`flex-1 py-1.5 px-2 rounded-xl font-medium transition-all cursor-pointer ${
                          imageQualityMode === 'original'
                            ? 'bg-blue-600 text-white shadow-sm font-bold'
                            : 'bg-white text-slate-700 border border-slate-200'
                        }`}
                      >
                        คมชัดสูงสุด (ต้นฉบับ)
                      </button>
                      <button
                        type="button"
                        onClick={() => setImageQualityMode('compressed')}
                        className={`flex-1 py-1.5 px-2 rounded-xl font-medium transition-all cursor-pointer ${
                          imageQualityMode === 'compressed'
                            ? 'bg-blue-600 text-white shadow-sm font-bold'
                            : 'bg-white text-slate-700 border border-slate-200'
                        }`}
                      >
                        บีบอัดเร็ว (Fast)
                      </button>
                    </div>
                  </div>
                )}

                {/* Sender Name Input */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    ระบุชื่อผู้ส่ง (ทางเลือก)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input 
                      type="text" 
                      placeholder="เช่น สมชาย, โต๊ะ 3, แผนกออกแบบ..." 
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      maxLength={40}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2.5 pt-1">
                  <button 
                    onClick={resetSelectors}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer"
                  >
                    เปลี่ยนไฟล์
                  </button>
                  <button 
                    onClick={handleUpload}
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold py-3 rounded-2xl text-xs shadow-md shadow-indigo-600/10 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    ส่งไฟล์ทันที (200MB) <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Real Upload Progress Bar */}
            {(statusText === 'uploading' || statusText === 'saving') && (
              <motion.div
                key="loading-state"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center py-6 text-center"
              >
                <div className="relative mb-4">
                  <Loader2 className="animate-spin w-12 h-12 text-indigo-600" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
                  </div>
                </div>

                <h3 className="text-base font-bold text-slate-800">
                  {statusText === 'uploading' 
                    ? `กำลังส่งไฟล์... ${uploadPercent}%` 
                    : 'กำลังบันทึกลงคิวของเครื่องรับ...'}
                </h3>
                
                <p className="text-xs text-slate-500 mt-1">
                  {selectedFile && `${formatBytes(uploadedBytes)} / ${formatBytes(selectedFile.size)}`}
                </p>

                {/* Real-time Percentage Bar */}
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mt-4 max-w-xs border border-slate-200">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-600"
                    style={{ width: `${uploadPercent}%` }}
                    transition={{ ease: 'linear' }}
                  />
                </div>
              </motion.div>
            )}

            {/* Step 4: Successful Upload Card */}
            {statusText === 'success' && (
              <motion.div
                key="success-card"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center py-6 text-center text-emerald-600"
              >
                <div className="bg-emerald-50 text-emerald-500 p-4 rounded-full mb-3 border border-emerald-100">
                  <CheckCircle2 className="w-14 h-14" />
                </div>
                
                <h2 className="text-xl font-bold text-slate-900 mb-1">
                  ส่งไฟล์สำเร็จแล้ว!
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed max-w-[250px] mb-6">
                  ไฟล์ขนาด <span className="font-semibold text-slate-700">{selectedFile && formatBytes(selectedFile.size)}</span> ปรากฏบนหน้าจอเครื่องรับเรียบร้อยแล้ว
                </p>

                <button 
                  onClick={resetSelectors}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-2xl text-xs shadow-md shadow-emerald-600/10 active:scale-95 transition-all cursor-pointer"
                >
                  เลือกส่งไฟล์ต่อไป
                </button>
              </motion.div>
            )}

            {/* Step 5: Upload Error Card */}
            {uploadError && (
              <motion.div
                key="error-card"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 0.9 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center py-4 text-center text-rose-600"
              >
                <div className="bg-rose-50 text-rose-500 p-3.5 rounded-full mb-3 border border-rose-100">
                  <CloudLightning className="w-10 h-10" />
                </div>
                
                <h2 className="text-base font-bold text-slate-900 mb-1">
                  เกิดข้อผิดพลาดในการส่งข้อมูล
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed max-w-[260px] mb-3">
                  {uploadError}
                </p>

                <div className="flex gap-2 w-full mt-2">
                  <button 
                    onClick={resetSelectors}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs cursor-pointer"
                  >
                    เลือกไฟล์อื่นใหม่
                  </button>
                  <button 
                    onClick={handleUpload}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-2xl text-xs shadow-md shadow-blue-500/10 cursor-pointer"
                  >
                    ลองใหม่อีกครั้ง
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-[10px] text-slate-400 bg-slate-100 font-mono tracking-wider border-t border-slate-200">
        CLOUD TRANSFER (MAX 200MB) • SESSION: {sessionId}
      </footer>

      {/* MODAL 1: Show Sender's QR Code for Receiver to scan */}
      {isShowMyQROpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl border border-slate-100">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto border border-indigo-100">
              <QrCode className="w-6 h-6" />
            </div>
            
            <h3 className="font-display font-bold text-slate-900 text-lg">
              QR Code ของเครื่องส่งนี้
            </h3>
            <p className="text-xs text-slate-500">
              ให้เครื่องรับสแกน QR Code นี้ หรือกรอกรหัส <strong className="text-indigo-600 font-mono text-sm">{sessionId}</strong> เพื่อเชื่อมโยงห้องเดียวกัน
            </p>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex justify-center">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(shareUrl)}`} 
                alt="Sender QR Code"
                className="w-48 h-48 object-contain"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={generateNewSession}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer"
                title="สร้างรหัสใหม่เฉพาะงานนี้"
              >
                <RefreshCw className="w-3.5 h-3.5" /> สร้างรหัสใหม่
              </button>
              <button
                onClick={() => setIsShowMyQROpen(false)}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl text-xs cursor-pointer shadow-md shadow-indigo-600/10"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Change Session / Manual Input */}
      {isChangingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl border border-slate-100">
            <h3 className="font-display font-bold text-slate-900 text-lg text-center">
              เปลี่ยนรหัสห้องเครื่องรับ (Session ID)
            </h3>
            <p className="text-xs text-slate-500 text-center">
              กรอกรหัส Session ID ของเครื่องรับที่คุณต้องการส่งไฟล์ไป หรือกดปุ่มสุ่มรหัสใหม่
            </p>

            <form onSubmit={handleManualCodeSubmit} className="space-y-3">
              <input
                type="text"
                placeholder="เช่น TR-8942 หรือ ZRSAZ778"
                value={manualCodeInput}
                onChange={(e) => setManualCodeInput(e.target.value)}
                autoFocus
                className="w-full text-center font-mono font-bold text-base bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-indigo-500 tracking-wider uppercase"
              />

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsChangingSession(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-xs cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl text-xs shadow-md shadow-indigo-600/10 cursor-pointer"
                >
                  บันทึก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: QR Scanner Modal (For scanning Receiver's QR or entering manual code) */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={(code) => {
          if (onSessionChange) {
            onSessionChange(code);
          }
        }}
        title="สแกน QR Code ของเครื่องรับ"
        subtitle="หันกล้องไปที่หน้าจอเครื่องรับ หรือเลือกภาพถ่าย QR Code"
      />
    </div>
  );
}
