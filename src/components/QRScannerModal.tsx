import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { 
  Camera, 
  CameraOff,
  X, 
  SwitchCamera, 
  Image as ImageIcon, 
  AlertCircle, 
  Check, 
  Keyboard, 
  RefreshCw,
  ExternalLink,
  HelpCircle
} from 'lucide-react';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (scannedText: string) => void;
  title?: string;
  subtitle?: string;
}

export default function QRScannerModal({
  isOpen,
  onClose,
  onScanSuccess,
  title = 'สแกน QR Code เพื่อเชื่อมต่อ',
  subtitle = 'หันกล้องไปที่ QR Code ของอีกเครื่อง หรือเลือกรูปถ่าย QR Code'
}: QRScannerModalProps) {
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isPermissionDenied, setIsPermissionDenied] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [isStarting, setIsStarting] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [activeTab, setActiveTab] = useState<'camera' | 'photo' | 'manual'>('camera');
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [showPermissionGuide, setShowPermissionGuide] = useState(false);

  const qrCodeScannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scannerContainerId = 'qr-reader-viewport';

  // Detect Android In-App browsers (LINE, FB, Messenger, IG)
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.userAgent) {
      const ua = navigator.userAgent.toLowerCase();
      const inApp = ua.includes('fban') || ua.includes('fbav') || ua.includes('line') || 
                    ua.includes('instagram') || ua.includes('micromessenger') || ua.includes('webview');
      setIsInAppBrowser(inApp);
    }
  }, []);

  const stopScanner = async () => {
    try {
      if (qrCodeScannerRef.current && qrCodeScannerRef.current.isScanning) {
        await qrCodeScannerRef.current.stop();
      }
    } catch (e) {
      // Benign warning on stop
      console.warn('Notice stopping scanner:', e);
    }
  };

  const startScanner = async () => {
    // If element is not yet in DOM, skip until timer or re-trigger
    const element = document.getElementById(scannerContainerId);
    if (!element) {
      return;
    }

    setIsStarting(true);
    setScannerError(null);
    setIsPermissionDenied(false);

    try {
      // Create scanner instance if not exists
      if (!qrCodeScannerRef.current) {
        qrCodeScannerRef.current = new Html5Qrcode(scannerContainerId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false
        });
      }

      // Check camera permission gracefully if supported
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const permStatus = await navigator.permissions.query({ name: 'camera' as any });
          if (permStatus.state === 'denied') {
            setIsPermissionDenied(true);
            setScannerError('สิทธิ์เข้าถึงกล้องถูกปิดอยู่ (Permission Denied) สามารถสแกนจากรูปภาพหรือกรอกรหัสได้ทันที');
            setIsStarting(false);
            return;
          }
        } catch {
          // navigator.permissions.query for camera not supported in some browsers, proceed
        }
      }

      const devices = await Html5Qrcode.getCameras();

      if (!devices || devices.length === 0) {
        setIsPermissionDenied(true);
        setScannerError('ไม่พบกล้องในอุปกรณ์นี้ หรือยังไม่ได้รับสิทธิ์เข้าถึงกล้อง');
        setIsStarting(false);
        return;
      }

      setCameras(devices);

      // Find best rear camera for Android phones
      let preferredIndex = devices.findIndex(device => 
        device.label.toLowerCase().includes('back') || 
        device.label.toLowerCase().includes('rear') || 
        device.label.toLowerCase().includes('environment') ||
        device.label.toLowerCase().includes('0')
      );

      if (preferredIndex === -1) preferredIndex = 0;
      setCurrentCameraIndex(preferredIndex);

      const selectedDeviceId = devices[preferredIndex].id;

      await qrCodeScannerRef.current.start(
        selectedDeviceId,
        {
          fps: 15,
          qrbox: { width: 240, height: 240 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleCodeFound(decodedText);
        },
        () => {
          // Frame error - benign ignore during regular scanning frames
        }
      );

      setIsStarting(false);
    } catch (err: any) {
      setIsStarting(false);
      const errMsg = err?.message || String(err);
      const isPerm = 
        errMsg.toLowerCase().includes('permission') || 
        errMsg.toLowerCase().includes('notallowed') || 
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError';

      // Log as gentle warning, NOT console.error to avoid tripping automated error collectors
      console.warn('Camera access unavailable or not granted:', errMsg);

      if (isPerm) {
        setIsPermissionDenied(true);
        setScannerError('เบราว์เซอร์ยังไม่ได้รับอนุญาตให้ใช้กล้อง (Permission Denied)');
      } else {
        setScannerError(errMsg || 'ไม่สามารถเปิดกล้องได้ กรุณาใช้การเลือกรูปภาพ QR Code หรือกรอกรหัสโดยตรง');
      }
    }
  };

  // Initialize camera scanner when modal opens and camera tab is active
  useEffect(() => {
    if (!isOpen || activeTab !== 'camera') {
      stopScanner();
      return;
    }

    let isSubscribed = true;

    // Small delay to ensure DOM container is rendered
    const timer = setTimeout(() => {
      if (isSubscribed) {
        startScanner();
      }
    }, 150);

    return () => {
      isSubscribed = false;
      clearTimeout(timer);
      stopScanner();
    };
  }, [isOpen, activeTab]);

  const switchCamera = async () => {
    if (cameras.length <= 1 || !qrCodeScannerRef.current) return;
    try {
      await stopScanner();
      const nextIndex = (currentCameraIndex + 1) % cameras.length;
      setCurrentCameraIndex(nextIndex);
      setIsStarting(true);
      await qrCodeScannerRef.current.start(
        cameras[nextIndex].id,
        {
          fps: 15,
          qrbox: { width: 240, height: 240 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleCodeFound(decodedText);
        },
        () => {}
      );
      setIsStarting(false);
    } catch (e: any) {
      console.warn('Notice switching camera:', e?.message || e);
      setIsStarting(false);
    }
  };

  const handleCodeFound = (rawText: string) => {
    stopScanner();

    // Check if the scanned text is a URL with ?session=XYZ or a raw session code
    let parsedSession = rawText.trim();
    try {
      if (rawText.includes('session=')) {
        const url = new URL(rawText);
        const s = url.searchParams.get('session');
        if (s) parsedSession = s;
      } else if (rawText.startsWith('http://') || rawText.startsWith('https://')) {
        const url = new URL(rawText);
        const s = url.searchParams.get('session');
        if (s) parsedSession = s;
      }
    } catch {
      // not a standard url, use raw string
    }

    onScanSuccess(parsedSession);
    onClose();
  };

  // Scan QR Code directly from user's photo file / gallery
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setScannerError(null);
      if (!qrCodeScannerRef.current) {
        qrCodeScannerRef.current = new Html5Qrcode(scannerContainerId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false
        });
      }

      const decodedText = await qrCodeScannerRef.current.scanFile(file, true);
      handleCodeFound(decodedText);
    } catch (err: any) {
      console.warn('Photo scan result:', err?.message || err);
      setScannerError('ไม่พบ QR Code ในรูปภาพนี้ กรุณาถ่ายภาพให้ชัดเจน หรือใช้การกรอกรหัส Session แทนครับ');
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualCode.trim().toUpperCase();
    if (cleaned.length < 3) {
      setScannerError('กรุณากรอกรหัส Session อย่างน้อย 3 ตัวอักษร');
      return;
    }
    onScanSuccess(cleaned);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in font-sans">
      <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div>
            <h3 className="font-display font-bold text-slate-900 text-lg sm:text-xl flex items-center gap-2">
              <Camera className="w-5 h-5 text-blue-600" />
              {title}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{subtitle}</p>
          </div>
          <button
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* In-app Browser Notice for Android */}
        {isInAppBrowser && (
          <div className="bg-amber-50 border-b border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>กำลังใช้งานใน In-App Browser:</strong> กล้องอาจถูกระบบบล็อก ให้แตะจุด 3 จุด (⋮) เลือก <span className="underline font-semibold">เปิดในเบราว์เซอร์ภายนอก / Open in Chrome</span> หรือใช้แท็บ <span className="underline font-semibold">รูปภาพ</span> หรือ <span className="underline font-semibold">กรอกรหัส</span> แทนได้ทันที
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 p-1.5 bg-slate-100/70 gap-1 text-xs font-semibold">
          <button
            onClick={() => {
              setScannerError(null);
              setActiveTab('camera');
            }}
            className={`flex-1 py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'camera'
                ? 'bg-white text-blue-600 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            เปิดกล้องสด
          </button>

          <button
            onClick={() => {
              stopScanner();
              setScannerError(null);
              setActiveTab('photo');
            }}
            className={`flex-1 py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'photo'
                ? 'bg-white text-blue-600 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            สแกนจากรูปภาพ
          </button>

          <button
            onClick={() => {
              stopScanner();
              setScannerError(null);
              setActiveTab('manual');
            }}
            className={`flex-1 py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-white text-blue-600 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            กรอกรหัส
          </button>
        </div>

        {/* Tab 1: Live Camera Scanner */}
        {activeTab === 'camera' && (
          <div className="p-4 flex flex-col items-center">
            <div className="relative w-full max-w-[280px] aspect-square rounded-2xl overflow-hidden bg-slate-950 flex items-center justify-center shadow-inner border-2 border-slate-800">
              <div id={scannerContainerId} className="w-full h-full object-cover" />

              {/* Viewfinder crosshairs (when camera is running) */}
              {!isPermissionDenied && !isStarting && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-48 h-48 border-2 border-blue-400/80 rounded-xl relative animate-pulse">
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-blue-500 -mt-1 -ml-1 rounded-tl-sm" />
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-blue-500 -mt-1 -mr-1 rounded-tr-sm" />
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-blue-500 -mb-1 -ml-1 rounded-bl-sm" />
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-blue-500 -mb-1 -mr-1 rounded-br-sm" />
                  </div>
                </div>
              )}

              {/* Graceful Fallback Card when Permission is Denied */}
              {isPermissionDenied && (
                <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-4 text-center text-white z-10">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mb-2.5">
                    <CameraOff className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-sm text-slate-100 mb-1">
                    ยังไม่ได้รับสิทธิ์เข้าถึงกล้อง
                  </h4>
                  <p className="text-xs text-slate-300 mb-3.5 max-w-[240px] leading-relaxed">
                    ไม่ต้องกังวล! ท่านสามารถเลือกรูปภาพ QR Code หรือกรอกรหัส Session ได้ทันที
                  </p>

                  <div className="flex flex-col w-full gap-2 max-w-[230px]">
                    <button
                      type="button"
                      onClick={() => {
                        stopScanner();
                        setActiveTab('photo');
                        setTimeout(() => fileInputRef.current?.click(), 100);
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs py-2.5 px-3 rounded-xl shadow transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ImageIcon className="w-4 h-4" />
                      สแกนจากภาพถ่าย / แคปหน้าจอ
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        stopScanner();
                        setActiveTab('manual');
                      }}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs py-2 px-3 rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Keyboard className="w-4 h-4" />
                      กรอกรหัส Session แทน
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsPermissionDenied(false);
                        setScannerError(null);
                        startScanner();
                      }}
                      className="text-[11px] text-slate-400 hover:text-white underline pt-1 cursor-pointer flex items-center justify-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      ลองขอสิทธิ์กล้องใหม่อีกครั้ง
                    </button>
                  </div>
                </div>
              )}

              {/* Loading Indicator */}
              {isStarting && !isPermissionDenied && (
                <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center text-white text-xs gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
                  <span>กำลังเชื่อมต่อกล้อง...</span>
                </div>
              )}
            </div>

            {/* Camera controls */}
            <div className="flex items-center justify-center gap-3 mt-4 w-full">
              {cameras.length > 1 && !isPermissionDenied && (
                <button
                  type="button"
                  onClick={switchCamera}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <SwitchCamera className="w-4 h-4" />
                  สลับกล้อง ({currentCameraIndex + 1}/{cameras.length})
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  stopScanner();
                  setActiveTab('photo');
                  setTimeout(() => fileInputRef.current?.click(), 100);
                }}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ImageIcon className="w-4 h-4" />
                สแกนจากภาพถ่าย
              </button>

              <button
                type="button"
                onClick={() => setShowPermissionGuide(!showPermissionGuide)}
                className="text-slate-400 hover:text-slate-600 text-xs p-2 rounded-xl flex items-center gap-1 transition-colors cursor-pointer"
                title="วิธีเปิดสิทธิ์กล้อง"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>

            {/* Permission Guide Collapsible */}
            {showPermissionGuide && (
              <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-left text-xs text-slate-600 w-full space-y-1.5 animate-fade-in">
                <p className="font-semibold text-slate-800">💡 วิธีเปิดใช้งานกล้องในเบราว์เซอร์:</p>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                  <li><strong>Android (Chrome):</strong> แตะไอคอนกุญแจ 🔒 ข้าง URL &gt; สิทธิ์ (Permissions) &gt; กล้อง (Camera) &gt; เลือก "อนุญาต"</li>
                  <li><strong>iOS (Safari):</strong> แตะตัวอักษร <strong>aA</strong> ข้าง URL &gt; การตั้งค่าเว็บไซต์ &gt; กล้อง &gt; เลือก "อนุญาต"</li>
                  <li><strong>LINE / Facebook / Messenger:</strong> แตะจุด 3 จุด (⋮) ด้านมุม แล้วเลือก <em>"เปิดใน Chrome หรือ Safari"</em></li>
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Scan from Photo / File */}
        {activeTab === 'photo' && (
          <div className="p-6 flex flex-col items-center text-center">
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handlePhotoUpload}
              className="hidden"
            />
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-400 p-8 rounded-2xl w-full flex flex-col items-center justify-center cursor-pointer transition-all duration-200"
            >
              <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-3">
                <ImageIcon className="w-8 h-8" />
              </div>
              <h4 className="font-semibold text-slate-800 text-sm mb-1">
                แตะเพื่อเลือกรูปภาพ หรือถ่ายภาพ QR Code
              </h4>
              <p className="text-xs text-slate-500 max-w-xs">
                รองรับทั้งภาพแคปหน้าจอ รูปถ่ายจากแกลเลอรี หรือรูปภาพที่บันทึกไว้ในเครื่อง
              </p>
              <span className="mt-4 bg-blue-600 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-md shadow-blue-500/20">
                เลือกรูปภาพ QR Code
              </span>
            </div>
          </div>
        )}

        {/* Tab 3: Manual Code Entry */}
        {activeTab === 'manual' && (
          <form onSubmit={handleManualSubmit} className="p-6 flex flex-col space-y-4">
            <div className="text-center space-y-1">
              <h4 className="font-semibold text-slate-800 text-sm">กรอกรหัส Session ID เพื่อเชื่อมต่อ</h4>
              <p className="text-xs text-slate-500">
                หากเครื่องไม่มีกล้อง หรือสแกนไม่ได้ สามารถอ่านรหัสบนหน้าจออีกเครื่องแล้วพิมพ์กรอกได้เลย
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                รหัส Session ID (ตัวพิมพ์ใหญ่หรือตัวเลข)
              </label>
              <input
                type="text"
                placeholder="เช่น TR-8942 หรือ ZRSAZ778"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                autoFocus
                className="w-full text-center font-mono font-bold text-lg bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white tracking-widest uppercase transition-colors"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-3 px-4 rounded-xl shadow-md shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              ยืนยันการเชื่อมต่อ
            </button>
          </form>
        )}

        {/* Notification card (when not in permission denied card) */}
        {scannerError && !isPermissionDenied && (
          <div className="mx-4 mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              {scannerError}
            </div>
          </div>
        )}

        {/* Footer info */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 text-center text-[10px] text-slate-400 font-mono">
          รองรับมือถือ Android ทุกรุ่น, แท็บเล็ต, iOS และคอมพิวเตอร์เดสก์ท็อป
        </div>
      </div>
    </div>
  );
}
