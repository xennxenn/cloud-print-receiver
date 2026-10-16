import React, { useState } from 'react';
import { 
  X, 
  Download, 
  Share2, 
  Sparkles, 
  Printer, 
  Check, 
  Copy, 
  ExternalLink, 
  FolderDown, 
  Send, 
  FileText, 
  FileArchive, 
  File as FileIcon,
  Loader2,
  Clock,
  User
} from 'lucide-react';
import { PrintJob } from '../types';
import { getJobBlob, saveFileWithPicker, shareFileToApps } from '../utils/fileActions';

interface FileActionModalProps {
  job: PrintJob | null;
  isOpen: boolean;
  onClose: () => void;
  onPrint?: (job: PrintJob) => void;
  onJobStatusChange?: (jobId: string, status: 'printed') => void;
}

export default function FileActionModal({
  job,
  isOpen,
  onClose,
  onPrint,
  onJobStatusChange
}: FileActionModalProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showShareFallback, setShowShareFallback] = useState(false);

  if (!isOpen || !job) return null;

  const fileName = job.fileName || `file_${job.id.substring(0, 6)}`;
  const fileUrl = job.imageData;

  const notify = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3500);
  };

  // 1. Choose location and save file
  const handleSaveToFolder = async () => {
    try {
      setLoadingAction('save');
      const blob = await getJobBlob(job.imageData, job.mimeType);
      const result = await saveFileWithPicker(blob, fileName, job.mimeType);
      
      if (result.success) {
        notify(
          result.method === 'picker' 
            ? 'บันทึกไฟล์ลงโฟลเดอร์ที่คุณเลือกเรียบร้อยแล้ว!' 
            : 'ดาวน์โหลดไฟล์ลงเครื่องสำเร็จแล้ว!',
          'success'
        );
        if (onJobStatusChange) onJobStatusChange(job.id, 'printed');
      } else if (result.canceled) {
        notify('ยกเลิกการเลือกโฟลเดอร์บันทึก', 'info');
      }
    } catch (err: any) {
      console.error('Save error:', err);
      notify('เกิดข้อผิดพลาดในการบันทึกไฟล์: ' + (err?.message || ''), 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  // 2. Share / Forward to other applications
  const handleShareToApps = async () => {
    try {
      setLoadingAction('share');
      setShowShareFallback(false);
      const blob = await getJobBlob(job.imageData, job.mimeType);
      const result = await shareFileToApps(blob, fileName, job.mimeType);

      if (result.success) {
        notify('ส่งต่อไปยัง Application สำเร็จแล้ว!', 'success');
        if (onJobStatusChange) onJobStatusChange(job.id, 'printed');
      } else if (result.canceled) {
        notify('ยกเลิกการแชร์', 'info');
      } else if (result.fallback) {
        setShowShareFallback(true);
        notify('เบราว์เซอร์นี้ไม่มีเมนูแชร์แอปของระบบ จึงเปิดตัวเลือกส่งต่อด้านล่างให้ครับ', 'info');
      }
    } catch (err: any) {
      console.error('Share error:', err);
      setShowShareFallback(true);
    } finally {
      setLoadingAction(null);
    }
  };

  // 3. Do Both: Save to selected location AND Forward to Apps
  const handleBoth = async () => {
    try {
      setLoadingAction('both');
      const blob = await getJobBlob(job.imageData, job.mimeType);
      
      // Step A: Save
      const saveRes = await saveFileWithPicker(blob, fileName, job.mimeType);
      
      // Step B: Share
      const shareRes = await shareFileToApps(blob, fileName, job.mimeType);

      if (saveRes.success && shareRes.success) {
        notify('บันทึกไฟล์และส่งต่อไปยังแอปเรียบร้อยทั้งคู่!', 'success');
        if (onJobStatusChange) onJobStatusChange(job.id, 'printed');
      } else if (saveRes.success && shareRes.fallback) {
        setShowShareFallback(true);
        notify('บันทึกไฟล์สำเร็จแล้ว! และเปิดตัวเลือกส่งต่อแอปให้ด้านล่างครับ', 'success');
      } else if (saveRes.success) {
        notify('บันทึกไฟล์ลงเครื่องเรียบร้อยแล้ว!', 'success');
      }
    } catch (err: any) {
      console.error('Both action error:', err);
      notify('เกิดข้อผิดพลาด: ' + (err?.message || ''), 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCopyLink = async () => {
    try {
      const fullUrl = fileUrl.startsWith('http') ? fileUrl : `${window.location.origin}${fileUrl}`;
      await navigator.clipboard.writeText(fullUrl);
      setCopiedLink(true);
      notify('คัดลอกลิงก์ไฟล์เรียบร้อยแล้ว สามารถนำไปวางส่งต่อได้ทันที', 'success');
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (e) {
      console.error('Copy link failed:', e);
    }
  };

  const handleOpenInNewTab = () => {
    window.open(fileUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in font-sans">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shadow-sm">
              <FolderDown className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-slate-900 text-lg">
                เลือกวิธีบันทึกและส่งต่อไฟล์
              </h3>
              <p className="text-xs text-slate-500">
                คุณสามารถเลือกบันทึกลงโฟลเดอร์ หรือส่งต่อไปยังแอปพลิเคชันอื่น (หรือเลือกทั้งคู่ได้)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* File Preview & Details */}
        <div className="p-5 overflow-y-auto space-y-4">
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
            {job.fileType === 'image' ? (
              <img
                src={job.imageData}
                alt="File preview"
                className="w-16 h-16 rounded-xl object-cover border border-slate-200 shadow-sm shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                {job.fileName?.endsWith('.pdf') ? (
                  <FileText className="w-8 h-8 text-rose-500" />
                ) : job.fileName?.match(/\.(zip|rar|7z|tar|gz)$/) ? (
                  <FileArchive className="w-8 h-8 text-amber-500" />
                ) : (
                  <FileIcon className="w-8 h-8 text-indigo-600" />
                )}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-slate-900 text-sm truncate" title={fileName}>
                {fileName}
              </h4>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                <span className="font-mono bg-white px-2 py-0.5 rounded-md border border-slate-200 font-medium">
                  {job.fileSize || 'ขนาดไม่ระบุ'}
                </span>
                {job.senderName && (
                  <span className="flex items-center gap-1 text-indigo-600 font-medium">
                    <User className="w-3 h-3" />
                    {job.senderName}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Toast Notification */}
          {notification && (
            <div className={`p-3 rounded-2xl text-xs flex items-center gap-2 animate-fade-in ${
              notification.type === 'success' 
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' 
                : notification.type === 'error'
                ? 'bg-rose-50 border border-rose-200 text-rose-800'
                : 'bg-blue-50 border border-blue-200 text-blue-800'
            }`}>
              <Check className="w-4 h-4 shrink-0" />
              <span>{notification.message}</span>
            </div>
          )}

          {/* Primary Action Buttons */}
          <div className="space-y-2.5 pt-1">
            {/* OPTION 1: Save to Folder (File System Access) */}
            <button
              onClick={handleSaveToFolder}
              disabled={loadingAction !== null}
              className="w-full p-4 rounded-2xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/40 transition-all text-left flex items-center justify-between group cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  {loadingAction === 'save' ? <Loader2 className="w-5 h-5 animate-spin" /> : <FolderDown className="w-5 h-5" />}
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors">
                    1. บันทึกลงเครื่อง (เลือกโฟลเดอร์ปลายทาง)
                  </div>
                  <div className="text-xs text-slate-500">
                    เปิดหน้าต่างเลือกตำแหน่งที่ต้องการบันทึกไฟล์ (โฟลเดอร์ใดก็ได้บนคอมพิวเตอร์/มือถือ)
                  </div>
                </div>
              </div>
              <Download className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>

            {/* OPTION 2: Share / Forward to other Apps */}
            <button
              onClick={handleShareToApps}
              disabled={loadingAction !== null}
              className="w-full p-4 rounded-2xl border-2 border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/40 transition-all text-left flex items-center justify-between group cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  {loadingAction === 'share' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />}
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">
                    2. ส่งต่อไปยัง Application อื่นๆ
                  </div>
                  <div className="text-xs text-slate-500">
                    เปิดเมนูแชร์ของระบบเพื่อส่งต่อเข้า LINE, WhatsApp, Gmail, Google Drive, Telegram ฯลฯ
                  </div>
                </div>
              </div>
              <Send className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>

            {/* OPTION 3: BOTH (Save & Share Together!) */}
            <button
              onClick={handleBoth}
              disabled={loadingAction !== null}
              className="w-full p-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-indigo-500/20 transition-all text-left flex items-center justify-between group cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-white/20 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
                  {loadingAction === 'both' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                </div>
                <div>
                  <div className="font-bold text-white text-sm flex items-center gap-1.5">
                    3. เลือกทั้งคู่ (บันทึกลงโฟลเดอร์ & ส่งต่อแอปพร้อมกัน)
                    <span className="bg-amber-400 text-slate-950 text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded">
                      แนะนำ
                    </span>
                  </div>
                  <div className="text-xs text-blue-100/90">
                    บันทึกไฟล์เก็บไว้ในคอมพิวเตอร์ และเปิดหน้าต่างแชร์เพื่อส่งต่อไปยังแอปอื่นทันที
                  </div>
                </div>
              </div>
              <Check className="w-4 h-4 text-white group-hover:scale-110 transition-transform shrink-0 ml-2" />
            </button>
          </div>

          {/* Quick Fallback / Alternative Share Options */}
          {showShareFallback && (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                ช่องทางส่งต่อแบบรวดเร็ว (สำหรับเดสก์ท็อป):
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={handleCopyLink}
                  className="p-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center gap-1.5 font-medium cursor-pointer"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  คัดลอกลิงก์ไฟล์
                </button>
                <button
                  onClick={handleOpenInNewTab}
                  className="p-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center gap-1.5 font-medium cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  เปิดในแท็บใหม่
                </button>
              </div>
            </div>
          )}

          {/* Print Action for Images */}
          {job.fileType === 'image' && onPrint && (
            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  onPrint(job);
                  onClose();
                }}
                className="w-full py-3 px-4 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Printer className="w-4 h-4 text-blue-600" />
                สั่งพิมพ์ภาพนี้ทางเครื่องพิมพ์ทันที (Direct Print)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
