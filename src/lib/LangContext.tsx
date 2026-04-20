// src/lib/LangContext.tsx — Alpha Quantum ERP v20 (full AR translation + RTL)
import { createContext, useContext, useState, ReactNode, useEffect } from 'react'

type Lang = 'en' | 'ar'

// ── English ───────────────────────────────────────────────────────────────────
const EN = {
  // Navigation
  dashboard: 'Dashboard',         expenses: 'Expenses',
  invoices: 'Invoices',           wallet: 'Wallet',
  approvals: 'Approvals',         budget: 'Budget',
  assets: 'Assets',               investments: 'Investments',
  liabilities: 'Liabilities',     workers: 'Workers',
  timesheet: 'Timesheet',         salary: 'Salary',
  customers: 'Customers',         leads: 'Leads',
  projects: 'Projects',           tasks: 'Tasks',
  reports: 'Reports',             users: 'Users',
  permissions: 'Permissions',     settings: 'Settings',
  notifications: 'Notifications', signOut: 'Sign Out',

  // Dashboard
  welcome: 'Welcome back',        loading: 'Loading…',
  totalExpenses: 'Total Expenses',totalInvoiced: 'Total Invoiced',
  walletBalance: 'Balance',       pendingApprovals: 'Pending Approvals',
  activeWorkers: 'Active Workers',totalAssets: 'Total Assets',
  activeProjects: 'Active Projects', customers_label: 'Customers',
  approvedExpenses: 'Approved Expenses',
  approvedInvoices: 'Approved Invoices',
  records: 'records',             invoices_label: 'invoices',
  awaitingReview: 'awaiting review',
  activeHRForce: 'Active HR force',
  sarValue: 'SAR value',         leadsWon: 'leads · won',
  tasks_label: 'tasks',
  cashMinusExpenses: 'cash – approved expenses',
  expensesLast6: 'Approved Expenses — Last 6 Months',
  quickActions: 'Quick Actions',
  newExpense: '+ New Expense',   newInvoice: '+ New Invoice',
  viewWallet: 'View Wallet',     reviewApprovals: 'Review Approvals',
  totalExpenses2: 'Total Expenses', totalInvoices: 'Total Invoices',
  pendingExpenses: 'Pending Expenses', pendingInvoices: 'Pending Invoices',
  recentActivity: 'Recent Activity', monthlyTrend: 'Monthly Trend',
  netFlow: 'Net Cash Flow',
  refresh: 'Refresh',

  // Status
  approved: 'APPROVED',  pending: 'PENDING',   rejected: 'REJECTED',
  draft: 'DRAFT',        paid: 'PAID',         overdue: 'OVERDUE',
  active: 'Active',      inactive: 'Inactive',

  // Common fields
  amount: 'Amount',      status: 'Status',     date: 'Date',
  name: 'Name',          email: 'Email',       phone: 'Phone',
  description: 'Description', category: 'Category', notes: 'Notes',
  search: 'Search…',     save: 'Save',         cancel: 'Cancel',
  delete: 'Delete',      edit: 'Edit',         add: 'Add',
  submit: 'Submit',      close: 'Close',       confirm: 'Confirm',
  export: 'Export',      import: 'Import',     print: 'Print',
  filter: 'Filter',      clear: 'Clear',       apply: 'Apply',
  yes: 'Yes',            no: 'No',

  // Invoice / PDF
  invoiceFrom: 'Invoice From',   invoiceTo: 'Invoice To',
  invoiceNumber: 'Invoice #',    invoiceDate: 'Invoice Date',
  dueDate: 'Due Date',           itemDescription: 'Item Description',
  qty: 'QTY',                    unitPrice: 'Unit Price',
  tax: 'Tax',                    total: 'Total',
  subtotal: 'Subtotal',          grandTotal: 'Grand Total',
  paymentInfo: 'Payment Information', vatNumber: 'VAT Number',
  thanksBusiness: 'THANK YOU FOR YOUR BUSINESS!',
  companyName: 'Alpha Ultimate Ltd.',
  companyTagline: 'Construction & Cleaning | KSA',
  exportPDF: '⬇ PDF',           exportExcel: '⬇ Excel',
  allExpenses: 'All Expenses',   allInvoices: 'All Invoices',

  // Settings
  company: 'Company',                  finance: 'Finance',
  security: 'Security',               theme: 'Appearance',
  companyInfo: 'Company Information', companyName2: 'Company Name',
  crNumber: 'CR Number',              vatNum: 'VAT Number',
  address: 'Address',                 website: 'Website',
  currency: 'Default Currency',       vatRate: 'Default VAT Rate (%)',
  fiscalYear: 'Fiscal Year Start',    invoicePrefix: 'Invoice Prefix',
  expensePrefix: 'Expense Prefix',    paymentTerms: 'Default Payment Terms',
  currentPassword: 'Current Password',newPassword: 'New Password',
  confirmPassword: 'Confirm New Password',
  changePassword: 'Change Password',  darkMode: 'Dark Mode',
  lightMode: 'Light Mode',            saveSettings: '💾 Save Settings',

  // Permissions
  noAccess: 'No Access',             viewOwn: 'View Own',
  viewAll: 'View All',               submitOnly: 'Submit Only',
  fullControl: 'Full Control',       reportView: 'Report View',

  // Tables
  action: 'Actions',                 type: 'Type',
  reference: 'Reference',            department: 'Department',
  role: 'Role',                      createdAt: 'Created',
  updatedAt: 'Updated',
}

