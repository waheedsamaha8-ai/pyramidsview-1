export type UserRole = 'ADMIN' | 'MANAGER' | 'RESIDENT' | 'ASSISTANT';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  name?: string;
  role: UserRole;
  flatNumber?: number | string; // If role is RESIDENT, which flat they represent
  residentType?: 'OWNER' | 'TENANT' | string;
}

export interface FloorConfig {
  id: string;
  type: 'basement' | 'ground' | 'mezzanine' | 'typical' | 'roof';
  floorLabel: string;
  unitsCount: number;
  activityType: string;
  startUnitNumber?: number | string;
  unitNumbers?: (number | string)[];
}

export interface AdminResidentProfile {
  flatNumber: number | string;
  name: string;
  phone?: string;
  activityType?: string;
  ownershipType?: string;
  monthlyFee?: number;
  initialBalance?: number;
  notes?: string;
}

export interface Resident {
  id: string;
  flatNumber: number | string;
  name: string;
  activityType: string;
  phone?: string;
  notes?: string;
  ownershipType?: 'تمليك' | 'إيجار' | string;
  tenantName?: string;
  tenantPhone?: string;
  monthlyFee?: number;
  initialBalance?: number;
  // Account Credentials & WhatsApp Invitations
  email?: string;
  password?: string;
  accountStatus?: 'ACTIVE' | 'INVITED' | 'REVOKED';
  tenantEmail?: string;
  tenantPassword?: string;
  tenantAccountStatus?: 'ACTIVE' | 'INVITED' | 'REVOKED';
  lastLoginAt?: string;
}

export interface Payment {
  id: string;
  year: number;
  month: string;
  residentId: string;
  residentName: string;
  flatNumber: number | string;
  paymentType: string;
  amount: number;
  receiptNumber?: string;
  notes?: string;
  fileId?: string; // Google Drive file ID
  fileUrl?: string; // URL to view the receipt image
  date: string;
  isManuallyPaid: boolean;
  createdAt?: string;
}

export interface Expense {
  id: string;
  year: number;
  month: string;
  expenseType: string;
  amount: number;
  notes?: string;
  fileId?: string; // Google Drive file ID
  fileUrl?: string; // URL to view the invoice image
  date: string;
  createdAt?: string;
}

export interface BuildingRules {
  rules: string[];
}

export interface AssistantConfig {
  email: string;
  password: string;
  name?: string;
}

export interface Building {
  id: string; // e.g. "pyramids_view_1" or "bld_1727..."
  code: string; // shareable short code e.g. "PV-01", "B-4921"
  name: string; // e.g. "عمارة بيراميدز فيو 1"
  address?: string; // e.g. "هضبة الأهرام"
  presidentName: string; // e.g. "وحيد سماحة"
  presidentEmail: string; // e.g. "waheedsamaha8@gmail.com"
  presidentPhone?: string;
  createdAt: string;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  googleDriveBackupEmail?: string;
  plan?: 'FREE' | 'COMMERCIAL_PRO' | 'TRIAL';
  config?: AppConfig;
}

export interface AppConfig {
  buildingId?: string;
  buildingName?: string;
  buildingAddress?: string;
  buildingCode?: string;
  presidentName?: string;
  presidentEmail?: string;
  presidentPhone?: string;
  expenseTypes: string[];
  paymentTypes: string[];
  activityTypes: string[];
  admins: string[]; // List of admin emails
  managers: string[]; // List of manager emails
  assistantConfig?: AssistantConfig; // Technical Assistant credentials
  accountingStartDate?: string; // e.g. "2026-01-01"
  defaultMonthlyFee?: number; // e.g. 400
  activityDefaultFees?: Record<string, number>; // e.g. { 'سكني': 400, 'سكني مغلق': 200, 'مفروش': 600, 'إداري': 800, 'تجاري': 500 }
  buildingLayout?: FloorConfig[];
  adminResidentProfile?: AdminResidentProfile;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  category?: 'chat' | 'registration' | 'communication' | 'services' | 'complaint' | 'union' | 'assistant';
  targetRole?: UserRole | 'ALL';
  targetFlat?: number | string;
  senderName?: string;
  timestamp: string;
  read: boolean;
}

