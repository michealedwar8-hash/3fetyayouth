import React from 'react';
import { MessageCircle, Briefcase, Copy, ExternalLink, X, Check } from 'lucide-react';

interface WhatsAppSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  phoneNumber: string;
  recipientName?: string;
  defaultMessage?: string;
}

export const WhatsAppSelectorModal: React.FC<WhatsAppSelectorModalProps> = ({
  isOpen,
  onClose,
  phoneNumber,
  recipientName,
  defaultMessage
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  // Clean phone digits for international link
  let digits = (phoneNumber || '').replace(/\D/g, '');
  if (digits.startsWith('0')) {
    // If Egypt (11 digits starting with 01)
    if (digits.length === 11) {
      digits = '20' + digits.substring(1);
    } else if (digits.length === 10) {
      // If Sudan (10 digits starting with 01 or 09)
      digits = '249' + digits.substring(1);
    }
  }

  const encodedMsg = encodeURIComponent(defaultMessage || `سلام ونعمة يا ${recipientName || 'حبيبي'} 🕊️❤️`);

  // Direct standard WhatsApp link
  const standardWaUrl = `https://api.whatsapp.com/send?phone=${digits}&text=${encodedMsg}`;
  
  // WhatsApp Business deep-link / web redirect (on phones, prompt opens WhatsApp Business app directly)
  const businessWaUrl = `https://wa.me/${digits}?text=${encodedMsg}`;

  const handleCopyPhone = () => {
    navigator.clipboard.writeText(phoneNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-emerald-100 animate-fadeIn"
        dir="rtl"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">
                تواصل عبر واتساب
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {recipientName ? `المخدوم: ${recipientName}` : 'اختر التطبيق المناسب'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-3">
          <p className="text-xs text-slate-600 font-semibold mb-2">
            يمكنك إرسال الرسالة باستخدام واتساب العادي أو واتساب للأعمال (WhatsApp Business):
          </p>

          {/* Option 1: WhatsApp Regular */}
          <a
            href={standardWaUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition text-emerald-950 font-bold text-xs shadow-xs group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div className="text-right">
                <span className="block font-black text-slate-900 group-hover:text-emerald-900">واتساب العادي (WhatsApp)</span>
                <span className="text-[11px] text-slate-500">فتح التطبيق الشخصي المباشر</span>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-emerald-600 group-hover:translate-x-[-2px] transition" />
          </a>

          {/* Option 2: WhatsApp Business */}
          <a
            href={businessWaUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-teal-50 hover:bg-teal-100 border border-teal-200 transition text-teal-950 font-bold text-xs shadow-xs group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0">
                <Briefcase className="w-5 h-5" />
              </div>
              <div className="text-right">
                <span className="block font-black text-slate-900 group-hover:text-teal-900">واتساب للأعمال (WhatsApp Business)</span>
                <span className="text-[11px] text-slate-500">حساب الخدمة أو الأعمال التجارية</span>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-teal-700 group-hover:translate-x-[-2px] transition" />
          </a>

          {/* Option 3: Copy Phone */}
          <button
            type="button"
            onClick={handleCopyPhone}
            className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-mono text-xs" dir="ltr">{phoneNumber}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600 text-[11px]">
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-600">تم النسخ!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>نسخ الرقم</span>
                </>
              )}
            </div>
          </button>
        </div>

        <div className="pt-2 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
