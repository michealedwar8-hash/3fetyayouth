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
  showUploadTrigger = false,
  className = '',
  bgVariant = 'transparent',
  emblemOnly = true
}) => {
  const [logoUrl, setLogoUrl] = useState<string | null>('/icon-512x512.png?v=3');
  const [isDragging, setIsDragging] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLogoUrl('/icon-512x512.png?v=3');
  }, []);

  const canEdit = false;

  const processFile = (_file: File) => {};
  const handleFileUpload = (_e: React.ChangeEvent<HTMLInputElement>) => {};
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div className={`flex flex-col items-center justify-center my-0 select-none bg-transparent ${className}`}>
      
      {/* The Logo Box Container (100% Transparent Background - No White or Black Box) */}
      <div 
        style={{ width: `${size}px`, height: `${size}px` }}
        className="relative rounded-2xl p-0 flex items-center justify-center overflow-hidden transition-all duration-300 cursor-default border-0 border-transparent bg-transparent shadow-none"
        title="شعار الثلاثة فتية - اجتماع الشباب السوداني"
      >
        <div className="w-full h-full flex flex-col items-center justify-center text-center relative overflow-hidden bg-transparent rounded-2xl">
          <img
            src="/icon-512x512.png?v=3"
            alt="شعار الثلاثة فتية - اجتماع الشباب السوداني"
            className="w-full h-full object-contain bg-transparent"
          />
        </div>

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
