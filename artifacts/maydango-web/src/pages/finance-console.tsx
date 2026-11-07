import { useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';
import {
  downloadFinancePartnerInvoice,
  useCancelAdminBooking,
  getGetFinanceAuditQueryKey,
  getGetFinanceOverviewQueryKey,
  getGetFinanceSettlementsQueryKey,
  useDecideFinanceReview,
  useGetFinanceAudit,
  useGetFinanceOverview,
  useGetFinanceSettlements,
  useGetOperations,
  useGrantLiveAccess,
  useRevokeLiveAccess,
  useRequestFinancePayoutTracking,
  useRequestFinanceRefund,
  useReviewPartnerFinanceInvoice,
} from '@workspace/api-client-react';
import type { FinanceOverview, FinanceReviewItem, FinanceSettlementSummary, GetFinanceSettlementsParams } from '@workspace/api-client-react';
import {
  Activity, ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Banknote,
  CalendarDays, CircleAlert, Clock3, FileCheck2, FileText,
  Filter, LockKeyhole, RefreshCw, Search, ShieldCheck, Users, WalletCards, X,
} from 'lucide-react';
import { Link, Redirect } from 'wouter';
import MembershipPlanManager from '@/pages/membership-plan-manager';

type Language = 'en' | 'ar' | 'ku';
type Tab = 'overview' | 'members' | 'bookings' | 'customer-invoices' | 'partner-invoices' | 'settlements' | 'reconciliation' | 'audit' | 'plans';
type AnyRecord = Record<string, unknown>;
type MemberRow = { userId: string; status: string; paymentStatus: string; tier: string; source: string; startsAt: string; endsAt: string };
type BookingRow = { id: string; userId: string; offeringId: string; title: string; partnerId: string; partnerName: string; facility: string; city: string; startsAt: string; status: string; createdAt: string };
type CustomerInvoiceRow = { id: string; userId: string; planId: string; planName: string; status: string; paymentStatus: string; amountIqd: number; refundStatus: string; periodStartsAt: string; periodEndsAt: string; createdAt: string; updatedAt: string };
type PartnerInvoiceRow = { id: string; partnerId: string; invoiceNumber: string; amountIqd: number; issuedAt: string; periodStart: string; periodEnd: string; documentName: string; status: string; submittedBy: string; createdAt: string };
type ReconRow = { id: string; eventType: string; status: string; receivedAt: string; processedAt: string | null };

const copy: Record<Language, Record<string, string>> = {
  en: {
    financeDesk: 'Finance desk', subtitle: 'A careful view of member billing, partner invoices and attendance evidence across Iraq.',
    overview: 'Overview', members: 'Memberships', bookings: 'Bookings', customerInvoices: 'Customer invoices', partnerInvoices: 'Partner invoices', settlements: 'Attendance & settlement', reconciliation: 'Reconciliation', audit: 'Audit history',
    admin: 'Administrator', finance: 'Finance reviewer', serverScope: 'Server-scoped records', refreshed: 'Review workspace', paymentGate: 'Customer payment gate', payoutGate: 'Live payout gate',
    open: 'Open', on: 'Enabled', off: 'Disabled', membersCount: 'Memberships in scope', invoicesCount: 'Customer invoices', partnerCount: 'Partners', pendingReviews: 'Reviews awaiting action',
    safeguards: 'Payment safeguards', noPayment: 'No payout is sent from this desk.', noAmount: 'Attendance does not calculate a settlement amount.', gateDisabled: 'Gate disabled', gateEnabled: 'Gate enabled',
    holdTitle: 'Attendance holds require attention', holdCopy: 'Disputed and on-hold visits must be cleared before a payout can be approved. Visit counts are evidence only; no settlement amount is calculated here.',
    verified: 'Verified visits', rejected: 'Rejected visits', disputed: 'Disputed visits', onHold: 'On hold', approvalGate: 'Payout approval gate',
    reviewQueue: 'Finance review queue', reviewCopy: 'Each decision is recorded. A requester cannot approve their own request.', refund: 'Refund', payout: 'Payout tracking', requestedBy: 'Requested by', reviewedBy: 'Reviewed by', reason: 'Reason',
    approve: 'Approve manually', reject: 'Reject', decisionReason: 'Reason for this decision', saveDecision: 'Record decision', cancel: 'Cancel', ownRequest: 'You cannot approve a request you submitted.',
    queuedRefund: 'Queue refund review', refundQueued: 'Refund request queued for review. No refund has been sent.', refundGateOff: 'Refund requests are disabled while the customer payment gate is off.',
    requestRefund: 'Request refund review', invoice: 'Invoice', status: 'Status', paymentStatus: 'Payment', amount: 'Amount', period: 'Period', customer: 'Customer', plan: 'Plan', created: 'Created', updated: 'Updated',
    partner: 'Partner', invoiceNumber: 'Invoice no.', issued: 'Issued', document: 'Document', download: 'Download PDF', invoiceReview: 'Review invoice', underReview: 'Under review', accepted: 'Accepted', rejectedInvoice: 'Rejected',
    settleNotice: 'Attendance totals only', noSettlementAmount: 'Settlement amount calculation is unavailable. Do not infer a rate or amount from visits.', group: 'Partner / facility / category', accessType: 'Access type',
    received: 'Received', processed: 'Processed', eventType: 'Event type', retry: 'Retry', loading: 'Loading finance records', deniedTitle: 'Finance access required', deniedCopy: 'This account is not authorized for the finance desk. Ask an administrator to review your access.',
    errorTitle: 'Finance records could not be loaded', emptyTitle: 'Nothing to review yet', emptyCopy: 'Records returned by the finance service will appear here.', search: 'Search this view', allStatuses: 'All statuses', noRows: 'No matching records.',
    language: 'Language', workspace: 'MaydanGo / Operations', ledger: 'Finance & controls', roleLabel: 'Authorized role', partnerPortal: 'Partner portal', adminTools: 'Admin operations', refresh: 'Refresh data',
    payoutTracking: 'Record payout tracking', trackingOnly: 'Manual tracking only — this does not transfer funds.', selectPartner: 'Partner', startDate: 'Period start', endDate: 'Period end', amountEntry: 'Amount on approved invoice (IQD)', submitTracking: 'Create tracking record', requestReason: 'Reason for this request',
    invoiceDecision: 'Invoice review decision', markReview: 'Set under review', acceptInvoice: 'Accept invoice', rejectInvoice: 'Reject invoice', note: 'Reason for the invoice decision', saved: 'Saved successfully.', reviewPending: 'Pending', status_rejected: 'Rejected', processing: 'Processing', approved_manual: 'Approved manually', failed: 'Failed', provider_pending: 'Provider pending', completed: 'Completed',
    noAudit: 'No audit events were returned.', noMembers: 'No membership records in this server scope.', noBookings: 'No bookings in this server scope.', noPartnerInvoices: 'No partner invoices in this server scope.', noCustomerInvoices: 'No customer invoices in this server scope.',
    noSettlementGroups: 'No attendance groups in this period.', periodFrom: 'From', periodTo: 'To', applyPeriod: 'Apply period', adminOnly: 'Admin-only destination',
    grantAccess: 'Grant access', revokeAccess: 'Revoke access', memberActions: 'Administrator membership actions', planChoice: 'Eligible plan', corporateId: 'Organization ID', actionReason: 'Reason for this action', confirmGrant: 'Grant eligible access', confirmRevoke: 'Revoke live access', bookingManage: 'Manage bookings in the operations portal', offering: 'Offering', cancelBooking: 'Cancel booking', bookingCancelReason: 'Reason for cancelling this booking', bookingCancelled: 'Booking cancelled. The waitlist was checked.', bookingCancelError: 'Booking could not be cancelled. Please retry.', decisionError: 'Decision could not be recorded. Please retry.', refundError: 'Refund review could not be queued. Please retry.', payoutError: 'Payout tracking could not be recorded. Please retry.', invoiceError: 'Invoice review could not be saved. Please retry.', downloadError: 'Invoice document could not be downloaded.', grantError: 'Membership access could not be granted. Please retry.', revokeError: 'Membership access could not be revoked. Please retry.',
  },
  ar: {
    financeDesk: 'مكتب المالية', subtitle: 'عرض دقيق لفواتير الأعضاء والشركاء وأدلة الحضور في أنحاء العراق.',
    overview: 'نظرة عامة', members: 'العضويات', bookings: 'الحجوزات', customerInvoices: 'فواتير العملاء', partnerInvoices: 'فواتير الشركاء', settlements: 'الحضور والتسوية', reconciliation: 'المطابقة', audit: 'سجل التدقيق',
    admin: 'مدير', finance: 'مراجع مالي', serverScope: 'سجلات محددة من الخادم', refreshed: 'مساحة المراجعة', paymentGate: 'بوابة مدفوعات العملاء', payoutGate: 'بوابة الدفع المباشر',
    open: 'مفتوح', on: 'مفعّل', off: 'متوقف', membersCount: 'العضويات ضمن النطاق', invoicesCount: 'فواتير العملاء', partnerCount: 'الشركاء', pendingReviews: 'مراجعات تنتظر الإجراء',
    safeguards: 'ضوابط الدفع', noPayment: 'لا يتم إرسال أي دفعة من هذا المكتب.', noAmount: 'لا يحسب الحضور مبلغ التسوية.', gateDisabled: 'البوابة متوقفة', gateEnabled: 'البوابة مفعّلة',
    holdTitle: 'تحتاج حالات تعليق الحضور إلى مراجعة', holdCopy: 'يجب تسوية الزيارات المتنازع عليها أو المعلقة قبل اعتماد الدفع. أعداد الزيارات أدلة فقط؛ ولا يُحسب مبلغ هنا.',
    verified: 'زيارات مؤكدة', rejected: 'زيارات مرفوضة', disputed: 'زيارات متنازع عليها', onHold: 'معلقة', approvalGate: 'بوابة اعتماد الدفع',
    reviewQueue: 'قائمة مراجعة المالية', reviewCopy: 'يُسجل كل قرار. لا يمكن لمقدم الطلب اعتماد طلبه.', refund: 'استرداد', payout: 'تتبع الدفع', requestedBy: 'مقدم الطلب', reviewedBy: 'تمت المراجعة بواسطة', reason: 'السبب',
    approve: 'اعتماد يدوي', reject: 'رفض', decisionReason: 'سبب هذا القرار', saveDecision: 'تسجيل القرار', cancel: 'إلغاء', ownRequest: 'لا يمكنك اعتماد طلب قدمته بنفسك.',
    queuedRefund: 'إضافة طلب استرداد للمراجعة', refundQueued: 'تم وضع طلب الاسترداد في قائمة المراجعة. لم يتم إرسال أي استرداد.', refundGateOff: 'طلبات الاسترداد متوقفة ما دامت بوابة مدفوعات العملاء متوقفة.',
    requestRefund: 'طلب مراجعة استرداد', invoice: 'الفاتورة', status: 'الحالة', paymentStatus: 'الدفع', amount: 'المبلغ', period: 'الفترة', customer: 'العميل', plan: 'الخطة', created: 'تاريخ الإنشاء', updated: 'آخر تحديث',
    partner: 'الشريك', invoiceNumber: 'رقم الفاتورة', issued: 'تاريخ الإصدار', document: 'المستند', download: 'تنزيل PDF', invoiceReview: 'مراجعة الفاتورة', underReview: 'قيد المراجعة', accepted: 'مقبولة', rejectedInvoice: 'مرفوضة',
    settleNotice: 'إجمالي الحضور فقط', noSettlementAmount: 'حساب مبلغ التسوية غير متاح. لا تستنتج سعراً أو مبلغاً من عدد الزيارات.', group: 'الشريك / المرفق / الفئة', accessType: 'نوع الوصول',
    received: 'تاريخ الاستلام', processed: 'تاريخ المعالجة', eventType: 'نوع الحدث', retry: 'إعادة المحاولة', loading: 'جارٍ تحميل سجلات المالية', deniedTitle: 'الوصول المالي مطلوب', deniedCopy: 'هذا الحساب غير مخول لدخول مكتب المالية. اطلب من مدير مراجعة صلاحياتك.',
    errorTitle: 'تعذر تحميل السجلات المالية', emptyTitle: 'لا توجد عناصر للمراجعة بعد', emptyCopy: 'ستظهر هنا السجلات التي يعيدها نظام المالية.', search: 'ابحث في هذا العرض', allStatuses: 'كل الحالات', noRows: 'لا توجد سجلات مطابقة.',
    language: 'اللغة', workspace: 'MaydanGo / العمليات', ledger: 'المالية والضوابط', roleLabel: 'الدور المصرح', partnerPortal: 'بوابة الشركاء', adminTools: 'عمليات المدير', refresh: 'تحديث البيانات',
    payoutTracking: 'تسجيل تتبع الدفع', trackingOnly: 'تتبع يدوي فقط — لا يحول الأموال.', selectPartner: 'الشريك', startDate: 'بداية الفترة', endDate: 'نهاية الفترة', amountEntry: 'المبلغ في الفاتورة المعتمدة (دينار عراقي)', submitTracking: 'إنشاء سجل تتبع', requestReason: 'سبب هذا الطلب',
    invoiceDecision: 'قرار مراجعة الفاتورة', markReview: 'تعيين قيد المراجعة', acceptInvoice: 'قبول الفاتورة', rejectInvoice: 'رفض الفاتورة', note: 'سبب قرار الفاتورة', saved: 'تم الحفظ بنجاح.', reviewPending: 'قيد الانتظار', status_rejected: 'مرفوض', processing: 'قيد المعالجة', approved_manual: 'معتمد يدوياً', failed: 'فشل', provider_pending: 'بانتظار المزود', completed: 'مكتمل',
    noAudit: 'لم يتم إرجاع أحداث تدقيق.', noMembers: 'لا توجد عضويات ضمن نطاق الخادم.', noBookings: 'لا توجد حجوزات ضمن نطاق الخادم.', noPartnerInvoices: 'لا توجد فواتير شركاء ضمن النطاق.', noCustomerInvoices: 'لا توجد فواتير عملاء ضمن النطاق.',
    noSettlementGroups: 'لا توجد مجموعات حضور في هذه الفترة.', periodFrom: 'من', periodTo: 'إلى', applyPeriod: 'تطبيق الفترة', adminOnly: 'وجهة للمدير فقط',
    grantAccess: 'منح الوصول', revokeAccess: 'إلغاء الوصول', memberActions: 'إجراءات عضوية للمدير', planChoice: 'الخطة المؤهلة', corporateId: 'معرّف المؤسسة', actionReason: 'سبب هذا الإجراء', confirmGrant: 'منح الوصول المؤهل', confirmRevoke: 'إلغاء الوصول المباشر', bookingManage: 'إدارة الحجوزات من بوابة العمليات', offering: 'النشاط', cancelBooking: 'إلغاء الحجز', bookingCancelReason: 'سبب إلغاء هذا الحجز', bookingCancelled: 'تم إلغاء الحجز والتحقق من قائمة الانتظار.', bookingCancelError: 'تعذر إلغاء الحجز. يرجى المحاولة مرة أخرى.', decisionError: 'تعذر تسجيل القرار. يرجى المحاولة مرة أخرى.', refundError: 'تعذر إضافة طلب الاسترداد للمراجعة. يرجى المحاولة مرة أخرى.', payoutError: 'تعذر تسجيل تتبع الدفع. يرجى المحاولة مرة أخرى.', invoiceError: 'تعذر حفظ مراجعة الفاتورة. يرجى المحاولة مرة أخرى.', downloadError: 'تعذر تنزيل مستند الفاتورة.', grantError: 'تعذر منح الوصول. يرجى المحاولة مرة أخرى.', revokeError: 'تعذر إلغاء الوصول. يرجى المحاولة مرة أخرى.',
  },
  ku: {
    financeDesk: 'مێزی دارایی', subtitle: 'بینینێکی ورد بۆ پسووڵەی ئەندامان و هاوبەشان و بەڵگەی ئامادەبوون لە سەرانسەری عێراق.',
    overview: 'پوختە', members: 'ئەندامێتییەکان', bookings: 'حجزەکان', customerInvoices: 'پسووڵەی کڕیاران', partnerInvoices: 'پسووڵەی هاوبەشان', settlements: 'ئامادەبوون و یەکلاکردنەوە', reconciliation: 'هاوتاکردن', audit: 'مێژووی پشکنین',
    admin: 'بەڕێوەبەر', finance: 'پێداچوونەوەکاری دارایی', serverScope: 'تۆمارەکانی سنوورداری سێرڤەر', refreshed: 'شوێنی پێداچوونەوە', paymentGate: 'دەروازەی پارەدانی کڕیار', payoutGate: 'دەروازەی پارەدانی ڕاستەوخۆ',
    open: 'کراوە', on: 'چالاکە', off: 'ناچالاکە', membersCount: 'ئەندامێتی لە سنووردا', invoicesCount: 'پسووڵەی کڕیاران', partnerCount: 'هاوبەشان', pendingReviews: 'پێداچوونەوەی چاوەڕوان',
    safeguards: 'پاراستنی پارەدان', noPayment: 'هیچ پارەیەک لەم مێزەوە نانێردرێت.', noAmount: 'ئامادەبوون بڕی یەکلاکردنەوە حساب ناکات.', gateDisabled: 'دەروازە ناچالاکە', gateEnabled: 'دەروازە چالاکە',
    holdTitle: 'پشکنینی دۆخی ڕاگیراوی ئامادەبوون پێویستە', holdCopy: 'پێش پەسەندکردنی پارەدان، سەردانە مشتومڕهەڵگر و ڕاگیراوەکان دەبێت چارەسەر بکرێن. ژمارەی سەردان تەنها بەڵگەیە؛ لێرە بڕی پارە حساب ناکرێت.',
    verified: 'سەردانی پشتڕاستکراو', rejected: 'سەردانی ڕەتکراو', disputed: 'سەردانی مشتومڕهەڵگر', onHold: 'ڕاگیراو', approvalGate: 'دەروازەی پەسەندکردنی پارەدان',
    reviewQueue: 'ڕیزی پێداچوونەوەی دارایی', reviewCopy: 'هەر بڕیارێک تۆمار دەکرێت. داواکاری خۆت پەسەند مەکە.', refund: 'گەڕاندنەوەی پارە', payout: 'بەدواداچوونی پارەدان', requestedBy: 'داواکەر', reviewedBy: 'پێداچوونەوەکار', reason: 'هۆکار',
    approve: 'پەسەندکردنی دەستی', reject: 'ڕەتکردنەوە', decisionReason: 'هۆکاری ئەم بڕیارە', saveDecision: 'بڕیار تۆمار بکە', cancel: 'هەڵوەشاندنەوە', ownRequest: 'ناتوانیت داواکاری خۆت پەسەند بکەیت.',
    queuedRefund: 'داوای گەڕاندنەوە بخەرە ڕیز', refundQueued: 'داوای گەڕاندنەوە بۆ پێداچوونەوە تۆمار کرا. هیچ پارەیەک نەگەڕێندراوەتەوە.', refundGateOff: 'کاتێک دەروازەی پارەدانی کڕیار داخراوە، داوای گەڕاندنەوە ناچالاکە.',
    requestRefund: 'داوای پێداچوونەوەی گەڕاندنەوە', invoice: 'پسووڵە', status: 'دۆخ', paymentStatus: 'پارەدان', amount: 'بڕ', period: 'ماوە', customer: 'کڕیار', plan: 'پلان', created: 'دروستکراوە', updated: 'نوێکراوەتەوە',
    partner: 'هاوبەش', invoiceNumber: 'ژمارەی پسووڵە', issued: 'دەرچووە', document: 'بەڵگەنامە', download: 'داگرتنی PDF', invoiceReview: 'پێداچوونەوەی پسووڵە', underReview: 'لە پێداچوونەوەدایە', accepted: 'پەسەندکراوە', rejectedInvoice: 'ڕەتکراوەتەوە',
    settleNotice: 'کۆی ئامادەبوون تەنها', noSettlementAmount: 'حسابکردنی بڕی یەکلاکردنەوە بەردەست نییە. لە ژمارەی سەردانەوە نرخ یان بڕ دەرنەهێنە.', group: 'هاوبەش / شوێن / جۆر', accessType: 'جۆری دەستگەیشتن',
    received: 'وەرگیراوە', processed: 'پرۆسە کراوە', eventType: 'جۆری ڕووداو', retry: 'دووبارە هەوڵبدە', loading: 'تۆمارە داراییەکان بار دەکرێن', deniedTitle: 'دەستگەیشتنی دارایی پێویستە', deniedCopy: 'ئەم هەژمارە ڕێگەی چوونە ژوورەوەی مێزی دارایی نییە. داوا لە بەڕێوەبەر بکە دەستگەیشتنت بپشکنێت.',
    errorTitle: 'نەتوانرا تۆمارە داراییەکان باربکرێن', emptyTitle: 'هێشتا هیچ شتێک بۆ پێداچوونەوە نییە', emptyCopy: 'تۆمارەکانی خزمەتگوزاری دارایی لێرە دەردەکەون.', search: 'لەم بینینە بگەڕێ', allStatuses: 'هەموو دۆخەکان', noRows: 'هیچ تۆمارێکی هاوتا نییە.',
    language: 'زمان', workspace: 'MaydanGo / کارگێڕی', ledger: 'دارایی و کۆنترۆڵ', roleLabel: 'ڕۆڵی ڕێگەپێدراو', partnerPortal: 'دەروازەی هاوبەش', adminTools: 'کارگێڕی بەڕێوەبەر', refresh: 'نوێکردنەوەی داتا',
    payoutTracking: 'تۆمارکردنی بەدواداچوونی پارەدان', trackingOnly: 'بەدواداچوونی دەستی تەنها — پارە ناگوازێتەوە.', selectPartner: 'هاوبەش', startDate: 'دەستپێکی ماوە', endDate: 'کۆتایی ماوە', amountEntry: 'بڕی پسووڵەی پەسەندکراو (دیناری عێراقی)', submitTracking: 'تۆماری بەدواداچوون دروست بکە', requestReason: 'هۆکاری ئەم داواکارییە',
    invoiceDecision: 'بڕیاری پێداچوونەوەی پسووڵە', markReview: 'بیکە لە پێداچوونەوەدا', acceptInvoice: 'پسووڵە قبوڵ بکە', rejectInvoice: 'پسووڵە ڕەت بکەرەوە', note: 'هۆکاری بڕیاری پسووڵە', saved: 'بە سەرکەوتوویی پاشەکەوت کرا.', reviewPending: 'چاوەڕوان', status_rejected: 'ڕەتکراوە', processing: 'لە پرۆسەدایە', approved_manual: 'بە دەستی پەسەندکرا', failed: 'شکستی هێنا', provider_pending: 'چاوەڕوانی دابینکەر', completed: 'تەواو',
    noAudit: 'هیچ ڕووداوێکی پشکنین نەگەڕاوەتەوە.', noMembers: 'هیچ تۆماری ئەندامێتی لەم سنوورەدا نییە.', noBookings: 'هیچ حجزێک لەم سنوورەدا نییە.', noPartnerInvoices: 'هیچ پسووڵەی هاوبەشێک نییە.', noCustomerInvoices: 'هیچ پسووڵەی کڕیارێک نییە.',
    noSettlementGroups: 'هیچ گرووپی ئامادەبوون لەم ماوەیەدا نییە.', periodFrom: 'لە', periodTo: 'بۆ', applyPeriod: 'ماوەکە جێبەجێ بکە', adminOnly: 'تەنها بۆ بەڕێوەبەر',
    grantAccess: 'دەستگەیشتن ببەخشە', revokeAccess: 'دەستگەیشتن هەڵبوەشێنەوە', memberActions: 'کرداری ئەندامێتی بۆ بەڕێوەبەر', planChoice: 'پلانی شیاو', corporateId: 'ناسنامەی دامەزراوە', actionReason: 'هۆکاری ئەم کردارە', confirmGrant: 'دەستگەیشتنی شیاو ببەخشە', confirmRevoke: 'دەستگەیشتنی چالاک هەڵبوەشێنەوە', bookingManage: 'حجزەکان لە دەروازەی کارگێڕی بەڕێوەبە', offering: 'چالاکی', cancelBooking: 'حجز هەڵبوەشێنەوە', bookingCancelReason: 'هۆکاری هەڵوەشاندنەوەی ئەم حجزە', bookingCancelled: 'حجزەکە هەڵوەشێندرایەوە و لیستی چاوەڕوانی پشکنرا.', bookingCancelError: 'نەتوانرا حجزەکە هەڵبوەشێندرێتەوە. تکایە دووبارە هەوڵ بدەرەوە.', decisionError: 'نەتوانرا بڕیارەکە تۆمار بکرێت. تکایە دووبارە هەوڵ بدەرەوە.', refundError: 'نەتوانرا داوای گەڕاندنەوە بخاتە پێداچوونەوە. تکایە دووبارە هەوڵ بدەرەوە.', payoutError: 'نەتوانرا بەدواداچوونی پارەدان تۆمار بکرێت. تکایە دووبارە هەوڵ بدەرەوە.', invoiceError: 'نەتوانرا پێداچوونەوەی پسووڵە پاشەکەوت بکرێت. تکایە دووبارە هەوڵ بدەرەوە.', downloadError: 'نەتوانرا بەڵگەنامەی پسووڵە دابگیرێت.', grantError: 'نەتوانرا دەستگەیشتن ببەخشێت. تکایە دووبارە هەوڵ بدەرەوە.', revokeError: 'نەتوانرا دەستگەیشتن هەڵبوەشێندرێتەوە. تکایە دووبارە هەوڵ بدەرەوە.',
  },
};

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const defaultFrom = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return dateOnly(d); })();
const defaultTo = dateOnly(new Date());
const asRecord = (value: unknown): AnyRecord => value && typeof value === 'object' ? value as AnyRecord : {};
const str = (value: unknown, fallback = '—') => typeof value === 'string' && value ? value : fallback;
const formatDate = (value: unknown, locale = 'en-IQ') => {
  if (typeof value !== 'string' || !value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Baghdad' }).format(date);
};
const formatIqd = (value: unknown) => typeof value === 'number' ? new Intl.NumberFormat('en-IQ').format(value) : '—';
const field = 'w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2 text-sm text-[#173d35] outline-none focus:border-[#28695a] focus:ring-2 focus:ring-[#28695a]/15';

function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' }) {
  const tones = { neutral: 'bg-[#e9e5d7] text-[#4d6057]', green: 'bg-[#e0eee3] text-[#2d6947]', amber: 'bg-[#f7ecd4] text-[#85601b]', red: 'bg-[#f7e4de] text-[#9a4435]', blue: 'bg-[#e1ecea] text-[#315e5b]' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] ${tones[tone]}`}>{children}</span>;
}

function Panel({ title, subtitle, children, action }: { title: string; subtitle?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="rounded-2xl border border-[#ded8c9] bg-[#fffdf7] shadow-[0_8px_24px_rgba(39,61,49,.04)]">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eee9de] px-5 py-4 md:px-6">
      <div><h2 className="text-sm font-bold tracking-tight text-[#173d35]">{title}</h2>{subtitle && <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#738078]">{subtitle}</p>}</div>{action}
    </div>
    {children}
  </section>;
}

function Empty({ title, text }: { title: string; text?: string }) {
  return <div className="px-6 py-12 text-center" data-testid="state-empty"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1eddf] text-[#557167]"><FileCheck2 size={18} /></div><p className="mt-3 text-sm font-semibold text-[#29483e]">{title}</p>{text && <p className="mt-1 text-xs text-[#738078]">{text}</p>}</div>;
}

function LoadingState({ label }: { label: string }) {
  return <div className="min-h-[70vh] bg-[#f5f2e9] p-5 md:p-9" data-testid="finance-loading"><div className="mx-auto max-w-[1500px] animate-pulse space-y-5"><div className="h-4 w-40 rounded bg-[#e4dfd2]" /><div className="h-10 w-72 rounded bg-[#e4dfd2]" /><div className="grid gap-4 md:grid-cols-4">{[1,2,3,4].map(n => <div key={n} className="h-28 rounded-2xl bg-[#e9e4d7]" />)}</div><div className="h-80 rounded-2xl bg-[#e9e4d7]" /><span className="sr-only">{label}</span></div></div>;
}

export default function FinanceConsole() {
  const queryClient = useQueryClient();
  const { userId, isLoaded, isSignedIn } = useAuth();
  const [language, setLanguage] = useState<Language>('en');
  const [tab, setTab] = useState<Tab>('overview');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [period, setPeriod] = useState<GetFinanceSettlementsParams>({ from: defaultFrom, to: defaultTo });
  const [feedback, setFeedback] = useState('');
  const [activeReview, setActiveReview] = useState<FinanceReviewItem | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [refundInvoice, setRefundInvoice] = useState<CustomerInvoiceRow | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [invoiceReview, setInvoiceReview] = useState<PartnerInvoiceRow | null>(null);
  const [invoiceStatus, setInvoiceStatus] = useState<'under_review' | 'accepted' | 'rejected'>('under_review');
  const [invoiceReason, setInvoiceReason] = useState('');
  const [payoutInvoice, setPayoutInvoice] = useState<PartnerInvoiceRow | null>(null);
  const [payoutReason, setPayoutReason] = useState('');
  const [membershipAction, setMembershipAction] = useState<{ member: MemberRow; action: 'grant' | 'revoke' } | null>(null);
  const [membershipPlanId, setMembershipPlanId] = useState('');
  const [membershipCorporateId, setMembershipCorporateId] = useState('');
  const [membershipReason, setMembershipReason] = useState('');
  const [bookingToCancel, setBookingToCancel] = useState<BookingRow | null>(null);
  const [bookingCancelReason, setBookingCancelReason] = useState('');
  const [busyId, setBusyId] = useState('');
  const t = (key: string) => copy[language][key] ?? key;
  const rtl = language === 'ar' || language === 'ku';

  const payoutPeriod = activeReview?.kind === 'payout' && activeReview.periodStart && activeReview.periodEnd
    ? { from: activeReview.periodStart.slice(0, 10), to: activeReview.periodEnd.slice(0, 10) }
    : null;
  const settlementPeriod = payoutPeriod ?? period;
  const overviewQuery = useGetFinanceOverview({ query: { queryKey: getGetFinanceOverviewQueryKey(), refetchOnMount: 'always', enabled: isLoaded && isSignedIn } });
  const settlementsQuery = useGetFinanceSettlements(settlementPeriod, { query: { queryKey: getGetFinanceSettlementsQueryKey(settlementPeriod), refetchOnMount: 'always', enabled: isLoaded && isSignedIn } });
  const auditQuery = useGetFinanceAudit({ query: { queryKey: getGetFinanceAuditQueryKey(), refetchOnMount: 'always', enabled: isLoaded && isSignedIn } });
  const operationsQuery = useGetOperations({ query: { enabled: isLoaded && isSignedIn && overviewQuery.data?.role === 'admin', refetchOnMount: 'always', retry: false } });
  const refundMutation = useRequestFinanceRefund();
  const payoutMutation = useRequestFinancePayoutTracking();
  const decideMutation = useDecideFinanceReview();
  const invoiceMutation = useReviewPartnerFinanceInvoice();
  const grantMutation = useGrantLiveAccess();
  const revokeMutation = useRevokeLiveAccess();
  const cancelBookingMutation = useCancelAdminBooking();

  const invalidateFinance = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetFinanceOverviewQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetFinanceSettlementsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetFinanceAuditQueryKey() }),
    ]);
  };
  const data = overviewQuery.data as FinanceOverview | undefined;
  const role = data?.role;
  const allowed = role === 'admin' || role === 'finance';
  const locale = language === 'ar' ? 'ar-IQ' : language === 'ku' ? 'ku-IQ' : 'en-IQ';
  const members = (data?.customers ?? []).map(row => asRecord(row) as unknown as MemberRow);
  const bookings = (data?.bookings ?? []).map(row => asRecord(row) as unknown as BookingRow);
  const customerInvoices = (data?.customerInvoices ?? []).map(row => asRecord(row) as unknown as CustomerInvoiceRow);
  const partnerInvoices = (data?.partnerInvoices ?? []).map(row => asRecord(row) as unknown as PartnerInvoiceRow);
  const reconciliation = (data?.reconciliation ?? []).map(row => asRecord(row) as unknown as ReconRow);
  const reviewItems = data?.reviewItems ?? [];
  const settlements = settlementsQuery.data;
  const holdTotal = (settlements?.disputedVisits ?? 0) + (settlements?.onHoldVisits ?? 0);
  const payoutPeriodVerified = !!payoutPeriod && settlements?.from.slice(0, 10) === payoutPeriod.from && settlements?.to.slice(0, 10) === payoutPeriod.to;
  const pendingReviewCount = reviewItems.filter(item => ['pending', 'processing', 'provider_pending'].includes(item.status)).length;
  const partnerName = (id: string) => data?.partners.find(item => item.id === id)?.name ?? id;
  const grantablePlans = (operationsQuery.data?.plans ?? []).filter(plan => plan.active && plan.kind !== 'paid');
  const payoutPartnerHoldTotal = activeReview?.partnerId
    ? (settlements?.groups ?? []).filter(group => group.partnerId === activeReview.partnerId)
      .reduce((sum, group) => sum + group.disputedVisits + group.onHoldVisits, 0)
    : holdTotal;

  const filtered = <T extends object>(rows: T[], keys: (keyof T)[]) => rows.filter(row => {
    const record = row as Record<string, unknown>;
    const matchesText = !search.trim() || keys.some(key => String(record[String(key)] ?? '').toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || String(record.status ?? '').toLowerCase() === statusFilter;
    return matchesText && matchesStatus;
  });

  const refresh = () => { overviewQuery.refetch(); settlementsQuery.refetch(); auditQuery.refetch(); };
  const handleDecision = (event: FormEvent) => {
    event.preventDefault();
    if (!activeReview || decisionReason.trim().length < 5) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const submittedDecision = submitter?.value === 'reject' ? 'reject' : 'approve';
    decideMutation.mutate({ id: activeReview.id, data: { decision: submittedDecision, reason: decisionReason.trim() } }, {
      onSuccess: () => { setActiveReview(null); setDecisionReason(''); setFeedback(t('saved')); void invalidateFinance(); },
      onError: () => setFeedback(t('decisionError')),
    });
  };
  const handleRefund = (event: FormEvent) => {
    event.preventDefault();
    if (!refundInvoice || refundReason.trim().length < 5) return;
    refundMutation.mutate({ billingId: refundInvoice.id, data: { reason: refundReason.trim(), idempotencyKey: crypto.randomUUID() } }, {
      onSuccess: () => { setRefundInvoice(null); setRefundReason(''); setFeedback(t('refundQueued')); void invalidateFinance(); },
      onError: () => setFeedback(t('refundError')),
    });
  };
  const handlePayoutTracking = (event: FormEvent) => {
    event.preventDefault();
    if (!payoutInvoice || payoutReason.trim().length < 5) return;
    payoutMutation.mutate({ data: {
      partnerId: payoutInvoice.partnerId, periodStart: payoutInvoice.periodStart, periodEnd: payoutInvoice.periodEnd,
      amountIqd: payoutInvoice.amountIqd, reason: payoutReason.trim(), idempotencyKey: crypto.randomUUID(),
    } }, {
      onSuccess: () => { setPayoutInvoice(null); setPayoutReason(''); setFeedback(t('saved')); void invalidateFinance(); },
      onError: () => setFeedback(t('payoutError')),
    });
  };
  const handleInvoiceReview = (event: FormEvent) => {
    event.preventDefault();
    if (!invoiceReview || invoiceReason.trim().length < 5) return;
    invoiceMutation.mutate({ id: invoiceReview.id, data: { status: invoiceStatus, reason: invoiceReason.trim() } }, {
      onSuccess: () => { setInvoiceReview(null); setInvoiceReason(''); setFeedback(t('saved')); void invalidateFinance(); },
      onError: () => setFeedback(t('invoiceError')),
    });
  };
  const handleMembershipAction = (event: FormEvent) => {
    event.preventDefault();
    if (!membershipAction || membershipReason.trim().length < 5) return;
    const { member, action } = membershipAction;
    const onSuccess = () => {
      setMembershipAction(null);
      setMembershipReason('');
      setMembershipCorporateId('');
      setFeedback(t('saved'));
      void invalidateFinance();
    };
    if (action === 'revoke') {
      revokeMutation.mutate({ data: { userId: member.userId, reason: membershipReason.trim() } }, {
        onSuccess, onError: () => setFeedback(t('revokeError')),
      });
      return;
    }
    const planId = membershipPlanId || grantablePlans[0]?.id;
    const plan = grantablePlans.find(item => item.id === planId);
    if (!planId || !plan || (plan.kind === 'corporate' && !membershipCorporateId.trim())) return;
    grantMutation.mutate({ data: {
      userId: member.userId, planId, reason: membershipReason.trim(),
      ...(plan.kind === 'corporate' ? { corporateId: membershipCorporateId.trim() } : {}),
    } }, { onSuccess, onError: () => setFeedback(t('grantError')) });
  };
  const handleBookingCancellation = (event: FormEvent) => {
    event.preventDefault();
    if (!bookingToCancel || bookingCancelReason.trim().length < 5) return;
    cancelBookingMutation.mutate({ id: bookingToCancel.id, data: { reason: bookingCancelReason.trim() } }, {
      onSuccess: () => {
        setBookingToCancel(null);
        setBookingCancelReason('');
        setFeedback(t('bookingCancelled'));
        void invalidateFinance();
      },
      onError: () => setFeedback(t('bookingCancelError')),
    });
  };

  if (!isLoaded) return <LoadingState label={t('loading')} />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (overviewQuery.isLoading) return <LoadingState label={t('loading')} />;
  if (overviewQuery.isError) return <div className="min-h-[70vh] bg-[#f5f2e9] px-5 py-16" data-testid="finance-error"><div className="mx-auto max-w-xl rounded-3xl border border-[#e5c2b6] bg-[#fff9f4] p-8 text-center"><CircleAlert className="mx-auto text-[#a64d3a]" /><h1 className="mt-3 font-display text-2xl font-bold text-[#173d35]">{t('errorTitle')}</h1><button onClick={() => overviewQuery.refetch()} data-testid="button-retry-finance" className="mt-5 rounded-xl bg-[#174d43] px-4 py-2.5 text-sm font-bold text-[#fff9e9]">{t('retry')}</button></div></div>;
  if (!data || !allowed) return <div className="min-h-[70vh] bg-[#f5f2e9] px-5 py-16" data-testid="finance-denied"><div className="mx-auto max-w-xl rounded-3xl border border-[#ded8c9] bg-[#fffdf7] p-8 text-center"><LockKeyhole className="mx-auto text-[#a76445]" /><h1 className="mt-3 font-display text-2xl font-bold text-[#173d35]">{t('deniedTitle')}</h1><p className="mt-2 text-sm leading-relaxed text-[#6d7b72]">{t('deniedCopy')}</p></div></div>;

  const nav: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: 'overview', label: t('overview'), icon: <Activity size={16} /> }, { key: 'members', label: t('members'), icon: <Users size={16} /> },
    { key: 'bookings', label: t('bookings'), icon: <CalendarDays size={16} /> }, { key: 'customer-invoices', label: t('customerInvoices'), icon: <FileText size={16} /> },
    { key: 'partner-invoices', label: t('partnerInvoices'), icon: <WalletCards size={16} /> }, { key: 'settlements', label: t('settlements'), icon: <ShieldCheck size={16} /> },
    { key: 'reconciliation', label: t('reconciliation'), icon: <ArrowLeftRight size={16} /> }, { key: 'audit', label: t('audit'), icon: <Clock3 size={16} /> },
    ...(role === 'admin' ? [{
      key: 'plans' as const,
      label: language === 'ar' ? 'خطط العضوية' : language === 'ku' ? 'پلانەکانی ئەندامێتی' : 'Membership plans',
      icon: <Banknote size={16} />,
    }] : []),
  ];
  const textCell = (value: unknown, fallback = '—') => <span className="text-[#36564b]">{str(value, fallback)}</span>;
  const statusBadge = (status: string) => {
    const label = status === 'rejected' ? t('status_rejected') : t(status);
    return <Badge tone={['accepted', 'active', 'paid', 'confirmed', 'completed', 'approved_manual'].includes(status.toLowerCase()) ? 'green' : ['rejected', 'failed', 'cancelled', 'void'].includes(status.toLowerCase()) ? 'red' : ['pending', 'processing', 'provider_pending', 'under_review', 'on_hold', 'disputed'].includes(status.toLowerCase()) ? 'amber' : 'neutral'}>{label === (status === 'rejected' ? 'status_rejected' : status) ? status.replaceAll('_', ' ') : label}</Badge>;
  };

  return <div dir={rtl ? 'rtl' : 'ltr'} className="min-h-[100dvh] bg-[#f5f2e9] text-[#173d35]" data-testid="finance-console">
    <div className="mx-auto max-w-[1580px] px-4 py-5 sm:px-6 lg:px-9 lg:py-8">
      <header className="mb-6 overflow-hidden rounded-[1.7rem] border border-[#dcd6c7] bg-[#fffdf7] shadow-[0_14px_40px_rgba(39,61,49,.06)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#eee9de] px-5 py-4 md:px-7">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#174d43] text-[#f8f3e7]"><Banknote size={19} /></div><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#a76445]">{t('workspace')}</p><p className="mt-0.5 text-xs font-semibold text-[#60756b]">{t('ledger')}</p></div></div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-[#ded8c9] bg-[#faf8f1] px-3 py-2 text-xs font-semibold text-[#587066]"><span>{t('language')}</span><select className="bg-transparent outline-none" value={language} onChange={e => setLanguage(e.target.value as Language)} data-testid="select-finance-language" aria-label={t('language')}><option value="en">English</option><option value="ar">العربية</option><option value="ku">کوردی</option></select></label>
            <Badge tone={role === 'admin' ? 'green' : 'blue'}>{role === 'admin' ? t('admin') : t('finance')}</Badge>
            <button onClick={refresh} className="inline-flex items-center gap-2 rounded-xl border border-[#ded8c9] px-3 py-2 text-xs font-bold text-[#36564b] hover:bg-[#f4f0e5]" data-testid="button-refresh-finance"><RefreshCw size={14} />{t('refresh')}</button>
          </div>
        </div>
        <div className="relative grid gap-4 overflow-hidden px-5 py-6 md:grid-cols-[1fr_auto] md:items-end md:px-7 md:py-7">
          <div className="absolute -right-14 -top-20 h-56 w-56 rounded-full border border-[#e8e2d3] opacity-70" /><div className="absolute -right-6 -top-12 h-40 w-40 rounded-full border border-[#e8e2d3] opacity-70" />
          <div className="relative"><div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#a76445]"><span className="h-1.5 w-1.5 rounded-full bg-[#398265]" />{t('serverScope')}</div><h1 className="font-display text-3xl font-extrabold tracking-tight text-[#173d35] md:text-[2.65rem]">{t('financeDesk')}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#6c7a71]">{t('subtitle')}</p></div>
          <div className="relative flex flex-wrap gap-2">
            <div className="rounded-xl border border-[#e7e1d4] bg-[#faf8f1] px-3 py-2"><p className="text-[9px] font-bold uppercase tracking-[.12em] text-[#78857c]">{t('paymentGate')}</p><div className="mt-1 flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${data.paymentGateEnabled ? 'bg-[#4d9970]' : 'bg-[#b77d36]'}`} /><span className="text-xs font-bold">{data.paymentGateEnabled ? t('gateEnabled') : t('gateDisabled')}</span></div></div>
            <div className="rounded-xl border border-[#e7e1d4] bg-[#faf8f1] px-3 py-2"><p className="text-[9px] font-bold uppercase tracking-[.12em] text-[#78857c]">{t('payoutGate')}</p><div className="mt-1 flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${data.livePayoutGateEnabled ? 'bg-[#4d9970]' : 'bg-[#b77d36]'}`} /><span className="text-xs font-bold">{data.livePayoutGateEnabled ? t('gateEnabled') : t('gateDisabled')}</span></div></div>
          </div>
        </div>
      </header>

      {feedback && <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-[#c8d9ca] bg-[#edf5ec] px-4 py-3 text-sm text-[#315e42]" data-testid="status-finance-feedback"><span>{feedback}</span><button aria-label={t('cancel')} onClick={() => setFeedback('')} data-testid="button-dismiss-feedback"><X size={15} /></button></div>}

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="self-start rounded-2xl border border-[#ded8c9] bg-[#fffdf7] p-3 lg:sticky lg:top-5" aria-label={t('ledger')}>
          <p className="px-3 pb-2 pt-1 text-[9px] font-bold uppercase tracking-[.18em] text-[#8a9389]">{t('refreshed')}</p>
          <nav className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-1" data-testid="nav-finance-sections">
            {nav.map(item => <button key={item.key} onClick={() => { setTab(item.key); setSearch(''); setStatusFilter('all'); }} aria-current={tab === item.key ? 'page' : undefined} data-testid={`tab-finance-${item.key}`} className={`flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${tab === item.key ? 'bg-[#174d43] text-[#fff9e9] shadow-sm' : 'text-[#536b61] hover:bg-[#f1eddf]'}`}>{item.icon}<span>{item.label}</span></button>)}
          </nav>
          <div className="mt-4 border-t border-[#eee9de] pt-3">
            {role === 'admin' && <Link href="/partner-portal" className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-[#536b61] hover:bg-[#f1eddf]" data-testid="link-partner-portal"><span>{t('partnerPortal')}</span><ArrowUpRight size={14} /></Link>}
            {role === 'admin' && <p className="px-3 pb-2 pt-1 text-[10px] text-[#879188]" data-testid="text-admin-navigation">{t('adminOnly')}</p>}
            <p className="px-3 pt-2 text-[10px] leading-relaxed text-[#839087]">{t('noPayment')}</p>
          </div>
        </aside>

        <main className="min-w-0 space-y-5">
          {tab === 'overview' && <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('overview')} data-testid="finance-overview-metrics">
              {[
                [t('membersCount'), members.length, <Users size={16} />],
                [t('invoicesCount'), customerInvoices.length, <FileText size={16} />],
                [t('partnerCount'), data.partners.length, <WalletCards size={16} />],
                [t('pendingReviews'), pendingReviewCount, <Clock3 size={16} />],
              ].map(([label, value, icon], index) => <div key={String(label)} className="rounded-2xl border border-[#ded8c9] bg-[#fffdf7] px-4 py-4 shadow-[0_8px_24px_rgba(39,61,49,.035)]" data-testid={`metric-finance-${index}`}><div className="flex items-center justify-between text-[#a76445]">{icon as ReactNode}<span className="font-mono text-[10px] text-[#879188]">0{index + 1}</span></div><p className="mt-4 font-display text-3xl font-bold text-[#173d35]">{value as number}</p><p className="mt-1 text-xs font-semibold text-[#718078]">{label as string}</p></div>)}
            </section>

            <Panel title={t('safeguards')} subtitle={t('noPayment')}>
              <div className="grid divide-y divide-[#eee9de] md:grid-cols-2 md:divide-x md:divide-y-0">
                <div className="flex items-start gap-3 p-5"><div className="rounded-xl bg-[#f7ecd4] p-2 text-[#926b26]"><LockKeyhole size={18} /></div><div><p className="text-xs font-bold">{t('paymentGate')}</p><p className="mt-1 text-xs text-[#718078]">{data.paymentGateEnabled ? t('gateEnabled') : t('refundGateOff')}</p></div><div className="ms-auto">{statusBadge(data.paymentGateEnabled ? 'enabled' : 'disabled')}</div></div>
                <div className="flex items-start gap-3 p-5"><div className="rounded-xl bg-[#e1ecea] p-2 text-[#315e5b]"><ShieldCheck size={18} /></div><div><p className="text-xs font-bold">{t('payoutGate')}</p><p className="mt-1 text-xs text-[#718078]">{data.livePayoutGateEnabled ? t('gateEnabled') : t('gateDisabled')}</p></div><div className="ms-auto">{statusBadge(data.livePayoutGateEnabled ? 'enabled' : 'disabled')}</div></div>
              </div>
            </Panel>

            <section className="rounded-2xl border border-[#d7b880] bg-[#fff8e9] p-5 md:p-6" data-testid="finance-attendance-holds">
              <div className="flex flex-wrap items-start gap-3"><div className="rounded-xl bg-[#f3e7ca] p-2.5 text-[#886426]"><CircleAlert size={19} /></div><div className="min-w-[230px] flex-1"><h2 className="text-sm font-bold text-[#54431f]">{t('holdTitle')}</h2><p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#7b6944]">{t('holdCopy')}</p></div><Badge tone={holdTotal > 0 ? 'amber' : 'green'}>{holdTotal} {t('onHold')} + {settlements?.disputedVisits ?? 0} {t('disputed')}</Badge></div>
              <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-5">
                {[[t('verified'), settlements?.verifiedVisits ?? 0], [t('rejected'), settlements?.rejectedVisits ?? 0], [t('disputed'), settlements?.disputedVisits ?? 0], [t('onHold'), settlements?.onHoldVisits ?? 0], [t('approvalGate'), settlements?.payoutApprovalEnabled ? t('gateEnabled') : t('gateDisabled')]].map(([label, value], i) => <div key={String(label)} className="rounded-xl border border-[#eee1c5] bg-[#fffdf7]/70 px-3 py-3" data-testid={`settlement-hold-metric-${i}`}><p className="text-[10px] font-semibold text-[#7b6944]">{label}</p><p className="mt-1 text-xl font-bold text-[#594a2c]">{value}</p></div>)}
              </div>
            </section>

            <Panel title={t('reviewQueue')} subtitle={t('reviewCopy')} action={<Badge tone="amber">{pendingReviewCount} {t('open')}</Badge>}>
              {reviewItems.length ? <ReviewList items={reviewItems} language={language} userId={userId ?? ''} busyId={busyId} setBusyId={setBusyId} onReview={item => { setActiveReview(item); setDecisionReason(''); }} t={t} /> : <Empty title={t('emptyTitle')} text={t('emptyCopy')} />}
            </Panel>
            <Panel title={t('settlements')} subtitle={t('noSettlementAmount')} action={<button onClick={() => setTab('settlements')} className="text-xs font-bold text-[#174d43]" data-testid="button-open-settlements">{t('overview')} <ArrowUpRight className="inline" size={13} /></button>}>
              {settlementsQuery.isLoading ? <div className="p-6"><div className="h-20 animate-pulse rounded-xl bg-[#f1eddf]" /></div> : <SettlementGroups groups={settlements?.groups ?? []} t={t} />}
            </Panel>
          </>}

          {tab !== 'overview' && <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#a76445]">{t('serverScope')}</p><h2 className="mt-1 font-display text-2xl font-bold">{nav.find(item => item.key === tab)?.label}</h2></div>
            {tab !== 'settlements' && tab !== 'audit' && <div className="flex flex-wrap gap-2"><label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a9389]" size={14} /><input className={`${field} w-[min(72vw,240px)] ps-9`} value={search} onChange={e => setSearch(e.target.value)} placeholder={t('search')} data-testid="input-finance-search" /></label><label className="relative"><Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a9389]" size={14} /><select className={`${field} w-[150px] ps-9`} value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label={t('allStatuses')} data-testid="select-finance-status"><option value="all">{t('allStatuses')}</option>{Array.from(new Set([...members, ...bookings, ...customerInvoices, ...partnerInvoices].map(item => item.status).filter(Boolean))).map(status => <option key={status} value={status.toLowerCase()}>{status.replaceAll('_', ' ')}</option>)}</select></label></div>}
          </div>}

          {tab === 'members' && <Panel title={t('members')} subtitle={t('serverScope')}><div className="overflow-x-auto"><table className="w-full min-w-[790px] text-left text-xs"><thead><tr className="bg-[#f7f4eb] text-[10px] uppercase tracking-[.1em] text-[#78857c]">{[t('customer'), t('status'), t('paymentStatus'), t('plan'), t('created'), t('period'), ...(role === 'admin' ? [t('memberActions')] : [])].map(label => <th key={label} className="px-4 py-3 font-bold">{label}</th>)}</tr></thead><tbody>{filtered(members, ['userId','status','paymentStatus','tier','source']).map((item, i) => <tr key={`${item.userId}-${i}`} className="border-t border-[#eee9de]" data-testid={`row-membership-${item.userId}`}><td className="px-4 py-3 font-mono text-[11px]">{textCell(item.userId)}</td><td className="px-4 py-3">{statusBadge(item.status)}</td><td className="px-4 py-3">{statusBadge(item.paymentStatus)}</td><td className="px-4 py-3">{textCell(item.tier || item.source)}</td><td className="px-4 py-3">{formatDate(item.startsAt, locale)}</td><td className="px-4 py-3">{formatDate(item.endsAt, locale)}</td>{role === 'admin' && <td className="px-4 py-3"><div className="flex gap-2"><button onClick={() => { setMembershipAction({ member: item, action: 'grant' }); setMembershipPlanId(''); setMembershipReason(''); }} className="rounded-lg border border-[#d8d2c4] px-2.5 py-2 text-[10px] font-bold text-[#36564b]" data-testid={`button-grant-membership-${item.userId}`}>{t('grantAccess')}</button><button onClick={() => { setMembershipAction({ member: item, action: 'revoke' }); setMembershipReason(''); }} className="rounded-lg border border-[#d9a89a] px-2.5 py-2 text-[10px] font-bold text-[#9a4435]" data-testid={`button-revoke-membership-${item.userId}`}>{t('revokeAccess')}</button></div></td>}</tr>)}</tbody></table>{!filtered(members, ['userId','status','paymentStatus','tier','source']).length && <Empty title={members.length ? t('noRows') : t('noMembers')} />}</div></Panel>}

          {tab === 'bookings' && <Panel title={t('bookings')} subtitle={role === 'admin' ? t('bookingManage') : t('serverScope')} action={role === 'admin' ? <Link href="/partner-portal" className="text-xs font-bold text-[#174d43]" data-testid="link-booking-management">{t('bookingManage')} <ArrowUpRight className="inline" size={13} /></Link> : undefined}><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead><tr className="bg-[#f7f4eb] text-[10px] uppercase tracking-[.1em] text-[#78857c]">{[t('offering'),t('partner'),t('customer'),t('status'),t('period'),t('created'),...(role === 'admin' ? [t('cancelBooking')] : [])].map(label => <th key={label} className="px-4 py-3 font-bold">{label}</th>)}</tr></thead><tbody>{filtered(bookings, ['id','title','partnerName','facility','city','userId','status']).map(item => <tr key={item.id} className="border-t border-[#eee9de]" data-testid={`row-booking-${item.id}`}><td className="px-4 py-3"><p className="font-semibold">{textCell(item.title)}</p><p className="mt-1 text-[10px] text-[#859087]">{item.facility} · {item.city}</p></td><td className="px-4 py-3">{textCell(item.partnerName)}</td><td className="px-4 py-3 font-mono text-[11px]">{textCell(item.userId)}</td><td className="px-4 py-3">{statusBadge(item.status)}</td><td className="px-4 py-3">{formatDate(item.startsAt, locale)}</td><td className="px-4 py-3">{formatDate(item.createdAt, locale)}</td>{role === 'admin' && <td className="px-4 py-3"><button onClick={() => { setBookingToCancel(item); setBookingCancelReason(''); }} disabled={!['reserved','requested'].includes(item.status) || new Date(item.startsAt).getTime() <= Date.now()} className="rounded-lg border border-[#d9a89a] px-2.5 py-2 text-[10px] font-bold text-[#9a4435] disabled:cursor-not-allowed disabled:opacity-40" data-testid={`button-cancel-booking-${item.id}`}>{t('cancelBooking')}</button></td>}</tr>)}</tbody></table>{!filtered(bookings, ['id','title','partnerName','facility','city','userId','status']).length && <Empty title={bookings.length ? t('noRows') : t('noBookings')} />}</div></Panel>}

          {tab === 'customer-invoices' && <Panel title={t('customerInvoices')} subtitle={data.paymentGateEnabled ? t('queuedRefund') : t('refundGateOff')}><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-xs"><thead><tr className="bg-[#f7f4eb] text-[10px] uppercase tracking-[.1em] text-[#78857c]">{[t('invoice'),t('customer'),t('plan'),t('amount'),t('paymentStatus'),t('status'),t('refund'),t('created'),''].map(label => <th key={label} className="px-4 py-3 font-bold">{label}</th>)}</tr></thead><tbody>{filtered(customerInvoices, ['id','userId','planName','status','paymentStatus','refundStatus']).map(item => <tr key={item.id} className="border-t border-[#eee9de]" data-testid={`row-customer-invoice-${item.id}`}><td className="px-4 py-3 font-mono">{item.id}</td><td className="px-4 py-3 font-mono text-[11px]">{item.userId}</td><td className="px-4 py-3">{item.planName}</td><td className="px-4 py-3 font-mono">{formatIqd(item.amountIqd)} IQD</td><td className="px-4 py-3">{statusBadge(item.paymentStatus)}</td><td className="px-4 py-3">{statusBadge(item.status)}</td><td className="px-4 py-3">{statusBadge(item.refundStatus || 'none')}</td><td className="px-4 py-3">{formatDate(item.createdAt, locale)}</td><td className="px-4 py-3"><button onClick={() => { setRefundInvoice(item); setRefundReason(''); }} disabled={!data.paymentGateEnabled || !item.id || item.paymentStatus !== 'paid' || ['pending', 'processing', 'provider_pending', 'completed'].includes(item.refundStatus)} className="rounded-lg border border-[#d8d2c4] px-3 py-2 text-[10px] font-bold text-[#36564b] hover:bg-[#f1eddf] disabled:cursor-not-allowed disabled:opacity-40" data-testid={`button-request-refund-${item.id}`} title={!data.paymentGateEnabled ? t('refundGateOff') : t('requestRefund')}>{t('requestRefund')}</button></td></tr>)}</tbody></table>{!filtered(customerInvoices, ['id','userId','planName','status','paymentStatus','refundStatus']).length && <Empty title={customerInvoices.length ? t('noRows') : t('noCustomerInvoices')} />}</div></Panel>}

          {tab === 'partner-invoices' && <Panel title={t('partnerInvoices')} subtitle={t('serverScope')}><div className="overflow-x-auto"><table className="w-full min-w-[1020px] text-left text-xs"><thead><tr className="bg-[#f7f4eb] text-[10px] uppercase tracking-[.1em] text-[#78857c]">{[t('partner'),t('invoiceNumber'),t('amount'),t('period'),t('issued'),t('status'),t('document'),''].map(label => <th key={label} className="px-4 py-3 font-bold">{label}</th>)}</tr></thead><tbody>{filtered(partnerInvoices, ['id','partnerId','invoiceNumber','documentName','status']).map(item => <tr key={item.id} className="border-t border-[#eee9de]" data-testid={`row-partner-invoice-${item.id}`}><td className="px-4 py-3 font-semibold">{partnerName(item.partnerId)}</td><td className="px-4 py-3 font-mono">{item.invoiceNumber}</td><td className="px-4 py-3 font-mono">{formatIqd(item.amountIqd)} IQD</td><td className="px-4 py-3">{formatDate(item.periodStart, locale)} – {formatDate(item.periodEnd, locale)}</td><td className="px-4 py-3">{formatDate(item.issuedAt, locale)}</td><td className="px-4 py-3">{statusBadge(item.status)}</td><td className="px-4 py-3">{item.documentName}</td><td className="px-4 py-3"><div className="flex gap-2"><button onClick={async () => { setBusyId(`download-${item.id}`); try { const blob = await downloadFinancePartnerInvoice(item.id); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = item.documentName || `${item.invoiceNumber}.pdf`; anchor.click(); URL.revokeObjectURL(url); } catch { setFeedback('Invoice document could not be downloaded.'); } finally { setBusyId(''); } }} disabled={busyId === `download-${item.id}`} className="inline-flex items-center gap-1 rounded-lg border border-[#d8d2c4] px-2.5 py-2 font-bold text-[#36564b] hover:bg-[#f1eddf] disabled:opacity-40" data-testid={`button-download-invoice-${item.id}`}><ArrowDownToLine size={13} />{t('download')}</button>{role === 'finance' && <button onClick={() => { setPayoutInvoice(item); setPayoutReason(''); }} disabled={item.status !== 'accepted'} className="rounded-lg bg-[#174d43] px-2.5 py-2 font-bold text-[#fff9e9] disabled:cursor-not-allowed disabled:opacity-40" data-testid={`button-track-payout-${item.id}`} title={t('trackingOnly')}>{t('payout')}</button>}<button onClick={() => { setInvoiceReview(item); setInvoiceStatus(item.status === 'accepted' ? 'accepted' : 'under_review'); setInvoiceReason(''); }} className="rounded-lg border border-[#d8d2c4] px-2.5 py-2 font-bold text-[#36564b] hover:bg-[#f1eddf]" data-testid={`button-review-invoice-${item.id}`}>{t('invoiceReview')}</button></div></td></tr>)}</tbody></table>{!filtered(partnerInvoices, ['id','partnerId','invoiceNumber','documentName','status']).length && <Empty title={partnerInvoices.length ? t('noRows') : t('noPartnerInvoices')} />}</div></Panel>}

          {tab === 'settlements' && <><Panel title={t('settlements')} subtitle={`${t('noSettlementAmount')} ${t('holdCopy')}`} action={<div className="flex items-center gap-2"><label className="text-[10px] font-semibold text-[#718078]">{t('periodFrom')}<input type="date" value={from} onChange={e => setFrom(e.target.value)} className={`${field} mt-1`} data-testid="input-settlement-from" /></label><label className="text-[10px] font-semibold text-[#718078]">{t('periodTo')}<input type="date" value={to} onChange={e => setTo(e.target.value)} className={`${field} mt-1`} data-testid="input-settlement-to" /></label><button onClick={() => setPeriod({ from, to })} className="mt-4 rounded-xl bg-[#174d43] px-3 py-2 text-xs font-bold text-[#fff9e9]" data-testid="button-apply-settlement-period">{t('applyPeriod')}</button></div>}>
              {settlementsQuery.isError ? <div className="p-6 text-sm text-[#9a4435]" data-testid="settlement-error">{t('errorTitle')} <button onClick={() => settlementsQuery.refetch()} className="ms-2 underline">{t('retry')}</button></div> : settlementsQuery.isLoading ? <div className="space-y-3 p-5"><div className="h-14 animate-pulse rounded-xl bg-[#f1eddf]" /><div className="h-36 animate-pulse rounded-xl bg-[#f1eddf]" /></div> : <>
                <div className="grid grid-cols-2 gap-px bg-[#eee9de] md:grid-cols-5">{[[t('verified'),settlements?.verifiedVisits],[t('rejected'),settlements?.rejectedVisits],[t('disputed'),settlements?.disputedVisits],[t('onHold'),settlements?.onHoldVisits],[t('approvalGate'),settlements?.payoutApprovalEnabled ? t('gateEnabled') : t('gateDisabled')]].map(([label, value]) => <div key={String(label)} className="bg-[#fffdf7] px-4 py-4"><p className="text-[10px] font-semibold text-[#79867d]">{label}</p><p className="mt-1 font-display text-2xl font-bold">{value ?? 0}</p></div>)}</div>
                <p className="border-b border-[#eee9de] bg-[#f8f4e9] px-5 py-3 text-xs font-semibold text-[#755e2e]">{t('noSettlementAmount')}</p>
                <SettlementGroups groups={settlements?.groups ?? []} t={t} />
              </>}
            </Panel>
            <HoldPanel summary={settlements} t={t} />
          </>}

          {tab === 'reconciliation' && <Panel title={t('reconciliation')} subtitle={t('serverScope')}><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead><tr className="bg-[#f7f4eb] text-[10px] uppercase tracking-[.1em] text-[#78857c]">{[t('eventType'),t('status'),t('received'),t('processed'),t('invoice')].map(label => <th key={label} className="px-4 py-3 font-bold">{label}</th>)}</tr></thead><tbody>{reconciliation.filter(item => !search || `${item.id} ${item.eventType} ${item.status}`.toLowerCase().includes(search.toLowerCase())).map(item => <tr key={item.id} className="border-t border-[#eee9de]" data-testid={`row-reconciliation-${item.id}`}><td className="px-4 py-3 font-semibold">{item.eventType}</td><td className="px-4 py-3">{statusBadge(item.status)}</td><td className="px-4 py-3">{formatDate(item.receivedAt, locale)}</td><td className="px-4 py-3">{formatDate(item.processedAt, locale)}</td><td className="px-4 py-3 font-mono">{item.id}</td></tr>)}</tbody></table>{!reconciliation.length && <Empty title={t('emptyTitle')} text={t('emptyCopy')} />}</div></Panel>}

          {tab === 'plans' && role === 'admin' && <MembershipPlanManager
            plans={operationsQuery.data?.plans ?? []}
            isLoading={operationsQuery.isLoading}
            isError={operationsQuery.isError}
            onRetry={() => void operationsQuery.refetch()}
            onSaved={async () => { await operationsQuery.refetch(); }}
            language={language}
          />}

          {tab === 'audit' && <div className="space-y-5">
            <Panel title={t('audit')} subtitle={t('serverScope')}>
              {auditQuery.isError ? <div className="p-6 text-sm text-[#9a4435]" data-testid="audit-error">{t('errorTitle')} <button onClick={() => auditQuery.refetch()} className="ms-2 underline">{t('retry')}</button></div> : auditQuery.isLoading ? <div className="space-y-3 p-5"><div className="h-14 animate-pulse rounded-xl bg-[#f1eddf]" /><div className="h-14 animate-pulse rounded-xl bg-[#f1eddf]" /></div> : <AuditView audit={auditQuery.data} fallback={data.audit} t={t} />}
            </Panel>
            <Panel title={t('reviewQueue')} subtitle={t('reviewCopy')}>{data.reviewEvents.length ? <div className="divide-y divide-[#eee9de]">{data.reviewEvents.map((event, i) => { const row = asRecord(event); return <div key={String(row.id ?? i)} className="flex flex-wrap gap-x-5 gap-y-1 px-5 py-4 text-xs" data-testid={`review-event-${String(row.id ?? i)}`}><Badge>{str(row.action ?? row.eventType, 'review event')}</Badge><span className="font-mono">{str(row.reviewedBy ?? row.actorId)}</span><span>{str(row.reason)}</span><span className="ms-auto text-[#7b887f]">{formatDate(row.createdAt, locale)}</span></div>; })}</div> : <Empty title={t('noAudit')} />}</Panel>
          </div>}
        </main>
      </div>
    </div>

    {activeReview && <Modal title={t('reviewQueue')} onClose={() => setActiveReview(null)} testId="dialog-finance-review"><div className="mb-4 rounded-xl bg-[#f7f4eb] p-4 text-xs"><div className="flex items-center justify-between"><Badge tone={activeReview.kind === 'refund' ? 'amber' : 'blue'}>{t(activeReview.kind)}</Badge>{statusBadge(activeReview.status)}</div><p className="mt-3 leading-relaxed">{activeReview.reason}</p><p className="mt-2 text-[#78857c]">{t('requestedBy')}: <span className="font-mono">{activeReview.requestedBy}</span></p>{activeReview.amountIqd != null && <p className="mt-1 font-mono">{formatIqd(activeReview.amountIqd)} IQD</p>}{activeReview.kind === 'payout' && <p className="mt-2 text-[#755e2e]">{t('trackingOnly')}</p>}</div>
        <form onSubmit={handleDecision} className="space-y-3"><label className="block text-xs font-semibold">{t('decisionReason')}<textarea required minLength={5} maxLength={500} value={decisionReason} onChange={e => setDecisionReason(e.target.value)} className={`${field} mt-1 min-h-24 resize-y`} data-testid="textarea-decision-reason" /></label><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setActiveReview(null)} className="rounded-xl border border-[#d8d2c4] px-4 py-2.5 text-xs font-bold text-[#536b61]" data-testid="button-cancel-decision">{t('cancel')}</button><button type="submit" value="reject" disabled={decideMutation.isPending || activeReview.requestedBy === userId} className="rounded-xl border border-[#d9a89a] bg-[#fff5f1] px-4 py-2.5 text-xs font-bold text-[#9a4435] disabled:opacity-40" data-testid="button-submit-reject-decision">{t('reject')}</button><button type="submit" value="approve" disabled={decideMutation.isPending || activeReview.requestedBy === userId || (activeReview.kind === 'payout' && (!data.livePayoutGateEnabled || !settlements?.payoutApprovalEnabled || !payoutPeriodVerified || payoutPartnerHoldTotal > 0))} className="rounded-xl bg-[#174d43] px-4 py-2.5 text-xs font-bold text-[#fff9e9] disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-submit-approve-decision">{t('approve')}</button></div>
        {activeReview.requestedBy === userId && <p className="text-xs text-[#9a4435]" data-testid="text-self-approval-block">{t('ownRequest')}</p>}
        {activeReview.kind === 'payout' && (!data.livePayoutGateEnabled || !settlements?.payoutApprovalEnabled || !payoutPeriodVerified || payoutPartnerHoldTotal > 0) && <p className="text-xs text-[#9a4435]" data-testid="text-payout-gate-block">{t('holdTitle')} · {t('gateDisabled')}</p>}</form>
    </Modal>}

    {refundInvoice && <Modal title={t('requestRefund')} onClose={() => setRefundInvoice(null)} testId="dialog-refund-request"><p className="mb-4 rounded-xl bg-[#f7f4eb] p-3 text-xs">{refundInvoice.planName} · {formatIqd(refundInvoice.amountIqd)} IQD · {refundInvoice.userId}</p><form onSubmit={handleRefund} className="space-y-3"><p className="rounded-xl border border-[#d7b880] bg-[#fff8e9] p-3 text-xs leading-relaxed text-[#755e2e]">{t('refundQueued')}</p><label className="block text-xs font-semibold">{t('requestReason')}<textarea required minLength={5} maxLength={500} value={refundReason} onChange={e => setRefundReason(e.target.value)} className={`${field} mt-1 min-h-24`} data-testid="textarea-refund-reason" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setRefundInvoice(null)} className="rounded-xl border border-[#d8d2c4] px-4 py-2 text-xs font-bold" data-testid="button-cancel-refund">{t('cancel')}</button><button type="submit" disabled={!data.paymentGateEnabled || refundMutation.isPending} className="rounded-xl bg-[#174d43] px-4 py-2 text-xs font-bold text-[#fff9e9] disabled:opacity-40" data-testid="button-submit-refund">{t('queuedRefund')}</button></div></form></Modal>}

    {invoiceReview && <Modal title={t('invoiceReview')} onClose={() => setInvoiceReview(null)} testId="dialog-partner-invoice-review"><form onSubmit={handleInvoiceReview} className="space-y-3"><div className="rounded-xl bg-[#f7f4eb] p-3 text-xs">{invoiceReview.invoiceNumber} · {partnerName(invoiceReview.partnerId)} · {formatIqd(invoiceReview.amountIqd)} IQD</div><label className="block text-xs font-semibold">{t('status')}<select value={invoiceStatus} onChange={e => setInvoiceStatus(e.target.value as typeof invoiceStatus)} className={`${field} mt-1`} data-testid="select-invoice-decision"><option value="under_review">{t('markReview')}</option><option value="accepted">{t('acceptInvoice')}</option><option value="rejected">{t('rejectInvoice')}</option></select></label><label className="block text-xs font-semibold">{t('note')}<textarea required minLength={5} maxLength={500} value={invoiceReason} onChange={e => setInvoiceReason(e.target.value)} className={`${field} mt-1 min-h-24`} data-testid="textarea-invoice-review-reason" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setInvoiceReview(null)} className="rounded-xl border border-[#d8d2c4] px-4 py-2 text-xs font-bold" data-testid="button-cancel-invoice-review">{t('cancel')}</button><button type="submit" disabled={invoiceMutation.isPending} className="rounded-xl bg-[#174d43] px-4 py-2 text-xs font-bold text-[#fff9e9] disabled:opacity-40" data-testid="button-submit-invoice-review">{t('saveDecision')}</button></div></form></Modal>}

    {payoutInvoice && <Modal title={t('payoutTracking')} onClose={() => setPayoutInvoice(null)} testId="dialog-payout-tracking"><div className="mb-4 rounded-xl border border-[#d7b880] bg-[#fff8e9] p-3 text-xs leading-relaxed text-[#755e2e]">{t('trackingOnly')} {t('noSettlementAmount')}</div><div className="mb-4 rounded-xl bg-[#f7f4eb] p-3 text-xs"><p className="font-semibold">{partnerName(payoutInvoice.partnerId)} · {payoutInvoice.invoiceNumber}</p><p className="mt-1 font-mono">{formatIqd(payoutInvoice.amountIqd)} IQD</p><p className="mt-1">{formatDate(payoutInvoice.periodStart, locale)} – {formatDate(payoutInvoice.periodEnd, locale)}</p></div><form onSubmit={handlePayoutTracking} className="space-y-3"><label className="block text-xs font-semibold">{t('requestReason')}<textarea required minLength={5} maxLength={500} value={payoutReason} onChange={e => setPayoutReason(e.target.value)} className={`${field} mt-1 min-h-24`} data-testid="textarea-payout-reason" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setPayoutInvoice(null)} className="rounded-xl border border-[#d8d2c4] px-4 py-2 text-xs font-bold" data-testid="button-cancel-payout-tracking">{t('cancel')}</button><button type="submit" disabled={payoutMutation.isPending} className="rounded-xl bg-[#174d43] px-4 py-2 text-xs font-bold text-[#fff9e9] disabled:opacity-40" data-testid="button-submit-payout-tracking">{t('submitTracking')}</button></div></form></Modal>}
    {membershipAction && <Modal title={membershipAction.action === 'grant' ? t('grantAccess') : t('revokeAccess')} onClose={() => setMembershipAction(null)} testId={`dialog-membership-${membershipAction.action}`}>
      <p className="mb-4 rounded-xl bg-[#f7f4eb] p-3 text-xs font-mono">{membershipAction.member.userId}</p>
      <form onSubmit={handleMembershipAction} className="space-y-3">
        {membershipAction.action === 'grant' && <>
          <label className="block text-xs font-semibold">{t('planChoice')}<select required value={membershipPlanId || grantablePlans[0]?.id || ''} onChange={e => setMembershipPlanId(e.target.value)} className={`${field} mt-1`} data-testid="select-membership-plan">
            {grantablePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} · {plan.kind}</option>)}
          </select></label>
          {grantablePlans.find(plan => plan.id === (membershipPlanId || grantablePlans[0]?.id))?.kind === 'corporate' && <label className="block text-xs font-semibold">{t('corporateId')}<input required value={membershipCorporateId} onChange={e => setMembershipCorporateId(e.target.value)} className={`${field} mt-1`} data-testid="input-membership-corporate-id" /></label>}
          {!grantablePlans.length && <p className="rounded-xl border border-[#d7b880] bg-[#fff8e9] p-3 text-xs">{t('gateDisabled')}</p>}
        </>}
        <label className="block text-xs font-semibold">{t('actionReason')}<textarea required minLength={5} maxLength={500} value={membershipReason} onChange={e => setMembershipReason(e.target.value)} className={`${field} mt-1 min-h-24`} data-testid="textarea-membership-action-reason" /></label>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setMembershipAction(null)} className="rounded-xl border border-[#d8d2c4] px-4 py-2 text-xs font-bold" data-testid="button-cancel-membership-action">{t('cancel')}</button><button type="submit" disabled={grantMutation.isPending || revokeMutation.isPending || (membershipAction.action === 'grant' && !grantablePlans.length)} className="rounded-xl bg-[#174d43] px-4 py-2 text-xs font-bold text-[#fff9e9] disabled:opacity-40" data-testid="button-submit-membership-action">{membershipAction.action === 'grant' ? t('confirmGrant') : t('confirmRevoke')}</button></div>
      </form>
    </Modal>}
    {bookingToCancel && <Modal title={t('cancelBooking')} onClose={() => setBookingToCancel(null)} testId="dialog-booking-cancellation">
      <div className="mb-4 rounded-xl bg-[#f7f4eb] p-3 text-xs"><p className="font-semibold">{bookingToCancel.title}</p><p className="mt-1 font-mono">{bookingToCancel.userId}</p><p className="mt-1">{formatDate(bookingToCancel.startsAt, locale)}</p></div>
      <form onSubmit={handleBookingCancellation} className="space-y-3"><label className="block text-xs font-semibold">{t('bookingCancelReason')}<textarea required minLength={5} maxLength={500} value={bookingCancelReason} onChange={e => setBookingCancelReason(e.target.value)} className={`${field} mt-1 min-h-24`} data-testid="textarea-booking-cancellation-reason" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setBookingToCancel(null)} className="rounded-xl border border-[#d8d2c4] px-4 py-2 text-xs font-bold" data-testid="button-cancel-booking-dialog">{t('cancel')}</button><button type="submit" disabled={cancelBookingMutation.isPending} className="rounded-xl bg-[#174d43] px-4 py-2 text-xs font-bold text-[#fff9e9] disabled:opacity-40" data-testid="button-confirm-booking-cancellation">{t('cancelBooking')}</button></div></form>
    </Modal>}
  </div>;
}

