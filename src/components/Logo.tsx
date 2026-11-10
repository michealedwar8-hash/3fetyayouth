import React, { useState, useEffect, useRef } from 'react';
import { storageService } from '../services/storageService';
import { Camera, RefreshCw, UploadCloud, Image as ImageIcon } from 'lucide-react';

interface LogoProps {
  size?: number; // default 220px
  showUploadTrigger?: boolean;
  className?: string;
  bgVariant?: 'black' | 'white' | 'transparent';
  emblemOnly?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ 
  size = 220, 
  showUploadTrigger = true,
  className = '',
  bgVariant = 'white',
  emblemOnly = false
}) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check if authenticated community owner is logged in
    try {
      const adminStr = sessionStorage.getItem('three_youths_admin_session_v2');
      if (adminStr) {
        const parsed = JSON.parse(adminStr);
        if (parsed.role === 'community_owner') {
          setIsOwner(true);
        }
      }
      const memStr = sessionStorage.getItem('three_youths_member_session_v2');
      if (memStr) {
        const parsed = JSON.parse(memStr);
        if (parsed.role === 'community_owner') {
          setIsOwner(true);
        }
      }
    } catch {}

    setLogoUrl(storageService.getCustomLogo());

    // Listen for global paste events ONLY if authenticated community owner
    const handlePaste = (e: ClipboardEvent) => {
      let authorized = false;
      try {
        const aStr = sessionStorage.getItem('three_youths_admin_session_v2');
        if (aStr && JSON.parse(aStr).role === 'community_owner') authorized = true;
      } catch {}
      if (!authorized) return;

      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            processFile(file);
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const canEdit = isOwner && showUploadTrigger;

  const processFile = (file: File) => {
    if (!canEdit) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      storageService.setCustomLogo(result);
      setLogoUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!canEdit) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    storageService.resetCustomLogo();
    setLogoUrl(null);
  };

  return (
    <div className={`flex flex-col items-center justify-center my-3 select-none ${className}`}>
      
      {/* The Logo Box Container */}
      <div 
        onClick={canEdit ? () => fileInputRef.current?.click() : undefined}
        onDragOver={canEdit ? (e) => { e.preventDefault(); setIsDragging(true); } : undefined}
        onDragLeave={canEdit ? () => setIsDragging(false) : undefined}
        onDrop={canEdit ? handleDrop : undefined}
        style={{ width: `${size}px`, height: `${size}px` }}
        className={`relative rounded-2xl p-0 flex items-center justify-center overflow-hidden transition-all duration-300 ${
          canEdit ? 'cursor-pointer group' : 'cursor-default'
        } ${
          isDragging 
            ? 'ring-4 ring-amber-400 scale-105 border-amber-300' 
            : bgVariant === 'black' 
              ? 'border-2 border-amber-400/80 hover:border-amber-300 hover:shadow-amber-500/20 shadow-2xl bg-black' 
              : bgVariant === 'transparent'
                ? 'border-0 border-transparent bg-transparent shadow-none'
                : 'border-2 border-slate-200/90 hover:border-emerald-400 shadow-md bg-white'
        }`}
        title={canEdit ? "انقر هنا لتحديث شعار الاجتماع الرسمي" : "شعار الثلاثة فتية - اجتماع الشباب السوداني"}
      >
        {!emblemOnly && logoUrl && logoUrl.trim() !== '' && logoUrl !== '/assets/aistudio/1000762371-removebg-preview_e1bb979f.png' ? (
          <img 
            src={logoUrl} 
            alt="شعار الثلاثة فتية - اجتماع الشباب السوداني" 
            className={`w-full h-full object-contain scale-105 ${bgVariant === 'transparent' ? 'bg-transparent' : 'bg-white'}`}
          />
        ) : (
          <div className={`w-full h-full flex flex-col items-center justify-center text-center relative overflow-hidden ${
            bgVariant === 'transparent' ? 'bg-transparent' : 'bg-white'
          } rounded-2xl`}>
            <img
              src={emblemOnly ? '/assets/aistudio/logo-emblem-only.png?v=12' : '/assets/aistudio/1000762371-removebg-preview_e1bb979f.png?v=12'}
              alt="شعار الثلاثة فتية - اجتماع الشباب السوداني"
              className="w-full h-full object-contain scale-[1.04] bg-transparent"
            />
          </div>
        )}

        {/* Hover / Click prompt overlay - Only visible to authenticated Community Owner */}
        {canEdit && (
          <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white rounded-3xl p-3 text-center backdrop-blur-2xs">
            <UploadCloud className="w-9 h-9 text-amber-300 mb-1.5 animate-bounce" />
            <span className="text-xs font-bold text-amber-100">
              {logoUrl ? 'تغيير الشعار' : 'انقر لرفع الشعار الرسمي'}
            </span>
            <span className="text-[10px] text-slate-300 mt-1">
              (أو اسحب وأفلت ملف الصورة هنا)
            </span>
          </div>
        )}

      </div>

      {canEdit && (
        <input 
          ref={fileInputRef}
          type="file" 
          accept="image/*" 
          className="hidden" 
          onChange={handleFileUpload} 
        />
      )}

      {/* Helpful action bar under the logo box - Only for Community Owner */}
      {canEdit && (
        <div className="flex items-center gap-2 mt-2 text-xs">
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-amber-200 hover:text-amber-100 font-bold flex items-center gap-1.5 bg-black/40 hover:bg-black/60 px-3 py-1 rounded-full border border-amber-400/40 transition shadow-xs text-[11px]"
          >
            <Camera className="w-3.5 h-3.5 text-amber-400" />
            <span>{logoUrl ? 'تحديث الشعار' : 'اختر الصورة من جهازك'}</span>
          </button>
          
          {logoUrl && (
            <button 
              type="button" 
              onClick={handleReset}
              className="text-red-300 hover:text-red-200 text-[10px] bg-red-950/60 px-2 py-1 rounded-full border border-red-800/40 flex items-center gap-1 transition"
              title="استعادة الرسم الافتراضي"
            >
              <RefreshCw className="w-3 h-3" />
              <span>استعادة</span>
            </button>
          )}
        </div>
      )}

    </div>
  );
};