// ── Arabic ────────────────────────────────────────────────────────────────────
const AR: typeof EN = {
  // Navigation
  dashboard: 'لوحة التحكم',     expenses: 'المصروفات',
  invoices: 'الفواتير',          wallet: 'المحفظة',
  approvals: 'الموافقات',        budget: 'الميزانية',
  assets: 'الأصول',              investments: 'الاستثمارات',
  liabilities: 'الالتزامات',     workers: 'الموظفون',
  timesheet: 'سجل الوقت',        salary: 'الرواتب',
  customers: 'العملاء',          leads: 'العملاء المحتملون',
  projects: 'المشاريع',          tasks: 'المهام',
  reports: 'التقارير',           users: 'المستخدمون',
  permissions: 'الصلاحيات',      settings: 'الإعدادات',
  notifications: 'الإشعارات',    signOut: 'تسجيل الخروج',

  // Dashboard
  welcome: 'مرحباً بعودتك',      loading: 'جارٍ التحميل…',
  totalExpenses: 'إجمالي المصروفات', totalInvoiced: 'إجمالي الفواتير',
  walletBalance: 'الرصيد',       pendingApprovals: 'الموافقات المعلقة',
  activeWorkers: 'الموظفون النشطون', totalAssets: 'إجمالي الأصول',
  activeProjects: 'المشاريع النشطة', customers_label: 'العملاء',
  approvedExpenses: 'المصروفات المعتمدة',
  approvedInvoices: 'الفواتير المعتمدة',
  records: 'سجل',               invoices_label: 'فاتورة',
  awaitingReview: 'في انتظار المراجعة',
  activeHRForce: 'القوى العاملة النشطة',
  sarValue: 'قيمة بالريال',      leadsWon: 'عميل · تم الفوز',
  tasks_label: 'مهمة',
  cashMinusExpenses: 'النقد – المصروفات المعتمدة',
  expensesLast6: 'المصروفات المعتمدة — آخر 6 أشهر',
  quickActions: 'إجراءات سريعة',
  newExpense: '+ مصروف جديد',    newInvoice: '+ فاتورة جديدة',
  viewWallet: 'عرض المحفظة',    reviewApprovals: 'مراجعة الموافقات',
  totalExpenses2: 'إجمالي المصروفات', totalInvoices: 'إجمالي الفواتير',
  pendingExpenses: 'المصروفات المعلقة', pendingInvoices: 'الفواتير المعلقة',
  recentActivity: 'النشاط الأخير', monthlyTrend: 'الاتجاه الشهري',
  netFlow: 'صافي التدفق النقدي',
  refresh: 'تحديث',

  // Status
  approved: 'معتمد',  pending: 'معلق',   rejected: 'مرفوض',
  draft: 'مسودة',     paid: 'مدفوع',     overdue: 'متأخر',
  active: 'نشط',      inactive: 'غير نشط',

  // Common
  amount: 'المبلغ',       status: 'الحالة',     date: 'التاريخ',
  name: 'الاسم',          email: 'البريد الإلكتروني', phone: 'الهاتف',
  description: 'الوصف',  category: 'الفئة',    notes: 'ملاحظات',
  search: 'بحث…',         save: 'حفظ',          cancel: 'إلغاء',
  delete: 'حذف',          edit: 'تعديل',         add: 'إضافة',
  submit: 'إرسال',        close: 'إغلاق',        confirm: 'تأكيد',
  export: 'تصدير',        import: 'استيراد',     print: 'طباعة',
  filter: 'تصفية',        clear: 'مسح',          apply: 'تطبيق',
  yes: 'نعم',             no: 'لا',

  // Invoice / PDF
  invoiceFrom: 'من',              invoiceTo: 'إلى',
  invoiceNumber: 'رقم الفاتورة', invoiceDate: 'تاريخ الفاتورة',
  dueDate: 'تاريخ الاستحقاق',   itemDescription: 'وصف البند',
  qty: 'الكمية',                 unitPrice: 'سعر الوحدة',
  tax: 'الضريبة',                total: 'الإجمالي',
  subtotal: 'المجموع الفرعي',    grandTotal: 'الإجمالي الكلي',
  paymentInfo: 'معلومات الدفع',  vatNumber: 'الرقم الضريبي',
  thanksBusiness: 'شكراً لتعاملكم معنا!',
  companyName: 'ألفا أولتيميت المحدودة',
  companyTagline: 'إنشاءات وتنظيف | المملكة العربية السعودية',
  exportPDF: '⬇ PDF',            exportExcel: '⬇ Excel',
  allExpenses: 'جميع المصروفات', allInvoices: 'جميع الفواتير',

  // Settings
  company: 'الشركة',              finance: 'المالية',
  security: 'الأمان',            theme: 'المظهر',
  companyInfo: 'معلومات الشركة', companyName2: 'اسم الشركة',
  crNumber: 'رقم السجل التجاري', vatNum: 'الرقم الضريبي',
  address: 'العنوان',             website: 'الموقع الإلكتروني',
  currency: 'العملة الافتراضية', vatRate: 'نسبة ضريبة القيمة المضافة (%)',
  fiscalYear: 'بداية السنة المالية', invoicePrefix: 'بادئة الفاتورة',
  expensePrefix: 'بادئة المصروف', paymentTerms: 'شروط الدفع الافتراضية',
  currentPassword: 'كلمة المرور الحالية',
  newPassword: 'كلمة المرور الجديدة',
  confirmPassword: 'تأكيد كلمة المرور الجديدة',
  changePassword: 'تغيير كلمة المرور',
  darkMode: 'الوضع الداكن',      lightMode: 'الوضع الفاتح',
  saveSettings: '💾 حفظ الإعدادات',

  // Permissions
  noAccess: 'لا وصول',          viewOwn: 'عرض الخاص',
  viewAll: 'عرض الكل',           submitOnly: 'إرسال فقط',
  fullControl: 'تحكم كامل',      reportView: 'عرض التقارير',

  // Tables
  action: 'الإجراءات',           type: 'النوع',
  reference: 'المرجع',           department: 'القسم',
  role: 'الدور',                  createdAt: 'تاريخ الإنشاء',
  updatedAt: 'تاريخ التحديث',
}

const TRANSLATIONS: Record<Lang, typeof EN> = { en: EN, ar: AR }

interface LangCtx { lang: Lang; t: typeof EN; toggle: () => void; isRTL: boolean }
const Ctx = createContext<LangCtx>({ lang:'en', t: EN, toggle: () => {}, isRTL: false })

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('erp_lang') as Lang) ?? 'en')

  useEffect(() => {
    const isAr = lang === 'ar'
    document.documentElement.setAttribute('dir', isAr ? 'rtl' : 'ltr')
    document.documentElement.setAttribute('lang', lang)
    document.body.style.fontFamily = isAr
      ? "'Cairo', 'Noto Sans Arabic', var(--font)"
      : 'var(--font)'
  }, [lang])

  function toggle() {
    setLang(p => {
      const next: Lang = p === 'en' ? 'ar' : 'en'
      localStorage.setItem('erp_lang', next)
      return next
    })
  }
  return (
    <Ctx.Provider value={{ lang, t: TRANSLATIONS[lang], toggle, isRTL: lang === 'ar' }}>
      {children}
    </Ctx.Provider>
  )
}

export function useLang() { return useContext(Ctx) }
