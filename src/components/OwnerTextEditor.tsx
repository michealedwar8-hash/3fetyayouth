import React, { useState, useEffect, useRef, useCallback } from 'react';
import { storageService, isSiteTextsMutationLocked } from '../services/storageService';
import { Edit3, Trash2, RotateCcw, Check, X, ListFilter, Sparkles, Eye, LayoutDashboard, LogIn, UserPlus } from 'lucide-react';

interface OwnerTextEditorProps {
  isOwner: boolean;
  currentPage: 'member_login' | 'register' | 'member_portal' | 'admin_login' | 'admin_dashboard' | 'event_register';
  onNavigatePage?: (page: 'member_login' | 'register' | 'member_portal' | 'admin_dashboard') => void;
}

interface EditableTargetItem {
  key: string;
  originalText: string;
  currentValue: string;
  isDeleted: boolean;
  isPlaceholder?: boolean;
}

function normalizeTextKey(str: string): string {
  return (str || '').trim().replace(/\s+/g, ' ');
}

export const OwnerTextEditor: React.FC<OwnerTextEditorProps> = ({
  isOwner,
  currentPage,
  onNavigatePage
}) => {
  const [editMode, setEditMode] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>(() => storageService.getSiteTextOverrides());
  const [selectedItems, setSelectedItems] = useState<EditableTargetItem[]>([]);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [isManageListOpen, setIsManageListOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const isApplyingRef = useRef(false);
  const overridesRef = useRef<Record<string, string>>(overrides);

  useEffect(() => {
    overridesRef.current = overrides;
  }, [overrides]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg(prev => (prev === msg ? null : prev));
    }, 2600);
  };

  // Apply all text overrides across the DOM tree safely without breaking React Virtual DOM
  const applyOverridesToDOM = useCallback((activeOverrides?: Record<string, string>) => {
    if (isApplyingRef.current) return;
    if (typeof document === 'undefined') return;

    const map = activeOverrides || overridesRef.current || {};
    const root = document.getElementById('root');
    if (!root) return;

    isApplyingRef.current = true;
    try {
      // 1. Walk all TEXT_NODEs inside #root
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'textarea' || tag === 'noscript') {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.closest('[data-owner-editor-ui="true"]')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      let currentNode = walker.nextNode() as Text | null;
      while (currentNode) {
        const rawCurrent = currentNode.nodeValue || '';
        const storedOrigKey = (currentNode as any).__origKey as string | undefined;
        const storedOrigText = (currentNode as any).__origText as string | undefined;
        const lastApplied = (currentNode as any).__appliedOverride as string | undefined;

        if (storedOrigKey === undefined) {
          const key = normalizeTextKey(rawCurrent);
          if (key.length > 0) {
            (currentNode as any).__origText = rawCurrent;
            (currentNode as any).__origKey = key;
          }
        } else {
          const prevExpected = map[storedOrigKey];
          const isMatchingPrevOverride =
            (lastApplied !== undefined && rawCurrent === lastApplied) ||
            (prevExpected === '__DELETED__' && rawCurrent === '') ||
            (prevExpected !== undefined && prevExpected !== '__DELETED__' && rawCurrent === prevExpected);

          if (rawCurrent !== storedOrigText && !isMatchingPrevOverride) {
            // React dynamically updated this text node's content
            const newKey = normalizeTextKey(rawCurrent);
            if (newKey.length > 0) {
              (currentNode as any).__origText = rawCurrent;
              (currentNode as any).__origKey = newKey;
              delete (currentNode as any).__appliedOverride;
            }
          }
        }

        const key = (currentNode as any).__origKey as string | undefined;
        const origText = (currentNode as any).__origText as string | undefined;

        if (key) {
          const overrideVal = map[key];
          if (overrideVal === '__DELETED__') {
            (currentNode as any).__appliedOverride = '';
            if (currentNode.nodeValue !== '') {
              currentNode.nodeValue = '';
            }
          } else if (overrideVal !== undefined) {
            (currentNode as any).__appliedOverride = overrideVal;
            if (currentNode.nodeValue !== overrideVal) {
              currentNode.nodeValue = overrideVal;
            }
          } else if (origText !== undefined) {
            delete (currentNode as any).__appliedOverride;
            if (currentNode.nodeValue !== origText) {
              currentNode.nodeValue = origText;
            }
          }
        }

        currentNode = walker.nextNode() as Text | null;
      }

      // 2. Apply overrides to input/textarea placeholders
      const inputs = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[placeholder], textarea[placeholder]');
      inputs.forEach((el) => {
        if (el.closest('[data-owner-editor-ui="true"]')) return;
        const currentPh = el.getAttribute('placeholder') || '';
        const storedPhKey = (el as any).__origPhKey as string | undefined;
        const storedPhText = (el as any).__origPhText as string | undefined;
        const lastPhApplied = (el as any).__appliedPhOverride as string | undefined;

        if (!storedPhKey && currentPh.trim().length > 0) {
          (el as any).__origPhText = currentPh;
          (el as any).__origPhKey = normalizeTextKey(currentPh);
        } else if (storedPhKey && currentPh !== storedPhText && currentPh !== lastPhApplied) {
          const newPhKey = normalizeTextKey(currentPh);
          if (newPhKey.length > 0) {
            (el as any).__origPhText = currentPh;
            (el as any).__origPhKey = newPhKey;
            delete (el as any).__appliedPhOverride;
          }
        }

        const phKey = (el as any).__origPhKey as string | undefined;
        const origPh = (el as any).__origPhText as string | undefined;
        if (phKey) {
          const overrideVal = map[phKey];
          if (overrideVal === '__DELETED__') {
            (el as any).__appliedPhOverride = '';
            if (currentPh !== '') el.setAttribute('placeholder', '');
          } else if (overrideVal !== undefined) {
            (el as any).__appliedPhOverride = overrideVal;
            if (currentPh !== overrideVal) el.setAttribute('placeholder', overrideVal);
          } else if (origPh !== undefined) {
            delete (el as any).__appliedPhOverride;
            if (currentPh !== origPh) {
              el.setAttribute('placeholder', origPh);
            }
          }
        }
      });
    } catch (err) {
      console.warn('[OwnerTextEditor] applyOverridesToDOM notice:', err);
    } finally {
      isApplyingRef.current = false;
    }
  }, []);

  // Sync overrides from storage, server events, and DOM mutations
  useEffect(() => {
    const syncOverrides = () => {
      const latest = storageService.getSiteTextOverrides();
      if (JSON.stringify(overridesRef.current) !== JSON.stringify(latest)) {
        overridesRef.current = latest;
        setOverrides(latest);
      }
      applyOverridesToDOM(latest);
    };

    syncOverrides();

    // Fetch latest site text overrides from central server while preserving any local Community Owner edits
    if (!isSiteTextsMutationLocked()) {
      fetch('/api/site-texts')
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (!isSiteTextsMutationLocked() && data && data.success && data.siteTextOverrides && typeof data.siteTextOverrides === 'object') {
            const serverMap = data.siteTextOverrides as Record<string, string>;
            const currentLocal = storageService.getSiteTextOverrides();
            const mergedMap = storageService.isCommunityOwnerLoggedIn()
              ? { ...serverMap, ...currentLocal }
              : { ...currentLocal, ...serverMap };
            if (Object.keys(mergedMap).length > 0 || !storageService.isCommunityOwnerLoggedIn()) {
              if (JSON.stringify(currentLocal) !== JSON.stringify(mergedMap)) {
                try {
                  localStorage.setItem('three_youths_site_text_overrides_v1', JSON.stringify(mergedMap));
                } catch {}
                setOverrides({ ...mergedMap });
                overridesRef.current = { ...mergedMap };
                applyOverridesToDOM(mergedMap);
              }
            }
          }
        })
        .catch(() => {});
    }

    const handleCustomEvent = (e: Event) => {
      const customEvt = e as CustomEvent;
      const nextMap = (customEvt.detail && typeof customEvt.detail === 'object')
        ? customEvt.detail
        : storageService.getSiteTextOverrides();
      setOverrides({ ...nextMap });
      overridesRef.current = { ...nextMap };
      applyOverridesToDOM(nextMap);
    };

    window.addEventListener('three_youths_site_texts_updated', handleCustomEvent);
    const unsub = storageService.subscribe(syncOverrides);

    const root = document.getElementById('root');
    let observer: MutationObserver | null = null;
    if (root && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => {
        if (!isApplyingRef.current) {
          applyOverridesToDOM();
        }
      });
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    return () => {
      window.removeEventListener('three_youths_site_texts_updated', handleCustomEvent);
      unsub();
      if (observer) observer.disconnect();
    };
  }, [applyOverridesToDOM, currentPage]);

  // Capture clicks when Owner Edit Mode is active
  useEffect(() => {
    if (!isOwner || !editMode) return;

    const collectEditableItemsFromElement = (el: HTMLElement): EditableTargetItem[] => {
      const items: EditableTargetItem[] = [];
      const seenKeys = new Set<string>();
      const map = overridesRef.current || {};

      // Check if input/textarea with placeholder
      if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && ((el as any).__origPhKey || el.getAttribute('placeholder'))) {
        const key = (el as any).__origPhKey || normalizeTextKey(el.getAttribute('placeholder') || '');
        const orig = (el as any).__origPhText || el.getAttribute('placeholder') || '';
        if (key && !seenKeys.has(key)) {
          seenKeys.add(key);
          const ov = map[key];
          items.push({
            key,
            originalText: orig.trim(),
            currentValue: ov === '__DELETED__' ? '' : (ov !== undefined ? ov : orig.trim()),
            isDeleted: ov === '__DELETED__',
            isPlaceholder: true
          });
        }
      }

      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const p = node.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          const t = p.tagName.toLowerCase();
          if (t === 'script' || t === 'style' || t === 'textarea') return NodeFilter.FILTER_REJECT;
          if (p.closest('[data-owner-editor-ui="true"]')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      let n = walker.nextNode() as Text | null;
      while (n) {
        const key = (n as any).__origKey || normalizeTextKey(n.nodeValue || '');
        const orig = (n as any).__origText || n.nodeValue || '';
        if (key && !seenKeys.has(key)) {
          seenKeys.add(key);
          const ov = map[key];
          items.push({
            key,
            originalText: orig.trim(),
            currentValue: ov === '__DELETED__' ? '' : (ov !== undefined ? ov : orig.trim()),
            isDeleted: ov === '__DELETED__'
          });
        }
        n = walker.nextNode() as Text | null;
      }

      return items;
    };

    const handleCaptureClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Ignore clicks inside the Owner Text Editor UI itself
      if (target.closest('[data-owner-editor-ui="true"]')) {
        return;
      }

      // Find closest meaningful element with text
      let candidate: HTMLElement | null = target;
      let foundItems = collectEditableItemsFromElement(candidate);

      if (foundItems.length === 0 && candidate.parentElement && !candidate.parentElement.closest('[data-owner-editor-ui="true"]')) {
        const closestInteractive = candidate.closest('button, a, h1, h2, h3, h4, p, span, label, div') as HTMLElement | null;
        if (closestInteractive && closestInteractive.id !== 'root') {
          const parentItems = collectEditableItemsFromElement(closestInteractive);
          if (parentItems.length > 0 && parentItems.length <= 8) {
            foundItems = parentItems;
          }
        }
      }

      if (foundItems.length > 0) {
        e.preventDefault();
        e.stopPropagation();

        // Limit to max 6 items per click so clicking a huge container doesn't open 50 items
        const sliced = foundItems.slice(0, 6);
        const initialDrafts: Record<string, string> = {};
        sliced.forEach((it) => {
          initialDrafts[it.key] = it.currentValue;
        });
        setSelectedItems(sliced);
        setDraftValues(initialDrafts);
      }
    };

    window.addEventListener('click', handleCaptureClick, true);
    return () => {
      window.removeEventListener('click', handleCaptureClick, true);
    };
  }, [isOwner, editMode]);

  const handleSaveSingleItem = async (key: string) => {
    const newVal = draftValues[key] ?? '';
    // Optimistic UI update immediately
    const optimisticNext = { ...overridesRef.current };
    const cleanKey = (key || '').trim().replace(/\s+/g, ' ');
    if (newVal.trim() === '') {
      optimisticNext[cleanKey] = '__DELETED__';
    } else {
      optimisticNext[cleanKey] = newVal;
    }
    overridesRef.current = optimisticNext;
    setOverrides(optimisticNext);
    applyOverridesToDOM(optimisticNext);

    if (newVal.trim() === '') {
      await storageService.deleteSiteTextByKey(key);
      showToast('تم حذف النص وحفظ التغيير في الموقع والسيرفر فوراً! 🗑️');
    } else {
      await storageService.setSiteTextOverride(key, newVal);
      showToast('تم تعديل وحفظ النص بنسبة 100% على جميع الأجهزة! ✅');
    }
    const latest = storageService.getSiteTextOverrides();
    setOverrides(latest);
    overridesRef.current = latest;
    applyOverridesToDOM(latest);
  };

  const handleSaveAllSelected = async () => {
    const batchUpdates: Record<string, string> = {};
    const optimisticNext = { ...overridesRef.current };

    for (const item of selectedItems) {
      const val = draftValues[item.key] ?? '';
      const cleanKey = (item.key || '').trim().replace(/\s+/g, ' ');
      if (!cleanKey) continue;
      if (val.trim() === '') {
        batchUpdates[cleanKey] = '__DELETED__';
        optimisticNext[cleanKey] = '__DELETED__';
      } else {
        batchUpdates[cleanKey] = val;
        optimisticNext[cleanKey] = val;
      }
    }

    // Also include any draftValues modified in the drawer
    for (const [rawKey, val] of Object.entries(draftValues)) {
      const cleanKey = (rawKey || '').trim().replace(/\s+/g, ' ');
      if (!cleanKey || batchUpdates[cleanKey] !== undefined) continue;
      const currentVal = overridesRef.current[cleanKey] ?? cleanKey;
      if (val !== currentVal) {
        batchUpdates[cleanKey] = val.trim() === '' ? '__DELETED__' : val;
        optimisticNext[cleanKey] = batchUpdates[cleanKey];
      }
    }

    // 1. Instant Optimistic UI Update on DOM & State
    overridesRef.current = optimisticNext;
    setOverrides(optimisticNext);
    applyOverridesToDOM(optimisticNext);

    // 2. Single Atomic Batch Save to LocalStorage, Server, and Cloudflare D1
    await storageService.setBatchSiteTextOverrides(batchUpdates);

    const latest = storageService.getSiteTextOverrides();
    setOverrides(latest);
    overridesRef.current = latest;
    applyOverridesToDOM(latest);
    setSelectedItems([]);
    showToast('تم حفظ وتطبيق جميع التعديلات فوراً في الموقع والسحابة! ✅');
  };

  const handleDeleteSingleItem = async (key: string) => {
    await storageService.deleteSiteTextByKey(key);
    const latest = storageService.getSiteTextOverrides();
    setOverrides(latest);
    overridesRef.current = latest;
    applyOverridesToDOM(latest);
    setDraftValues(prev => ({ ...prev, [key]: '' }));
    setSelectedItems(prev => prev.map(it => it.key === key ? { ...it, currentValue: '', isDeleted: true } : it));
    showToast('تم حذف النص نهائياً من الصفحة وحفظه! 🗑️');
  };

  const handleRestoreSingleItem = async (key: string, originalText: string) => {
    await storageService.restoreSiteTextByKey(key);
    const latest = storageService.getSiteTextOverrides();
    setOverrides(latest);
    overridesRef.current = latest;
    applyOverridesToDOM(latest);
    setDraftValues(prev => ({ ...prev, [key]: originalText }));
    setSelectedItems(prev => prev.map(it => it.key === key ? { ...it, currentValue: originalText, isDeleted: false } : it));
    showToast('تمت استعادة النص الأصلي بنجاح! 🔄');
  };

  // Only render the visual editor controls for the authenticated Community Owner
  if (!isOwner) {
    return null;
  }

  const overrideEntries = Object.entries(overrides);

  return (
    <div data-owner-editor-ui="true" className="no-print font-['Cairo',sans-serif]" dir="rtl">
      {/* Global Highlight Style when Edit Mode is Active */}
      {editMode && (
        <style>{`
          #root h1:hover, #root h2:hover, #root h3:hover, #root h4:hover,
          #root p:hover, #root span:hover, #root button:hover, #root a:hover, #root label:hover {
            outline: 2px dashed #f59e0b !important;
            outline-offset: 2px !important;
            cursor: pointer !important;
          }
        `}</style>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-slate-950 text-amber-300 border-2 border-amber-400 px-5 py-3 rounded-2xl shadow-2xl text-xs sm:text-sm font-black flex items-center gap-2 animate-fadeIn">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Floating Owner Toolbar at Bottom */}
      <div className="fixed bottom-4 left-4 z-[9990] flex flex-col items-start gap-2 max-w-[95vw]">
        {editMode ? (
          <div className="bg-slate-950/95 backdrop-blur-md border-2 border-amber-400 text-white p-3 sm:p-4 rounded-3xl shadow-2xl space-y-3 w-full sm:w-[440px]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
                <span className="text-xs sm:text-sm font-black text-amber-300">
                  وضع تعديل وحذف نصوص الموقع (خاص بالمالك فقط 👑)
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditMode(false);
                  setSelectedItems([]);
                }}
                className="px-3 py-1 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black transition cursor-pointer"
              >
                إنهاء الوضع ✕
              </button>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed">
              اضغط الآن على <strong>أي كلمة أو عنوان أو زر</strong> في الصفحة الحالية لتغيير كتابته أو حذفه نهائياً، وسيُحفظ فوراً بنسبة 100% عند كل الأعضاء.
            </p>

            {/* Quick Page Switcher so Owner can edit texts on Login, Register, Member Portal, or Dashboard */}
            {onNavigatePage && (
              <div className="pt-1 border-t border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold block mb-1.5">
                  تنقّل بين صفحات الموقع لتعديل نصوصها:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onNavigatePage('member_login')}
                    className={`px-2 py-1.5 rounded-xl text-[10px] font-black flex items-center justify-center gap-1 transition cursor-pointer ${
                      currentPage === 'member_login'
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    <LogIn className="w-3 h-3" />
                    <span>بوابة الدخول</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigatePage('register')}
                    className={`px-2 py-1.5 rounded-xl text-[10px] font-black flex items-center justify-center gap-1 transition cursor-pointer ${
                      currentPage === 'register'
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    <UserPlus className="w-3 h-3" />
                    <span>تسجيل العضوية</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigatePage('member_portal')}
                    className={`px-2 py-1.5 rounded-xl text-[10px] font-black flex items-center justify-center gap-1 transition cursor-pointer ${
                      currentPage === 'member_portal'
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    <Eye className="w-3 h-3" />
                    <span>صفحة المخدومين</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigatePage('admin_dashboard')}
                    className={`px-2 py-1.5 rounded-xl text-[10px] font-black flex items-center justify-center gap-1 transition cursor-pointer ${
                      currentPage === 'admin_dashboard'
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    <LayoutDashboard className="w-3 h-3" />
                    <span>لوحة التحكم</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsManageListOpen(true)}
                className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 cursor-pointer"
              >
                <ListFilter className="w-3.5 h-3.5" />
                <span>سجل النصوص المعدّلة والمحذوفة ({overrideEntries.length})</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 hover:from-slate-900 hover:to-slate-800 text-amber-300 border-2 border-amber-400/90 shadow-xl text-xs font-black flex items-center gap-2 transition cursor-pointer"
              title="تعديل أو حذف أي نص في الموقع مباشرة (خاص بمسؤول المجتمع فقط)"
            >
              <Edit3 className="w-4 h-4 text-amber-400" />
              <span>تعديل نصوص الموقع ✏️</span>
            </button>

            {overrideEntries.length > 0 && (
              <button
                type="button"
                onClick={() => setIsManageListOpen(true)}
                className="px-3 py-2.5 rounded-2xl bg-slate-900/95 hover:bg-slate-800 text-emerald-300 border border-emerald-500/50 shadow-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                title="إدارة أو استعادة النصوص المعدلة"
              >
                <ListFilter className="w-4 h-4 text-emerald-400" />
                <span>{overrideEntries.length}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modal for Editing / Deleting Clicked Text */}
      {selectedItems.length > 0 && (
        <div className="fixed inset-0 z-[9995] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border-2 border-amber-400/90 rounded-3xl max-w-lg w-full p-5 sm:p-6 text-white shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">
                    تعديل أو حذف النص المباشر
                  </h3>
                  <p className="text-[11px] text-amber-300 font-bold">
                    يُحفظ التعديل فوراً في الموقع والسيرفر وجميع الهواتف
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItems([])}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {selectedItems.map((item) => (
                <div
                  key={item.key}
                  className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-400">
                      النص الأصلي: <span className="text-slate-300 font-mono">{item.originalText}</span>
                    </span>
                    {item.isDeleted && (
                      <span className="text-[10px] bg-red-950 text-red-300 border border-red-700 px-2 py-0.5 rounded-full font-bold">
                        محذوف حالياً
                      </span>
                    )}
                  </div>

                  <textarea
                    rows={2}
                    value={draftValues[item.key] ?? ''}
                    onChange={(e) => setDraftValues(prev => ({ ...prev, [item.key]: e.target.value }))}
                    placeholder="اكتب النص الجديد هنا (أو اتركه فارغاً لحذفه)..."
                    className="w-full rounded-2xl bg-slate-900 border-2 border-slate-700 focus:border-amber-400 text-white p-3 text-sm font-bold outline-none transition"
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSaveSingleItem(item.key)}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>حفظ النص الجديد</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteSingleItem(item.key)}
                      className="py-2 px-3 rounded-xl bg-red-600/90 hover:bg-red-500 text-white text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
                      title="حذف هذا النص نهائياً من الصفحة"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>حذف النص</span>
                    </button>

                    {overrides[item.key] !== undefined && (
                      <button
                        type="button"
                        onClick={() => handleRestoreSingleItem(item.key, item.originalText)}
                        className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer"
                        title="استعادة النص الأصلي"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>استعادة الأصلي</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleSaveAllSelected}
                className="flex-1 py-2.5 px-4 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>حفظ وتطبيق الكل فوراً ✔️</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedItems([])}
                className="py-2.5 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Managing All Modified/Deleted Texts */}
      {isManageListOpen && (
        <div className="fixed inset-0 z-[9995] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border-2 border-emerald-500/80 rounded-3xl max-w-2xl w-full p-5 sm:p-6 text-white shadow-2xl space-y-4 max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-white">
                  سجل النصوص المعدّلة والمحذوفة ({overrideEntries.length})
                </h3>
                <p className="text-xs text-slate-400">
                  يمكنك تعديل أي نص أو استعادة النص الأصلي بضغطة واحدة
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsManageListOpen(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {overrideEntries.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs font-bold">
                  لا توجد نصوص معدلة أو محذوفة حالياً. فعّل وضع التعديل واضغط على أي نص في الموقع لتعديله أو حذفه.
                </div>
              ) : (
                overrideEntries.map(([origKey, newVal]) => (
                  <div
                    key={origKey}
                    className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="text-[11px] text-slate-400">
                        الأصلي: <span className="text-slate-200 font-bold">{origKey}</span>
                      </div>
                      <div className="text-xs font-black">
                        الحالي:{' '}
                        {newVal === '__DELETED__' ? (
                          <span className="text-red-400 bg-red-950/80 px-2 py-0.5 rounded-lg border border-red-800">
                            [تم حذف النص نهائياً]
                          </span>
                        ) : (
                          <span className="text-emerald-400">{newVal}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setIsManageListOpen(false);
                          setSelectedItems([
                            {
                              key: origKey,
                              originalText: origKey,
                              currentValue: newVal === '__DELETED__' ? '' : newVal,
                              isDeleted: newVal === '__DELETED__'
                            }
                          ]);
                          setDraftValues({ [origKey]: newVal === '__DELETED__' ? '' : newVal });
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold cursor-pointer"
                      >
                        تعديل ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRestoreSingleItem(origKey, origKey)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>استعادة</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {overrideEntries.length > 0 && (
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={async () => {
                    await storageService.resetAllSiteTextOverrides();
                    setOverrides({});
                    overridesRef.current = {};
                    applyOverridesToDOM({});
                    showToast('تمت استعادة جميع نصوص الموقع الأصلية بنجاح! 🔄');
                  }}
                  className="px-4 py-2 rounded-xl bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-800 text-xs font-bold cursor-pointer"
                >
                  استعادة كافة النصوص الأصلية للموقع
                </button>
                <button
                  type="button"
                  onClick={() => setIsManageListOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