function Modal({ title, children, onClose, testId }: { title: string; children: ReactNode; onClose: () => void; testId: string }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#102e27]/45 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }} data-testid={testId}><section role="dialog" aria-modal="true" className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[1.7rem] bg-[#fffdf7] p-5 shadow-2xl sm:max-w-lg sm:rounded-[1.7rem] sm:p-6"><div className="mb-5 flex items-start justify-between gap-4"><h2 className="font-display text-xl font-bold">{title}</h2><button onClick={onClose} aria-label="Close dialog" className="rounded-full p-2 text-[#536b61] hover:bg-[#f1eddf]" data-testid="button-close-dialog"><X size={17} /></button></div>{children}</section></div>;
}

function ReviewList({ items, language, userId, busyId, setBusyId, onReview, t }: { items: FinanceReviewItem[]; language: Language; userId: string; busyId: string; setBusyId: (value: string) => void; onReview: (item: FinanceReviewItem) => void; t: (key: string) => string }) {
  const locale = language === 'ar' ? 'ar-IQ' : language === 'ku' ? 'ku-IQ' : 'en-IQ';
  return <div className="divide-y divide-[#eee9de]">{items.map(item => {
    const self = item.requestedBy === userId;
    const canReview = item.status === 'pending' || item.status === 'processing';
    const canApprovePayout = item.kind !== 'payout' || item.status === 'pending';
    return <article key={item.id} className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-6" data-testid={`review-item-${item.id}`}>
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge tone={item.kind === 'refund' ? 'amber' : 'blue'}>{t(item.kind)}</Badge><Badge tone={item.status === 'pending' ? 'amber' : 'neutral'}>{t(item.status) === item.status ? item.status.replaceAll('_', ' ') : t(item.status)}</Badge>{item.amountIqd != null && <span className="font-mono text-xs font-bold">{formatIqd(item.amountIqd)} IQD</span>}</div><p className="mt-2 text-xs leading-relaxed text-[#51665e]">{item.reason}</p><p className="mt-2 text-[10px] text-[#819087]">{t('requestedBy')}: <span className="font-mono">{item.requestedBy}</span>{item.partnerId && <span> · {item.partnerId}</span>}{item.periodStart && <span> · {formatDate(item.periodStart, locale)} – {formatDate(item.periodEnd, locale)}</span>}</p>{self && <p className="mt-1 text-[10px] font-semibold text-[#9a4435]">{t('ownRequest')}</p>}{item.kind === 'payout' && <p className="mt-1 text-[10px] text-[#866c37]">{t('trackingOnly')}</p>}</div>
      <div className="flex flex-wrap gap-2"><button onClick={() => onReview(item)} disabled={!canReview || self || busyId === item.id} className="rounded-lg border border-[#d9a89a] bg-[#fff5f1] px-3 py-2 text-[10px] font-bold text-[#9a4435] disabled:opacity-40" data-testid={`button-reject-review-${item.id}`}>{t('reject')}</button><button onClick={() => onReview(item)} disabled={!canReview || self || !canApprovePayout || busyId === item.id} className="rounded-lg bg-[#174d43] px-3 py-2 text-[10px] font-bold text-[#fff9e9] disabled:cursor-not-allowed disabled:opacity-40" data-testid={`button-approve-review-${item.id}`}>{t('approve')}</button></div>
    </article>;
  })}</div>;
}

