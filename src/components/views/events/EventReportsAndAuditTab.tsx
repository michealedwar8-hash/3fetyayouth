import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  CommunityEvent,
  EventBus,
  PaymentTransaction,
  EventAuditLog,
  PaymentStatus,
  Registrant,
} from '../../../types';
import {
  EnrichedEventRegistration,
  UserEventPermissions,
} from '../../../services/eventsService';
import { exportToCSV } from '../../../services/storageService';
import {
  FileSpreadsheet,
  FileText,
  Printer,
  Users,
  DollarSign,
  UserCheck,
  Bus,
  History,
  Search,
  Download,
} from 'lucide-react';

interface EventReportsAndAuditTabProps {
  event: CommunityEvent;
  registrations: EnrichedEventRegistration[];
  buses: EventBus[];
  payments: PaymentTransaction[];
  auditLogs: EventAuditLog[];
  currentUser?: Registrant;
  userPermissions?: UserEventPermissions;
}

const PAYMENT_STATUS_AR: Record<PaymentStatus, string> = {
  paid: 'تم الدفع بنجاح',
  partially_paid: 'تم دفع جزء من الرسوم',
  pending_confirmation: 'في انتظار تأكيد الدفع',
  unpaid: 'في انتظار تأكيد الدفع',
  waived: 'إعفاء كامل',
  cancelled: 'ملغي',
};

