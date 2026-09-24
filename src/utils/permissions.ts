import { UserRole, ChatMessage, PublicComplaint, MaintenanceRequest, Craftsman, Poll, AdminDecision } from '../types';

export interface UserContext {
  displayName?: string | null;
  email?: string | null;
}

/**
 * Checks if the current user has permission to delete a chat message.
 * - Admin: Can delete any message.
 * - Resident / Assistant: Can only delete messages they authored.
 */
export function canDeleteChatMessage(
  msg: ChatMessage,
  role: UserRole,
  user?: UserContext | null,
  flatNumber?: number | string
): boolean {
  if (role === 'ADMIN' || role === 'MANAGER') {
    return true;
  }
  
  // Check if authored by current user
  if (flatNumber && msg.flatNumber && String(flatNumber).trim() === String(msg.flatNumber).trim()) {
    return true;
  }
  
  if (role === 'ASSISTANT' && (msg.senderName === 'المساعد الفني' || msg.flatNumber === 'فني الصيانة')) {
    return true;
  }

  const userEmail = user?.email?.toLowerCase().trim();
  const senderEmail = (msg as any).senderEmail?.toLowerCase().trim();
  if (userEmail && senderEmail && userEmail === senderEmail) {
    return true;
  }
  
  return false;
}

export function canDeleteComplaint(
  _complaint: PublicComplaint,
  role: UserRole,
  _user?: UserContext | null,
  _flatNumber?: number | string
): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

export function canDeleteMaintenanceRequest(
  _req: MaintenanceRequest,
  role: UserRole,
  _user?: UserContext | null,
  _flatNumber?: number | string
): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

export function canDeleteCraftsman(
  _craftsman: Craftsman,
  role: UserRole,
  _user?: UserContext | null,
  _flatNumber?: number | string
): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

/**
 * Checks if the user can delete a community poll.
 * Only union admin has permission to delete polls.
 */
export function canDeletePoll(_poll: Poll, role: UserRole): boolean {
  return role === 'ADMIN';
}

/**
 * Checks if the user can delete an administrative decision.
 * Only union admin has permission to delete official decisions.
 */
export function canDeleteDecision(_decision: AdminDecision, role: UserRole): boolean {
  return role === 'ADMIN';
}