function SettlementGroups({ groups, t }: { groups: FinanceSettlementSummary['groups']; t: (key: string) => string }) {
  if (!groups.length) return <Empty title={t('noSettlementGroups')} text={t('noSettlementAmount')} />;
  return <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-xs"><thead><tr className="bg-[#f7f4eb] text-[10px] uppercase tracking-[.1em] text-[#78857c]">{[t('group'),t('accessType'),t('verified'),t('rejected'),t('disputed'),t('onHold')].map(label => <th key={label} className="px-4 py-3 font-bold">{label}</th>)}</tr></thead><tbody>{groups.map((item, index) => <tr key={`${item.partnerId}-${item.facility}-${item.category}-${index}`} className="border-t border-[#eee9de]" data-testid={`row-settlement-group-${index}`}><td className="px-4 py-3"><p className="font-semibold">{item.partnerName}</p><p className="mt-1 text-[10px] text-[#839087]">{item.facility} · {item.city} · {item.category}</p></td><td className="px-4 py-3">{item.accessType}</td><td className="px-4 py-3 font-mono font-bold text-[#2d6947]">{item.verifiedVisits}</td><td className="px-4 py-3 font-mono">{item.rejectedVisits}</td><td className="px-4 py-3 font-mono font-bold text-[#9a4435]">{item.disputedVisits}</td><td className="px-4 py-3 font-mono font-bold text-[#85601b]">{item.onHoldVisits}</td></tr>)}</tbody></table></div>;
}

function HoldPanel({ summary, t }: { summary: FinanceSettlementSummary | undefined; t: (key: string) => string }) {
  const holdCount = (summary?.disputedVisits ?? 0) + (summary?.onHoldVisits ?? 0);
  return <section className="rounded-2xl border border-[#d7b880] bg-[#fff8e9] p-5" data-testid="settlement-payout-guard"><div className="flex items-start gap-3"><CircleAlert className="mt-0.5 shrink-0 text-[#886426]" size={18} /><div><h3 className="text-sm font-bold text-[#54431f]">{t('holdTitle')}</h3><p className="mt-1 text-xs leading-relaxed text-[#7b6944]">{t('holdCopy')}</p><p className="mt-3 text-xs font-bold text-[#594a2c]">{t('disputed')}: {summary?.disputedVisits ?? 0} <span className="mx-2 text-[#b49a67]">/</span> {t('onHold')}: {summary?.onHoldVisits ?? 0} <span className="mx-2 text-[#b49a67]">/</span> {t('approvalGate')}: {summary?.payoutApprovalEnabled ? t('gateEnabled') : t('gateDisabled')}</p>{holdCount > 0 && <Badge tone="amber">{holdCount} {t('onHold')}</Badge>}</div></div></section>;
}

function AuditView({ audit, fallback, t }: { audit: unknown; fallback: unknown[]; t: (key: string) => string }) {
  const value = asRecord(audit);
  const rows = [...(Array.isArray(value.financeReviews) ? value.financeReviews : []), ...(Array.isArray(value.operations) ? value.operations : []), ...fallback];
  if (!rows.length) return <Empty title={t('noAudit')} />;
  return <div className="divide-y divide-[#eee9de]">{rows.map((entry, i) => { const item = asRecord(entry); const id = String(item.id ?? `${item.action ?? item.eventType ?? 'event'}-${i}`); return <article key={id} className="flex flex-wrap items-start gap-x-5 gap-y-1 px-5 py-4 text-xs" data-testid={`audit-entry-${id}`}><div className="min-w-32"><Badge>{str(item.action ?? item.eventType ?? item.kind, 'event')}</Badge></div><div className="min-w-40 flex-1"><p className="font-semibold text-[#36564b]">{str(item.detail ?? item.reason ?? item.status)}</p><p className="mt-1 font-mono text-[10px] text-[#839087]">{str(item.actorId ?? item.userId ?? item.reviewedBy)}</p></div><time className="ms-auto text-[10px] text-[#839087]">{formatDate(item.createdAt ?? item.receivedAt)}</time></article>; })}</div>;
}