const AUDIT_ACTION_BADGES: Record<string, { label: string; className: string }> = {
  event_created: { label: 'إنشاء فعالية', className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  event_updated: { label: 'تحديث فعالية', className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  member_registered: { label: 'تسجيل عضو', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  override_registration: { label: 'تسجيل استثنائي (Override)', className: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  group_registered: { label: 'تسجيل جماعي', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  registration_cancelled: { label: 'إلغاء تسجيل', className: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  registration_restored: { label: 'استعادة تسجيل', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  payment_added: { label: 'دفعة مالية', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  discount_updated: { label: 'تعديل خصم', className: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  bus_created: { label: 'إنشاء باص', className: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  bus_updated: { label: 'تعديل باص', className: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  bus_deleted: { label: 'حذف باص', className: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  bus_assigned: { label: 'تسكين/نقل باص', className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  attendance_checked_in: { label: 'تسجيل حضور', className: 'bg-teal-500/15 text-teal-300 border-teal-500/30' },
  attendance_revoked: { label: 'إلغاء حضور', className: 'bg-amber-500/15 text-amber-300 border-amber-300/30' },
};

type PdfReportType = 'registration' | 'financial' | 'bus' | 'attendance' | 'full';

function applyRtlAndAutoCols(ws: XLSX.WorkSheet, rows: Record<string, any>[]) {
  ws['!views'] = [{ rightToLeft: true }];
  if (!rows || rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  ws['!cols'] = keys.map((key) => {
    const maxCellLen = rows.reduce((max, row) => {
      const val = row[key] !== undefined && row[key] !== null ? String(row[key]) : '';
      return Math.max(max, val.length);
    }, key.length);
    return { wch: Math.min(Math.max(maxCellLen + 5, 14), 45) };
  });
}

export const EventReportsAndAuditTab: React.FC<EventReportsAndAuditTabProps> = ({
  event,
  registrations,
  buses,
  payments,
  auditLogs,
  currentUser,
  userPermissions,
}) => {
  const isBusAttendanceOnly = Boolean(userPermissions?.isBusAttendanceOnly);
  const onlyOwnAssigned = Boolean(userPermissions?.onlyOwnAssignedRegistrations);
  const canViewFinancials = userPermissions ? userPermissions.canViewPaymentDetails : true;
  const canViewAudit = userPermissions ? userPermissions.canManageEventSettings || userPermissions.isSuperAdmin : true;
  const assignedBusIds = userPermissions?.assignedBusIds || [];

  const [activeSubTab, setActiveSubTab] = useState<
    'registration' | 'payment' | 'attendance' | 'bus' | 'audit'
  >(isBusAttendanceOnly ? 'bus' : 'registration');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPdfReport, setSelectedPdfReport] = useState<PdfReportType>(
    isBusAttendanceOnly ? 'bus' : 'full'
  );

  // Scoped buses & registrations based on RBAC
  const scopedBuses = useMemo(() => {
    if (isBusAttendanceOnly && assignedBusIds.length > 0) {
      return buses.filter((b) => assignedBusIds.includes(b.id));
    }
    return buses;
  }, [buses, isBusAttendanceOnly, assignedBusIds]);

  const scopedRegistrations = useMemo(() => {
    let list = registrations;
    if (isBusAttendanceOnly && assignedBusIds.length > 0) {
      list = list.filter((r) => r.assignedBusId && assignedBusIds.includes(r.assignedBusId));
    } else if (onlyOwnAssigned && currentUser) {
      const uPhone = (currentUser.phone || '').replace(/\D/g, '');
      list = list.filter((r) => {
        if (r.assignedServantId && r.assignedServantId === currentUser.id) return true;
        if (r.selectedContactId && r.selectedContactId === currentUser.id) return true;
        const rPhone = (r.assignedServantPhone || r.selectedContactPhone || '').replace(/\D/g, '');
        if (uPhone && rPhone && uPhone === rPhone) return true;
        return false;
      });
    }
    return list;
  }, [registrations, isBusAttendanceOnly, assignedBusIds, onlyOwnAssigned, currentUser]);

  const activeRegistrations = useMemo(
    () => scopedRegistrations.filter((r) => r.registrationStatus !== 'cancelled'),
    [scopedRegistrations]
  );

  // Build standardized sheet rows
  const buildRegistrationSheetRows = () =>
    scopedRegistrations.map((r, i) => {
      const base: Record<string, any> = {
        'م': i + 1,
        'رقم الحجز': r.registrationReference,
        'اسم العضو': r.member?.fullName || '',
        'رقم الهاتف': r.member?.phone || '',
        'كود العضو': r.member?.uniqueCode || '',
        'الخادم المسؤول': r.assignedServantName || r.selectedContactName || '-',
        'نوع التسجيل': r.isOverride
          ? 'استثنائي (Override)'
          : r.registrationGroupId
          ? 'مجموعة'
          : 'فردي',
        'سبب الاستثناء': r.overrideReason || '-',
        'حالة التسجيل': r.registrationStatus === 'cancelled' ? 'ملغي' : 'نشط',
        'الباص': r.bus?.name || 'جاري توزيع الباصات',
      };
      if (canViewFinancials && !isBusAttendanceOnly) {
        base['حالة الدفع'] = PAYMENT_STATUS_AR[r.paymentStatus] || r.paymentStatus;
        base['المطلوب النهائي'] = Number(r.finalRequiredAmount || 0);
        base['المدفوع'] = Number(r.totalPaidAmount || 0);
        base['المتبقي'] = Number(r.remainingAmount || 0);
      }
      base['تاريخ التسجيل'] = new Date(r.createdAt).toLocaleString('ar-EG');
      return base;
    });

  const buildPaymentsSheetRows = () =>
    scopedRegistrations.map((r, i) => ({
      'م': i + 1,
      'رقم الحجز': r.registrationReference,
      'اسم العضو': r.member?.fullName || '',
      'الهاتف': r.member?.phone || '',
      'الخادم المسؤول': r.assignedServantName || r.selectedContactName || '-',
      'طريقة الدفع المختارة': r.paymentMethod || '-',
      'السعر الأساسي': Number(r.originalPrice || 0),
      'الخصم': Number(r.discountAmount || 0),
      'المطلوب النهائي': Number(r.finalRequiredAmount || 0),
      'إجمالي المدفوع': Number(r.totalPaidAmount || 0),
      'المتبقي': Number(r.remainingAmount || 0),
      'حالة الدفع': PAYMENT_STATUS_AR[r.paymentStatus] || r.paymentStatus,
      'عدد الدفعات': r.transactions.length,
    }));

  const buildBusesSheetRows = () =>
    scopedBuses.map((b, i) => {
      const list = activeRegistrations.filter((r) => r.assignedBusId === b.id);
      const presentCount = list.filter((r) => Boolean(r.attendance)).length;
      const reqSum = list.reduce((s, r) => s + Number(r.finalRequiredAmount || 0), 0);
      const paidSum = list.reduce((s, r) => s + Number(r.totalPaidAmount || 0), 0);
      const remSum = list.reduce((s, r) => s + Number(r.remainingAmount || 0), 0);
      const row: Record<string, any> = {
        'م': i + 1,
        'اسم الباص': b.name,
        'الخادم المسؤول عن الباص': b.responsibleServantName || b.driverName || '-',
        'هاتف الخادم المسؤول': b.responsibleServantPhone || b.driverPhone || '-',
        'السعة القصوى': Number(b.capacity || 0),
        'المسجلين بالباص': list.length,
        'المقاعد المتاحة': Math.max(0, Number(b.capacity || 0) - list.length),
        'الحضور الفعلي': presentCount,
        'الغياب': list.length - presentCount,
      };
      if (canViewFinancials && !isBusAttendanceOnly) {
        row['إجمالي المطلوب مالياً'] = reqSum;
        row['إجمالي المحصل'] = paidSum;
        row['إجمالي المتبقي'] = remSum;
      }
      return row;
    });

  const buildAttendanceSheetRows = () =>
    activeRegistrations.map((r, i) => ({
      'م': i + 1,
      'اسم العضو': r.member?.fullName || '',
      'الهاتف': r.member?.phone || '',
      'كود العضو': r.member?.uniqueCode || '',
      'الباص': r.bus?.name || 'غير مسكن',
      'الخادم المسؤول عن الباص':
        r.bus?.responsibleServantName || r.bus?.driverName || '-',
      'حالة الحضور': r.attendance ? 'حضر' : 'غائب / لم يحضر',
      'طريقة التحضير': r.attendance ? (r.attendance.method === 'qr' ? 'QR Code' : 'يدوي') : '-',
      'وقت الحضور': r.attendance
        ? new Date(r.attendance.checkInTime).toLocaleString('ar-EG')
        : '-',
      'تم التحضير بواسطة': r.attendance?.checkedInByName || '-',
    }));

  // Real Multi-Sheet Excel (.xlsx) Export respecting RBAC
  const handleExportWorkbookXLSX = () => {
    const safeName = event.name.replace(/\s+/g, '_');
    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };

    if (!isBusAttendanceOnly) {
      const regRows = buildRegistrationSheetRows();
      const wsReg = XLSX.utils.json_to_sheet(regRows);
      applyRtlAndAutoCols(wsReg, regRows);
      XLSX.utils.book_append_sheet(wb, wsReg, 'Registrations');
    }

    if (canViewFinancials && !isBusAttendanceOnly) {
      const payRows = buildPaymentsSheetRows();
      const wsPay = XLSX.utils.json_to_sheet(payRows);
      applyRtlAndAutoCols(wsPay, payRows);
      XLSX.utils.book_append_sheet(wb, wsPay, 'Payments');
    }

    const busRows = buildBusesSheetRows();
    const wsBus = XLSX.utils.json_to_sheet(busRows);
    applyRtlAndAutoCols(wsBus, busRows);
    XLSX.utils.book_append_sheet(wb, wsBus, 'Buses');

    const attRows = buildAttendanceSheetRows();
    const wsAtt = XLSX.utils.json_to_sheet(attRows);
    applyRtlAndAutoCols(wsAtt, attRows);
    XLSX.utils.book_append_sheet(wb, wsAtt, 'Attendance');

    XLSX.writeFile(wb, `بيانات_${safeName}.xlsx`);
  };

  // Export Current Sub-Tab CSV
  const handleExportCurrentCSV = () => {
    const safeName = event.name.replace(/\s+/g, '_');
    if (activeSubTab === 'registration' && !isBusAttendanceOnly) {
      exportToCSV(`تقرير_تسجيلات_${safeName}.csv`, buildRegistrationSheetRows());
    } else if (activeSubTab === 'payment' && canViewFinancials && !isBusAttendanceOnly) {
      exportToCSV(`التقرير_المالي_${safeName}.csv`, buildPaymentsSheetRows());
    } else if (activeSubTab === 'attendance') {
      exportToCSV(`تقرير_الحضور_${safeName}.csv`, buildAttendanceSheetRows());
    } else if (activeSubTab === 'bus') {
      exportToCSV(`تقرير_الباصات_${safeName}.csv`, buildBusesSheetRows());
    } else if (activeSubTab === 'audit' && canViewAudit) {
      const rows = auditLogs.map((l, i) => ({
        'م': i + 1,
        'التاريخ والوقت': new Date(l.timestamp || l.createdAt).toLocaleString('ar-EG'),
        'نوع العملية': AUDIT_ACTION_BADGES[l.actionType]?.label || l.actionType,
        'العضو المستهدف': l.targetMemberName || l.memberName || '-',
        'التفاصيل': l.description || l.newValue || '-',
        'بواسطة الخادم/المسؤول': l.performedByName || l.changedBy || '-',
      }));
      exportToCSV(`سجل_العمليات_${safeName}.csv`, rows);
    }
  };

  // Real PDF Report Generation via hidden iframe print-to-PDF (iframe-safe, full Arabic RTL)
  const handleGeneratePDFReport = (reportType: PdfReportType = selectedPdfReport) => {
    const includeReg =
      !isBusAttendanceOnly && (reportType === 'registration' || reportType === 'full');
    const includeFin =
      canViewFinancials &&
      !isBusAttendanceOnly &&
      (reportType === 'financial' || reportType === 'full');
    const includeBus = reportType === 'bus' || reportType === 'full';
    const includeAtt = reportType === 'attendance' || reportType === 'full';

    const reportTitles: Record<PdfReportType, string> = {
      registration: 'تقرير التسجيلات (Registration Report)',
      financial: 'التقرير المالي (Financial Report)',
      bus: 'تقرير الباصات والانتقالات (Bus Report)',
      attendance: 'تقرير الحضور والغياب (Attendance Report)',
      full: 'التقرير الشامل للفعالية (Full Event Report)',
    };

    const totalRequired = activeRegistrations.reduce(
      (s, r) => s + Number(r.finalRequiredAmount || 0),
      0
    );
    const totalCollected = activeRegistrations.reduce(
      (s, r) => s + Number(r.totalPaidAmount || 0),
      0
    );
    const totalRemaining = activeRegistrations.reduce(
      (s, r) => s + Number(r.remainingAmount || 0),
      0
    );
    const presentCount = activeRegistrations.filter((r) => Boolean(r.attendance)).length;

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${reportTitles[reportType]} - ${event.name}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      direction: rtl;
      text-align: right;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 12px;
    }
    .header {
      border-bottom: 2px solid #0284c7;
      padding-bottom: 10px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 { margin: 0 0 4px 0; font-size: 20px; color: #0f172a; }
    .header p { margin: 2px 0; color: #475569; font-size: 12px; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }
    .card {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 8px 12px;
      background: #f8fafc;
    }
    .card .label { font-size: 11px; color: #64748b; }
    .card .val { font-size: 15px; font-weight: bold; color: #0f172a; margin-top: 2px; }
    h2 {
      font-size: 15px;
      margin: 16px 0 8px 0;
      color: #0369a1;
      border-right: 4px solid #0284c7;
      padding-right: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 18px;
      font-size: 11px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      text-align: right;
    }
    th {
      background: #f1f5f9;
      color: #1e293b;
      font-weight: bold;
    }
    tr:nth-child(even) { background: #f8fafc; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${event.name} — ${reportTitles[reportType]}</h1>
      <p>المكان: ${event.location || '-'} | تاريخ الفعالية: ${event.startDate || '-'}</p>
    </div>
    <div>
      <p>تاريخ استخراج التقرير: ${new Date().toLocaleString('ar-EG')}</p>
      <p>بواسطة: ${currentUser?.fullName || 'إدارة الفعالية'}</p>
    </div>
  </div>

  <div class="summary-grid">
    <div class="card">
      <div class="label">إجمالي التسجيلات النشطة</div>
      <div class="val">${activeRegistrations.length}</div>
    </div>
    <div class="card">
      <div class="label">الحضور الفعلي / الغياب</div>
      <div class="val">${presentCount} حضر / ${activeRegistrations.length - presentCount} غائب</div>
    </div>
    <div class="card">
      <div class="label">عدد الباصات</div>
      <div class="val">${scopedBuses.length}</div>
    </div>
    ${
      canViewFinancials && !isBusAttendanceOnly
        ? `<div class="card">
            <div class="label">المحصل / المتبقي</div>
            <div class="val">${totalCollected.toLocaleString()} / ${totalRemaining.toLocaleString()} ${event.currency}</div>
          </div>`
        : `<div class="card">
            <div class="label">نطاق التقرير</div>
            <div class="val">مخصص حسب الصلاحية</div>
          </div>`
    }
  </div>

  ${
    includeReg
      ? `<h2>سجل التسجيلات (${scopedRegistrations.length})</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>رقم الحجز</th>
            <th>العضو</th>
            <th>الهاتف</th>
            <th>الخادم المسؤول</th>
            <th>نوع التسجيل</th>
            <th>الباص</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          ${scopedRegistrations
            .map(
              (r, idx) => `<tr>
                <td>${idx + 1}</td>
                <td>${r.registrationReference}</td>
                <td>${r.member?.fullName || ''}</td>
                <td dir="ltr">${r.member?.phone || ''}</td>
                <td>${r.assignedServantName || r.selectedContactName || '-'}</td>
                <td>${r.isOverride ? 'استثنائي (Override)' : r.registrationGroupId ? 'مجموعة' : 'فردي'}</td>
                <td>${r.bus?.name || 'جاري توزيع الباصات'}</td>
                <td>${r.registrationStatus === 'cancelled' ? 'ملغي' : 'نشط'}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>`
      : ''
  }

  ${
    includeFin
      ? `<h2>التقرير المالي (${scopedRegistrations.length}) — الإجمالي المطلوب: ${totalRequired.toLocaleString()} ${event.currency}</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>العضو</th>
            <th>الخادم المسؤول</th>
            <th>المطلوب النهائي</th>
            <th>المدفوع</th>
            <th>المتبقي</th>
            <th>حالة الدفع</th>
          </tr>
        </thead>
        <tbody>
          ${scopedRegistrations
            .map(
              (r, idx) => `<tr>
                <td>${idx + 1}</td>
                <td>${r.member?.fullName || ''}</td>
                <td>${r.assignedServantName || r.selectedContactName || '-'}</td>
                <td>${r.finalRequiredAmount} ${event.currency}</td>
                <td>${r.totalPaidAmount} ${event.currency}</td>
                <td>${r.remainingAmount} ${event.currency}</td>
                <td>${PAYMENT_STATUS_AR[r.paymentStatus] || r.paymentStatus}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>`
      : ''
  }

  ${
    includeBus
      ? `<h2>تقرير الباصات والانتقالات (${scopedBuses.length})</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>اسم الباص</th>
            <th>الخادم المسؤول عن الباص</th>
            <th>هاتف الخادم المسؤول</th>
            <th>المسجلين / السعة</th>
            <th>الحضور / الغياب</th>
          </tr>
        </thead>
        <tbody>
          ${scopedBuses
            .map((b, idx) => {
              const bList = activeRegistrations.filter((r) => r.assignedBusId === b.id);
              const bPres = bList.filter((r) => Boolean(r.attendance)).length;
              return `<tr>
                <td>${idx + 1}</td>
                <td>${b.name}</td>
                <td>${b.responsibleServantName || b.driverName || '-'}</td>
                <td dir="ltr">${b.responsibleServantPhone || b.driverPhone || '-'}</td>
                <td>${bList.length} / ${b.capacity}</td>
                <td>${bPres} حضر / ${bList.length - bPres} غائب</td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>`
      : ''
  }

  ${
    includeAtt
      ? `<h2>كشف الحضور والغياب (${activeRegistrations.length})</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>اسم العضو</th>
            <th>الهاتف</th>
            <th>الباص</th>
            <th>حالة الحضور</th>
            <th>وقت التحضير</th>
            <th>بواسطة</th>
          </tr>
        </thead>
        <tbody>
          ${activeRegistrations
            .map(
              (r, idx) => `<tr>
                <td>${idx + 1}</td>
                <td>${r.member?.fullName || ''}</td>
                <td dir="ltr">${r.member?.phone || ''}</td>
                <td>${r.bus?.name || 'غير مسكن'}</td>
                <td>${r.attendance ? 'حضر ✅' : 'غائب'}</td>
                <td>${r.attendance ? new Date(r.attendance.checkInTime).toLocaleString('ar-EG') : '-'}</td>
                <td>${r.attendance?.checkedInByName || '-'}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>`
      : ''
  }
</body>
</html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1500);
      }, 250);
    }
  };

  const filteredRegistrations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return scopedRegistrations;
    return scopedRegistrations.filter(
      (r) =>
        r.member?.fullName.toLowerCase().includes(q) ||
        r.member?.phone.includes(q) ||
        r.member?.uniqueCode.toLowerCase().includes(q) ||
        r.registrationReference.toLowerCase().includes(q) ||
        (r.assignedServantName && r.assignedServantName.toLowerCase().includes(q))
    );
  }, [scopedRegistrations, searchQuery]);

  const filteredAuditLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return auditLogs;
    return auditLogs.filter(
      (l) =>
        (l.description || '').toLowerCase().includes(q) ||
        (l.performedByName || l.changedBy || '').toLowerCase().includes(q) ||
        (l.targetMemberName && l.targetMemberName.toLowerCase().includes(q))
    );
  }, [auditLogs, searchQuery]);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Sub-Tabs Navigation & Export Data Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {!isBusAttendanceOnly && (
              <button
                onClick={() => setActiveSubTab('registration')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                  activeSubTab === 'registration'
                    ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>تقرير التسجيلات ({scopedRegistrations.length})</span>
              </button>
            )}

            {canViewFinancials && !isBusAttendanceOnly && (
              <button
                onClick={() => setActiveSubTab('payment')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                  activeSubTab === 'payment'
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <DollarSign className="w-4 h-4" />
                <span>التقرير المالي والمدفوعات ({scopedRegistrations.length})</span>
              </button>
            )}

            <button
              onClick={() => setActiveSubTab('attendance')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                activeSubTab === 'attendance'
                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>تقرير الحضور والغياب ({activeRegistrations.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('bus')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                activeSubTab === 'bus'
                  ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Bus className="w-4 h-4" />
              <span>تقرير الباصات والانتقالات ({scopedBuses.length})</span>
            </button>

            {canViewAudit && !isBusAttendanceOnly && (
              <button
                onClick={() => setActiveSubTab('audit')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                  activeSubTab === 'audit'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <History className="w-4 h-4" />
                <span>سجل الرقابة والعمليات ({auditLogs.length})</span>
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في التقرير..."
              className="w-full sm:w-64 bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        {/* Export Data Bar (Excel .xlsx + PDF Reports + CSV) */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-300 font-bold">
            <Download className="w-4 h-4 text-sky-400" />
            <span>تصدير البيانات والتقارير (Export Data):</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Real Multi-Sheet Excel (.xlsx) */}
            <button
              onClick={handleExportWorkbookXLSX}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black shadow-md shadow-emerald-500/20 transition"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير ملف Excel شامل (.xlsx)</span>
            </button>

            {/* Current Tab CSV */}
            <button
              onClick={handleExportCurrentCSV}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير الجدول الحالي (CSV)</span>
            </button>

            {/* PDF Report Selector + Export Button */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1">
              <select
                value={selectedPdfReport}
                onChange={(e) => setSelectedPdfReport(e.target.value as PdfReportType)}
                className="bg-transparent text-xs text-slate-200 font-bold px-2 py-1 focus:outline-none"
              >
                {!isBusAttendanceOnly && (
                  <option value="full" className="bg-slate-900">
                    التقرير الشامل للفعالية (Full Event Report)
                  </option>
                )}
                {!isBusAttendanceOnly && (
                  <option value="registration" className="bg-slate-900">
                    تقرير التسجيلات (Registration Report)
                  </option>
                )}
                {canViewFinancials && !isBusAttendanceOnly && (
                  <option value="financial" className="bg-slate-900">
                    التقرير المالي (Financial Report)
                  </option>
                )}
                <option value="bus" className="bg-slate-900">
                  تقرير الباصات (Bus Report)
                </option>
                <option value="attendance" className="bg-slate-900">
                  تقرير الحضور (Attendance Report)
                </option>
              </select>

              <button
                onClick={() => handleGeneratePDFReport(selectedPdfReport)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-bold transition"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>تصدير PDF</span>
              </button>
            </div>

            <button
              onClick={() => handleGeneratePDFReport(selectedPdfReport)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة</span>
            </button>
          </div>
        </div>
      </div>

      {/* Report Content Area */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 overflow-x-auto">
        {activeSubTab === 'registration' && !isBusAttendanceOnly && (
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">#</th>
                <th className="py-3 px-3">رقم الحجز</th>
                <th className="py-3 px-3">العضو</th>
                <th className="py-3 px-3">الهاتف / الكود</th>
                <th className="py-3 px-3">الخادم المسؤول</th>
                <th className="py-3 px-3">نوع التسجيل</th>
                <th className="py-3 px-3">الحالة</th>
                <th className="py-3 px-3">الباص</th>
                <th className="py-3 px-3">تاريخ التسجيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredRegistrations.map((r, i) => (
                <tr key={r.id} className="hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 font-mono text-slate-400">{i + 1}</td>
                  <td className="py-2.5 px-3 font-mono text-sky-400 font-bold">
                    {r.registrationReference}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-white">
                    {r.member?.fullName || 'عضو غير معروف'}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-300" dir="ltr">
                    {r.member?.phone} • #{r.member?.uniqueCode}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300 font-medium">
                    {r.assignedServantName || r.selectedContactName || '-'}
                  </td>
                  <td className="py-2.5 px-3">
                    {r.isOverride ? (
                      <span
                        title={r.overrideReason || ''}
                        className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold"
                      >
                        استثنائي (Override)
                      </span>
                    ) : r.registrationGroupId ? (
                      <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                        تسجيل جماعي
                      </span>
                    ) : (
                      <span className="text-slate-400">فردي</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    {r.registrationStatus === 'cancelled' ? (
                      <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        ملغي
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        نشط
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-sky-300 font-medium">
                    {r.bus?.name || 'جاري توزيع الباصات'}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-400">
                    {new Date(r.createdAt).toLocaleString('ar-EG')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeSubTab === 'payment' && canViewFinancials && !isBusAttendanceOnly && (
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">#</th>
                <th className="py-3 px-3">العضو</th>
                <th className="py-3 px-3">الخادم المسؤول</th>
                <th className="py-3 px-3">السعر الأساسي</th>
                <th className="py-3 px-3">الخصم</th>
                <th className="py-3 px-3">المطلوب النهائي</th>
                <th className="py-3 px-3">إجمالي المدفوع</th>
                <th className="py-3 px-3">المتبقي</th>
                <th className="py-3 px-3">حالة السداد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredRegistrations.map((r, i) => (
                <tr key={r.id} className="hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 font-mono text-slate-400">{i + 1}</td>
                  <td className="py-2.5 px-3 font-bold text-white">
                    {r.member?.fullName || 'عضو غير معروف'}
                    {r.registrationStatus === 'cancelled' && (
                      <span className="mr-2 text-[10px] text-rose-400">(تسجيل ملغي)</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">
                    {r.assignedServantName || r.selectedContactName || '-'}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-300">
                    {r.originalPrice} {event.currency}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-purple-400">
                    {r.discountAmount > 0 ? `- ${r.discountAmount} ${event.currency}` : '0'}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-white">
                    {r.finalRequiredAmount} {event.currency}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">
                    {r.totalPaidAmount} {event.currency}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-rose-400">
                    {r.remainingAmount} {event.currency}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-slate-200">
                    {PAYMENT_STATUS_AR[r.paymentStatus] || r.paymentStatus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeSubTab === 'attendance' && (
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">#</th>
                <th className="py-3 px-3">العضو</th>
                <th className="py-3 px-3">الباص</th>
                <th className="py-3 px-3">حالة الحضور</th>
                <th className="py-3 px-3">طريقة التحضير</th>
                <th className="py-3 px-3">وقت الحضور</th>
                <th className="py-3 px-3">بواسطة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredRegistrations
                .filter((r) => r.registrationStatus !== 'cancelled')
                .map((r, i) => (
                  <tr key={r.id} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-mono text-slate-400">{i + 1}</td>
                    <td className="py-2.5 px-3 font-bold text-white">
                      {r.member?.fullName || 'عضو غير معروف'}
                    </td>
                    <td className="py-2.5 px-3 text-sky-300">{r.bus?.name || 'غير مسكن'}</td>
                    <td className="py-2.5 px-3">
                      {r.attendance ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">
                          حضر
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                          لم يحضر
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {r.attendance
                        ? r.attendance.method === 'qr'
                          ? 'ماسح QR Code'
                          : 'تحضير يدوي'
                        : '-'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-300">
                      {r.attendance
                        ? new Date(r.attendance.checkInTime).toLocaleString('ar-EG')
                        : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {r.attendance?.checkedInByName || '-'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {activeSubTab === 'bus' && (
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">#</th>
                <th className="py-3 px-3">اسم الباص / المجموعة</th>
                <th className="py-3 px-3">الخادم المسؤول عن الباص والهاتف</th>
                <th className="py-3 px-3">الإشغال / السعة</th>
                <th className="py-3 px-3">الحضور / الغياب</th>
                {canViewFinancials && !isBusAttendanceOnly && (
                  <>
                    <th className="py-3 px-3">المطلوب مالياً</th>
                    <th className="py-3 px-3">إجمالي المحصل</th>
                    <th className="py-3 px-3">إجمالي المتبقي</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {scopedBuses.map((b, i) => {
                const list = activeRegistrations.filter((r) => r.assignedBusId === b.id);
                const presentCount = list.filter((r) => Boolean(r.attendance)).length;
                const reqSum = list.reduce((s, r) => s + r.finalRequiredAmount, 0);
                const paidSum = list.reduce((s, r) => s + r.totalPaidAmount, 0);
                const remSum = list.reduce((s, r) => s + r.remainingAmount, 0);
                const servantName = b.responsibleServantName || b.driverName || '-';
                const servantPhone = b.responsibleServantPhone || b.driverPhone || '';

                return (
                  <tr key={b.id} className="hover:bg-slate-800/40">
                    <td className="py-3 px-3 font-mono text-slate-400">{i + 1}</td>
                    <td className="py-3 px-3 font-bold text-white">{b.name}</td>
                    <td className="py-3 px-3 text-slate-300">
                      {servantName}{' '}
                      {servantPhone && (
                        <span className="font-mono text-slate-400" dir="ltr">
                          ({servantPhone})
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-sky-400">
                      {list.length} / {b.capacity}
                    </td>
                    <td className="py-3 px-3 font-mono">
                      <span className="text-emerald-400 font-bold">{presentCount} حضر</span> •{' '}
                      <span className="text-amber-400">{list.length - presentCount} غائب</span>
                    </td>
                    {canViewFinancials && !isBusAttendanceOnly && (
                      <>
                        <td className="py-3 px-3 font-mono font-bold text-white">
                          {reqSum.toLocaleString()} {event.currency}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                          {paidSum.toLocaleString()} {event.currency}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-rose-400">
                          {remSum.toLocaleString()} {event.currency}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {activeSubTab === 'audit' && canViewAudit && !isBusAttendanceOnly && (
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">التاريخ والوقت</th>
                <th className="py-3 px-3">نوع العملية</th>
                <th className="py-3 px-3">العضو المرتبط</th>
                <th className="py-3 px-3">التفاصيل الكاملة للعملية</th>
                <th className="py-3 px-3">بواسطة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredAuditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    لا توجد عمليات مسجلة في سجل الرقابة حتى الآن.
                  </td>
                </tr>
              ) : (
                filteredAuditLogs.map((log) => {
                  const badge = AUDIT_ACTION_BADGES[log.actionType] || {
                    label: log.actionType,
                    className: 'bg-slate-800 text-slate-300 border-slate-700',
                  };
                  return (
                    <tr key={log.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono text-slate-400 whitespace-nowrap">
                        {new Date(log.timestamp || log.createdAt).toLocaleString('ar-EG')}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded border text-[11px] font-bold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-white">
                        {log.targetMemberName || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-200">{log.description}</td>
                      <td className="py-2.5 px-3 text-sky-300 font-medium">
                        {log.performedByName}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
