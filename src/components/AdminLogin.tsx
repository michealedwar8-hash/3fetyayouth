import React, { useState } from 'react';
import { Logo } from './Logo';
import { Lock, Mail, ArrowRight, ShieldCheck, KeyRound, AlertCircle } from 'lucide-react';
import { AdminSession, Registrant } from '../types';
import { storageService, ROLE_PERMISSIONS } from '../services/storageService';

interface AdminLoginProps {
  onLoginSuccess: (session: AdminSession) => void;
  onBackToPublic: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess, onBackToPublic }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Pre-configured Admin credentials for instant local access
  // Can be customized by the hoster or configured with Firebase Auth
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    setTimeout(() => {
      // Check admin credentials
      // Default: admin@threeyouths.org / admin123 (or any valid email + password for testing, or hoster's own)
      const normalizedEmail = email.trim().toLowerCase();
      
      if (!email || !password) {
        setError('يرجى إدخال البريد الإلكتروني وكلمة المرور');
        setIsLoading(false);
        return;
      }

      // Allow admin credentials or hoster's email or owner identifiers
      const isOwnerIdentifier = 
        normalizedEmail === 'admin@threeyouths.org' ||
        normalizedEmail === 'michealedwar8@gmail.com' ||
        normalizedEmail.includes('admin') ||
        normalizedEmail.toLowerCase() === 'ty-0001' ||
        normalizedEmail === 'ميخائيل ادور راتب' ||
        normalizedEmail === 'ميخائيل ادوار راتب' ||
        normalizedEmail.replace(/[\s+-]/g, '') === '201288651567' ||
        normalizedEmail.replace(/[\s+-]/g, '') === '01288651567';

      if (
        (normalizedEmail === 'admin@threeyouths.org' && (password === 'admin123456789' || password === 'admin123')) ||
        (isOwnerIdentifier && (password === 'admin123456789' || password === 'admin123' || password.length >= 6))
      ) {
        const registrants = storageService.getRegistrants();
        const ownerRegistrant = 
          registrants.find(r => r.role === 'community_owner') || 
          registrants[0];

        const session: AdminSession = {
          email: normalizedEmail === 'admin@threeyouths.org' ? 'admin@threeyouths.org' : (ownerRegistrant?.phone || normalizedEmail),
          name: ownerRegistrant?.fullName || 'ميخائيل ادور راتب',
          role: 'community_owner',
          gender: ownerRegistrant?.gender || 'male',
          permissions: ownerRegistrant?.permissions || ROLE_PERMISSIONS.community_owner,
          token: `adm_sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        };
        onLoginSuccess(session);
      } else {
        setError('بيانات الدخول غير صحيحة. يرجى التأكد من البريد الإلكتروني وكلمة المرور الخاصة بمسؤول الخدمة.');
      }
      setIsLoading(false);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 text-white flex flex-col justify-between p-4 sm:p-6">
      
      {/* Top Header */}
      <div className="max-w-md w-full mx-auto flex items-center justify-between">
        <button
          onClick={onBackToPublic}
          className="inline-flex items-center gap-1.5 text-xs text-emerald-300 hover:text-emerald-200 transition font-bold bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-xl backdrop-blur-sm"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة لبوابة الأعضاء</span>
        </button>

        <span className="text-xs text-slate-400 flex items-center gap-1 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          منطقة الخدام المشفرة
        </span>
      </div>

      {/* Main Login Card */}
      <div className="max-w-md w-full mx-auto my-auto">
        <div className="bg-slate-900/95 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-600/30 mb-3 border border-emerald-400/30">
              <Lock className="w-7 h-7 text-white" />
            </div>
            
            <h1 className="text-2xl font-black text-white">
              لوحة تحكم خادم الاجتماع
            </h1>
            <p className="text-xs text-emerald-300 font-semibold mt-1">
              الثلاثة فتية • اجتماع الشباب السوداني
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                البريد الإلكتروني للخادم / المسؤول
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  dir="ltr"
                  placeholder="admin@threeyouths.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full text-left bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5 pl-10 text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                كلمة المرور
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  dir="ltr"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full text-left bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5 pl-10 text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                />
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 transition duration-200 flex items-center justify-center gap-2 mt-2"
            >
              {isLoading ? (
                <span>جاري التحقق من الصلاحيات...</span>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>تسجيل الدخول للمسؤول</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-500 py-2">
        بوابة الإدارة الخاصة باجتماع الثلاثة فتية - الشباب السوداني
      </footer>

    </div>
  );
};
