import React, { useState, useMemo, useEffect } from 'react';
import {
  CommunityEvent,
  EventRegistration,
  PaymentMethodType,
  PaymentStatus,
  PaymentTransaction,
  Registrant
} from '../../../types';
import {
  eventsService,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS
} from '../../../services/eventsService';
import {
  CreditCard,
  DollarSign,
  Plus,
  Percent,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  Trash2,
  Receipt,
  User,
  FileText,
  X,
  ShieldCheck
} from 'lucide-react';

interface EventPaymentsTabProps {
  event: CommunityEvent;
  registrations: EventRegistration[];
  payments: PaymentTransaction[];
  allMembers: Registrant[];
  actorName: string;
  isSeniorAdmin: boolean;
  initialSelectedRegId?: string | null;
  onClearSelectedReg?: () => void;
  onRefresh: () => void;
}

export const EventPaymentsTab: React.FC<EventPaymentsTabProps> = ({
  event,
  registrations,
  payments,
  allMembers,
  actorName,
  isSeniorAdmin,
  initialSelectedRegId,
  onClearSelectedReg,
  onRefresh
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PaymentStatus>('all');
  const [selectedRegId, setSelectedRegId] = useState<string | null>(initialSelectedRegId || null);

  // Add Payment Form State
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMethod, setPayMethod] = useState<PaymentMethodType>(
    event.availablePaymentMethods?.[0] || 'vodafone_cash'
  );
  const [payReference, setPayReference] = useState<string>('');
  const [payDate, setPayDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState<string>('');
  const [allowOverPaymentOverride, setAllowOverPaymentOverride] = useState<boolean>(false);
  const [paymentMessage, setPaymentMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Discount Form State
  const [discountInput, setDiscountInput] = useState<string>('0');
  const [discountReasonInput, setDiscountReasonInput] = useState<string>('');
  const [discountMessage, setDiscountMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (initialSelectedRegId) {
      setSelectedRegId(initialSelectedRegId);
    }
  }, [initialSelectedRegId]);

  const membersMap = useMemo(() => {
    const map = new Map<string, Registrant>();
    allMembers.forEach(m => map.set(m.id, m));
    return map;
  }, [allMembers]);

  const activeRegistrations = useMemo(
    () => registrations.filter(r => r.registrationStatus !== 'cancelled'),
    [registrations]
  );

  const selectedRegistration = useMemo(
    () => registrations.find(r => r.id === selectedRegId) || null,
    [registrations, selectedRegId]
  );

  useEffect(() => {
    if (selectedRegistration) {
      setDiscountInput(String(selectedRegistration.discountAmount || 0));
      setDiscountReasonInput(selectedRegistration.discountReason || '');
      setPayAmount(selectedRegistration.remainingAmount > 0 ? String(selectedRegistration.remainingAmount) : '');
      setPaymentMessage(null);
      setDiscountMessage(null);
    }
  }, [selectedRegistration?.id, selectedRegistration?.remainingAmount, selectedRegistration?.discountAmount]);

  const selectedRegTransactions = useMemo(() => {
    if (!selectedRegistration) return [];
    return payments.filter(p => p.eventRegistrationId === selectedRegistration.id);
  }, [payments, selectedRegistration]);

  const filteredRegistrations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeRegistrations.filter(r => {
      if (statusFilter !== 'all' && r.paymentStatus !== statusFilter) return false;
      if (q) {
        const m = membersMap.get(r.memberId);
        const name = (m?.fullName || '').toLowerCase();
        const phone = (m?.phone || '').toLowerCase();
        const code = (m?.uniqueCode || '').toLowerCase();
        const ref = (r.registrationReference || '').toLowerCase();
        if (!name.includes(q) && !phone.includes(q) && !code.includes(q) && !ref.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [activeRegistrations, searchQuery, statusFilter, membersMap]);

  const stats = useMemo(() => eventsService.getEventSummaryStats(event.id), [event.id, registrations, payments]);

  const handleSaveDiscount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRegistration) return;
    setDiscountMessage(null);

    const res = eventsService.updateRegistrationDiscount({
      registrationId: selectedRegistration.id,
      discountAmount: Number(discountInput || 0),
      discountReason: discountReasonInput.trim(),
      actorName
    });

    if (!res.success) {
      setDiscountMessage({ type: 'error', text: res.error || 'تعذر حفظ الخصم.' });
      return;
    }

    setDiscountMessage({
      type: 'success',
      text: `✅ تم تحديث الخصم بنجاح. المبلغ النهائي المطلوب الآن: ${res.registration?.finalRequiredAmount} ${event.currency}`
    });
    onRefresh();
  };

  const handleAddPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRegistration) return;
    setPaymentMessage(null);

    const res = eventsService.addPaymentTransaction({
      registrationId: selectedRegistration.id,
      amount: Number(payAmount || 0),
      paymentMethod: payMethod,
      paymentReference: payReference,
      receivedBy: actorName,
      paymentDate: payDate,
      notes: payNotes,
      allowAdminOverPaymentOverride: allowOverPaymentOverride
    });

    if (!res.success) {
      setPaymentMessage({ type: 'error', text: res.error || 'تعذر تسجيل الدفعة.' });
      return;
    }

    setPaymentMessage({
      type: 'success',
      text: `✅ تم تسجيل دفعة بقيمة ${payAmount} ${event.currency} بنجاح!`
    });
    setPayReference('');
    setPayNotes('');
    setAllowOverPaymentOverride(false);
    onRefresh();
  };

  const handleQuickConfirmFullPayment = (reg: EventRegistration) => {
    setPaymentMessage(null);
    const res = eventsService.confirmFullRegistrationPayment({
      registrationId: reg.id,
      actorName,
      paymentMethod: reg.paymentMethod || payMethod,
      notes: 'تأكيد استلام الدفع الكامل'
    });
    if (!res.success) {
      setPaymentMessage({ type: 'error', text: res.error || 'تعذر تأكيد الدفع.' });
      return;
    }
    setPaymentMessage({
      type: 'success',
      text: `✅ تم تأكيد استلام كامل الاشتراك للعضو بنجاح!`
    });
    onRefresh();
  };

  const handleDeleteTransaction = (txId: string) => {
    eventsService.deletePaymentTransaction(txId, 'حذف حركة مالية من لوحة المدفوعات', actorName);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* Financial KPI Summary Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <span className="text-[11px] font-bold text-slate-500 block">إجمالي المطلوب بعد الخصم</span>
          <span className="text-xl font-black font-mono text-slate-900 tabular-nums mt-1 block">
            {stats.totalRequiredMoney.toLocaleString()} <span className="text-xs font-normal">{event.currency}</span>
          </span>
          {stats.totalDiscounts > 0 && (
            <span className="text-[11px] text-purple-700 font-mono block mt-0.5">
              إجمالي الخصومات/الدعم: {stats.totalDiscounts.toLocaleString()} {event.currency}
            </span>
          )}
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-200">
          <span className="text-[11px] font-bold text-emerald-700 block">إجمالي المحصّل الفعلي (Paid)</span>
          <span className="text-xl font-black font-mono text-emerald-700 tabular-nums mt-1 block">
            {stats.totalCollectedPaid.toLocaleString()} <span className="text-xs font-normal">{event.currency}</span>
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            {stats.paidCount} مدفوع بالكامل • {stats.partiallyPaidCount} جزئي
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200">
          <span className="text-[11px] font-bold text-amber-700 block">إجمالي المتبقي للتحصيل (Remaining)</span>
          <span className="text-xl font-black font-mono text-amber-700 tabular-nums mt-1 block">
            {stats.totalPendingRemaining.toLocaleString()} <span className="text-xs font-normal">{event.currency}</span>
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            {stats.pendingConfirmationCount > 0 ? `${stats.pendingConfirmationCount} بانتظار التأكيد • ` : ''}
            {stats.unpaidCount} غير مدفوع • {stats.waivedCount} معفى
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <span className="text-[11px] font-bold text-slate-500 block">إجمالي الحركات المالية المسجلة</span>
          <span className="text-xl font-black font-mono text-blue-700 tabular-nums mt-1 block">
            {payments.length} <span className="text-xs font-normal">عملية دفع</span>
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            السعر الأساسي للفعالية: {event.basePrice} {event.currency}
          </span>
        </div>
      </div>

      {/* Main Split Workspace: Left = Selected Member Financial Ledger, Right = Registrations Financial List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Registrations Financial List (7 Columns) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">
                سجل الحسابات الفردية وتأكيد المدفوعات ({filteredRegistrations.length})
              </h3>
              <span className="text-[11px] text-slate-500">اضغط على أي عضو لتأكيد الدفع أو إضافة دفعة جزئية</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="بحث بالاسم، الهاتف، أو رقم الحجز..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 pr-9 text-xs text-slate-900"
                />
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
              </div>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800"
              >
                <option value="all">كل الحالات المالية ({activeRegistrations.length})</option>
                <option value="pending_confirmation">بانتظار تأكيد الدفع ({stats.pendingConfirmationCount})</option>
                <option value="unpaid">غير مدفوع ({stats.unpaidCount})</option>
                <option value="partially_paid">مدفوع جزئياً ({stats.partiallyPaidCount})</option>
                <option value="paid">مدفوع بالكامل ({stats.paidCount})</option>
                <option value="waived">معفى بالكامل ({stats.waivedCount})</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-black sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">العضو</th>
                  <th className="py-2.5 px-2.5 text-left font-mono">الأصلي</th>
                  <th className="py-2.5 px-2.5 text-left font-mono">الخصم</th>
                  <th className="py-2.5 px-2.5 text-left font-mono">المطلوب</th>
                  <th className="py-2.5 px-2.5 text-left font-mono">المدفوع</th>
                  <th className="py-2.5 px-2.5 text-left font-mono">المتبقي</th>
                  <th className="py-2.5 px-3">الحالة والإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRegistrations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500">
                      لا توجد سجلات مطابقة.
                    </td>
                  </tr>
                ) : (
                  filteredRegistrations.map(reg => {
                    const member = membersMap.get(reg.memberId);
                    const isSelected = reg.id === selectedRegId;
                    const badge = PAYMENT_STATUS_LABELS[reg.paymentStatus] || PAYMENT_STATUS_LABELS.unpaid;

                    return (
                      <tr
                        key={reg.id}
                        onClick={() => setSelectedRegId(reg.id)}
                        className={`cursor-pointer transition ${
                          isSelected
                            ? 'bg-emerald-50/90 ring-1 ring-inset ring-emerald-400'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-black text-slate-900">{member?.fullName || 'عضو'}</div>
                          <div className="text-[10px] font-mono text-slate-500">
                            {reg.registrationReference} • {member?.uniqueCode}
                          </div>
                          {reg.selectedContactName && (
                            <div className="text-[10px] text-indigo-600 font-bold mt-0.5">
                              الخادم: {reg.selectedContactName}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-left font-mono tabular-nums text-slate-600">
                          {reg.originalPrice}
                        </td>
                        <td className="py-2.5 px-2.5 text-left font-mono tabular-nums text-purple-700 font-bold">
                          {reg.discountAmount > 0 ? `-${reg.discountAmount}` : '0'}
                        </td>
                        <td className="py-2.5 px-2.5 text-left font-mono tabular-nums font-black text-slate-900">
                          {reg.finalRequiredAmount}
                        </td>
                        <td className="py-2.5 px-2.5 text-left font-mono tabular-nums font-black text-emerald-700">
                          {reg.totalPaidAmount}
                        </td>
                        <td className="py-2.5 px-2.5 text-left font-mono tabular-nums font-black text-amber-700">
                          {reg.remainingAmount}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-col items-start gap-1">
                            <span className={`inline-flex px-2 py-0.5 rounded-lg border text-[10px] font-bold ${badge.badgeClass}`}>
                              {badge.label.split('(')[0].trim()}
                            </span>
                            {reg.remainingAmount > 0 && (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  setSelectedRegId(reg.id);
                                  handleQuickConfirmFullPayment(reg);
                                }}
                                className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold transition shadow-2xs"
                              >
                                ✓ تأكيد الدفع ({reg.remainingAmount})
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Registration Financial Inspector & Partial Payment Drawer (5 Columns) */}
        <div className="lg:col-span-5 space-y-4">
          {selectedRegistration ? (() => {
            const member = membersMap.get(selectedRegistration.memberId);
            const badge = PAYMENT_STATUS_LABELS[selectedRegistration.paymentStatus] || PAYMENT_STATUS_LABELS.unpaid;
            return (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-5">
                {/* Member Header */}
                <div className="flex items-start justify-between border-b border-slate-100 pb-3.5">
                  <div className="flex items-center gap-3">
                    {member?.photoUrl ? (
                      <img
                        src={member.photoUrl}
                        alt={member.fullName}
                        className="w-12 h-12 rounded-2xl object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-2xl bg-slate-200 flex items-center justify-center font-black text-slate-700">
                        {member?.fullName?.[0] || 'ع'}
                      </div>
                    )}
                    <div>
                      <h4 className="text-sm font-black text-slate-900">{member?.fullName}</h4>
                      <p className="text-[11px] font-mono text-slate-500">
                        {selectedRegistration.registrationReference} • {member?.phone}
                      </p>
                      <span className={`inline-flex mt-1 px-2.5 py-0.5 rounded-lg border text-[11px] font-bold ${badge.badgeClass}`}>
                        {badge.label}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRegId(null);
                      onClearSelectedReg?.();
                    }}
                    className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Price Breakdown Formula Box */}
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div>
                    <span className="text-[10px] text-slate-500 block">السعر الأصلي</span>
                    <span className="font-mono font-bold text-sm text-slate-800 tabular-nums">
                      {selectedRegistration.originalPrice}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-purple-700 block">الخصم الفردي</span>
                    <span className="font-mono font-bold text-sm text-purple-700 tabular-nums">
                      -{selectedRegistration.discountAmount}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-700 block">المدفوع</span>
                    <span className="font-mono font-black text-sm text-emerald-700 tabular-nums">
                      {selectedRegistration.totalPaidAmount}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-amber-800 block">المتبقي للدفع</span>
                    <span className="font-mono font-black text-sm text-amber-700 tabular-nums">
                      {selectedRegistration.remainingAmount}
                    </span>
                  </div>
                </div>

                {/* 1-Click Quick Confirm Full Remaining Payment */}
                {selectedRegistration.remainingAmount > 0 && (
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-black text-emerald-900">
                        تأكيد سريع لاستلام كامل الاشتراك المتبقي
                      </div>
                      <div className="text-[11px] text-emerald-700 mt-0.5">
                        يسجل استلام مبلغ ({selectedRegistration.remainingAmount} {event.currency}) ويحول الحالة إلى مدفوع بالكامل (Paid).
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleQuickConfirmFullPayment(selectedRegistration)}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shrink-0 shadow-sm cursor-pointer transition"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>✓ تأكيد الدفع الكامل ({selectedRegistration.remainingAmount} {event.currency})</span>
                    </button>
                  </div>
                )}

                {/* Section A: Record New Payment Transaction (Full or Partial) */}
                <form onSubmit={handleAddPayment} className="space-y-3 border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-emerald-600" />
                      <span>إضافة دفعة جزئية أو مخصصة (Add Partial Payment)</span>
                    </h5>
                    {selectedRegistration.remainingAmount > 0 && (
                      <button
                        type="button"
                        onClick={() => setPayAmount(String(selectedRegistration.remainingAmount))}
                        className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                      >
                        تعبئة المتبقي بالكامل ({selectedRegistration.remainingAmount})
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        المبلغ المدفوع ({event.currency}) *
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="1"
                        required
                        value={payAmount}
                        onChange={e => setPayAmount(e.target.value)}
                        placeholder="مثال: 200"
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono font-black text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">طريقة الدفع *</label>
                      <select
                        value={payMethod}
                        onChange={e => setPayMethod(e.target.value as PaymentMethodType)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                      >
                        {(['vodafone_cash', 'instapay', 'bank_transfer', 'cash', 'other'] as PaymentMethodType[]).map(m => (
                          <option key={m} value={m}>
                            {PAYMENT_METHOD_LABELS[m].icon} {PAYMENT_METHOD_LABELS[m].label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">رقم العملية / المرجع</label>
                      <input
                        type="text"
                        value={payReference}
                        onChange={e => setPayReference(e.target.value)}
                        placeholder="مثال: رقم التحويل..."
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">تاريخ الدفع</label>
                      <input
                        type="date"
                        value={payDate}
                        onChange={e => setPayDate(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <input
                      type="text"
                      value={payNotes}
                      onChange={e => setPayNotes(e.target.value)}
                      placeholder="ملاحظات على الدفعة (اختياري)..."
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
                    />
                  </div>

                  {isSeniorAdmin && (
                    <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowOverPaymentOverride}
                        onChange={e => setAllowOverPaymentOverride(e.target.checked)}
                        className="rounded-sm border-slate-300 text-emerald-600"
                      />
                      <span>سماح بتجاوز المبلغ المطلوب (Admin Over-Payment Override)</span>
                    </label>
                  )}

                  {paymentMessage && (
                    <div
                      className={`p-2.5 rounded-xl border text-xs font-bold ${
                        paymentMessage.type === 'success'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-red-50 border-red-200 text-red-900'
                      }`}
                    >
                      {paymentMessage.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>+ إضافة الدفعة وتحديث الرصيد</span>
                  </button>
                </form>

                {/* Section B: Individual Discount / Support without changing Event Base Price (Senior Admin / Event Manager only) */}
                {isSeniorAdmin && (
                  <form onSubmit={handleSaveDiscount} className="space-y-2.5 border-t border-slate-100 pt-3">
                    <h5 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <Percent className="w-4 h-4 text-purple-600" />
                      <span>تخصيص خصم / دعم مالي فردي (للمسؤولين الكبار فقط)</span>
                    </h5>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          قيمة الخصم ({event.currency})
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={selectedRegistration.originalPrice}
                          value={discountInput}
                          onChange={e => setDiscountInput(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">سبب الخصم / الإعفاء</label>
                        <input
                          type="text"
                          value={discountReasonInput}
                          onChange={e => setDiscountReasonInput(e.target.value)}
                          placeholder="مثال: دعم خدمة الشباب / أخوة..."
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDiscountInput(String(selectedRegistration.originalPrice));
                          setDiscountReasonInput('إعفاء كامل (Waived)');
                        }}
                        className="text-[11px] font-bold text-purple-700 hover:underline cursor-pointer"
                      >
                        إعفاء كامل 100% ({selectedRegistration.originalPrice} {event.currency})
                      </button>

                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs cursor-pointer transition"
                      >
                        حفظ الخصم
                      </button>
                    </div>

                    {discountMessage && (
                      <div
                        className={`p-2.5 rounded-xl border text-xs font-bold ${
                          discountMessage.type === 'success'
                            ? 'bg-purple-50 border-purple-200 text-purple-900'
                            : 'bg-red-50 border-red-200 text-red-900'
                        }`}
                      >
                        {discountMessage.text}
                      </div>
                    )}
                  </form>
                )}

                {/* Section C: Payment Transactions History for this Registration */}
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <h5 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-blue-600" />
                    <span>سجل الدفعات الجزئية والعمليات ({selectedRegTransactions.length})</span>
                  </h5>

                  {selectedRegTransactions.length === 0 ? (
                    <p className="text-xs text-slate-400 py-2">لا توجد دفعات مسجلة لهذا العضو حتى الآن.</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {selectedRegTransactions.map(tx => (
                        <div
                          key={tx.id}
                          className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black text-emerald-700">
                                +{tx.amount} {event.currency}
                              </span>
                              <span className="text-[11px] font-bold text-slate-700">
                                {PAYMENT_METHOD_LABELS[tx.paymentMethod]?.icon}{' '}
                                {PAYMENT_METHOD_LABELS[tx.paymentMethod]?.label}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                              بواسطة: {tx.receivedBy} • {tx.paymentDate}
                              {tx.paymentReference ? ` • مرجع: ${tx.paymentReference}` : ''}
                            </div>
                            {tx.notes && <div className="text-[10px] text-slate-600 mt-0.5">{tx.notes}</div>}
                          </div>

                          {isSeniorAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDeleteTransaction(tx.id)}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition cursor-pointer"
                              title="حذف الحركة المالية"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })() : (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                <CreditCard className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-black text-slate-900">اختر عضواً من الجدول لإدارة مدفوعاته</h4>
              <p className="text-xs text-slate-500">
                اضغط على أي صف في جدول الحسابات الفردية لإضافة دفعة كاملة أو جزئية، أو تخصيص خصم فردي، أو مراجعة تاريخ الدفعات.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