export interface OfflineAction {
  id: string;
  type: 
    | 'ADD_RESIDENT' | 'EDIT_RESIDENT' | 'DELETE_RESIDENT' 
    | 'ADD_PAYMENT' | 'EDIT_PAYMENT' | 'DELETE_PAYMENT' 
    | 'ADD_EXPENSE' | 'EDIT_EXPENSE' | 'DELETE_EXPENSE' 
    | 'UPDATE_RULES' | 'UPDATE_CONFIG'
    | 'ADD_CRAFTSMAN' | 'EDIT_CRAFTSMAN' | 'DELETE_CRAFTSMAN'
    | 'ADD_CHAT_MESSAGE' | 'DELETE_CHAT_MESSAGE' | 'SET_ALL_CHAT'
    | 'ADD_DECISION' | 'EDIT_DECISION' | 'DELETE_DECISION'
    | 'ADD_POLL' | 'EDIT_POLL' | 'DELETE_POLL'
    | 'ADD_COMPLAINT' | 'EDIT_COMPLAINT' | 'DELETE_COMPLAINT'
    | 'ADD_MAINTENANCE' | 'EDIT_MAINTENANCE' | 'DELETE_MAINTENANCE'
    | 'ADD_EVENT' | 'EDIT_EVENT' | 'DELETE_EVENT';
  payload: any;
  timestamp: number;
}

export interface MaintenanceRequest {
  id: string;
  flatNumber: number | string;
  residentName: string;
  title: string;
  description: string;
  category: 'سباكة' | 'كهرباء' | 'مصاعد' | 'نظافة' | 'أخرى';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  date: string;
  notes?: string;
}

export interface CraftsmanComment {
  id: string;
  senderName: string;
  flatNumber?: number | string;
  text: string;
  rating?: number; // 1-5 stars
  timestamp: string;
}

export interface Craftsman {
  id: string;
  name: string;
  specialty: string;
  phone: string;
  notes?: string;
  addedBy: string;
  comments?: CraftsmanComment[];
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface Poll {
  id: string;
  title: string;
  description: string;
  options: PollOption[];
  userVotes: { [userEmail: string]: string }; // key: email, value: optionId
  createdAt: string;
  endDate: string;
  status: 'ACTIVE' | 'CLOSED';
  targetAudience?: 'ALL' | 'RESIDENTS' | 'ASSISTANTS';
}

export interface AdminDecision {
  id: string;
  decisionNumber: string; // e.g. "ق-2026/01"
  title: string;
  description: string;
  category: 'تنظيمي' | 'مالي' | 'إداري' | 'صيانة وتشغيل' | 'أمن وحراسة' | 'أخرى';
  date: string;
  effectiveDate?: string;
  issuedBy: string;
  status: 'ACTIVE' | 'ARCHIVED';
  notes?: string;
}

export interface BuildingEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  time?: string;
  type: 'MAINTENANCE' | 'MEETING' | 'SOCIAL' | 'OTHER';
  targetAudience: 'ALL' | 'MANAGERS' | 'RESIDENTS';
  status: 'SCHEDULED' | 'DONE' | 'CANCELLED';
}

export interface ChatMessage {
  id: string;
  senderName: string;
  senderRole?: UserRole;
  flatNumber?: number | string;
  channel?: 'all' | 'admin' | 'assistant' | 'direct';
  targetFlat?: number | string;
  text: string;
  timestamp: string;
  imageUrl?: string;
  isImportant?: boolean;
}

export interface ComplaintComment {
  id: string;
  senderName: string;
  text: string;
  timestamp: string;
}

export interface PublicComplaint {
  id: string;
  title: string;
  description: string;
  flatNumber?: number | string;
  residentName: string;
  isAnonymous?: boolean;
  imageUrl?: string;
  date: string;
  comments: ComplaintComment[];
}

export interface JoinRequest {
  id: string;
  flatNumber: number | string;
  residentType: 'OWNER' | 'TENANT';
  ownerName: string;
  ownerPhone: string;
  tenantName: string;
  tenantPhone: string;
  email: string;
  password?: string;
  status: 'PENDING' | 'APPROVED' | 'DECLINED';
  createdAt: string;
}
