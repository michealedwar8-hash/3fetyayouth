import React from 'react';
import { storageService } from '../services/storageService';

interface MeetingLogoStampProps {
  size?: number;
  className?: string;
  dateText?: string;
}

export const MeetingLogoStamp: React.FC<MeetingLogoStampProps> = ({ 
  size = 52, 
  className = '',
  dateText
}) => {
  const logoSrc = storageService.getCustomLogo() || '/assets/aistudio/Code_Generated_Image_d41e281a.png';

  return (
    <div 
      style={{ width: `${size}px`, height: `${size}px` }} 
      className={`relative flex items-center justify-center select-none ${className}`}
      title={dateText ? `تم الحضور: (${dateText})` : 'ختم الحضور الرسمي ✓'}
    >
      <div className="w-full h-full rounded-full overflow-hidden border-2 border-blue-600 shadow-2xs relative bg-slate-900 flex items-center justify-center p-0.5">
        <img
          src={logoSrc}
          alt="شعار الثلاثة فتية - اجتماع الشباب السوداني"
          className="w-full h-full object-contain bg-transparent select-none pointer-events-none"
        />
      </div>
    </div>
  );
};
