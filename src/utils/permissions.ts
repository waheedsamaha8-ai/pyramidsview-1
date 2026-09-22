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
  user: UserContext | null,
  flatNumber?: number | string
): boolean {
  if (role === 'ADMIN') return true;

  const currentName = (user?.displayName || '').trim().toLowerCase();
  const senderName = (msg.senderName || '').trim().toLowerCase();

  const isAuthorByName = Boolean(currentName && senderName && currentName === senderName);
  const isAuthorByFlat = flatNumber !== undefined && msg.flatNumber !== undefined &&
    String(msg.flatNumber).trim() === String(flatNumber).trim();
  const isAssistantMessage = role === 'ASSISTANT' &&
    (senderName.includes('المساعد الفني') || senderName.includes('فني الصيانة') || String(msg.flatNumber).includes('فني'));

  return isAuthorByName || isAuthorByFlat || isAssistantMessage;
}

/**
 * Checks if the current user has permission to delete a public complaint.
 * - Admin: Can delete any complaint.
 * - Resident / Assistant: Can only delete complaints they submitted.
 */
export function canDeleteComplaint(
  complaint: PublicComplaint,
  role: UserRole,
  user: UserContext | null,
  flatNumber?: number | string
): boolean {
  if (role === 'ADMIN') return true;

  const currentName = (user?.displayName || '').trim().toLowerCase();
  const residentName = (complaint.residentName || '').trim().toLowerCase();

  const isAuthorByName = Boolean(currentName && residentName && currentName === residentName);
  const isAuthorByFlat = flatNumber !== undefined && complaint.flatNumber !== undefined &&
    String(complaint.flatNumber).trim() === String(flatNumber).trim();
  const isAssistantComplaint = role === 'ASSISTANT' &&
    (residentName.includes('المساعد الفني') || residentName.includes('فني الصيانة'));

  return isAuthorByName || isAuthorByFlat || isAssistantComplaint;
}

/**
 * Checks if the current user has permission to delete a maintenance request.
 * - Admin: Can delete any maintenance request.
 * - Resident / Assistant: Can only delete requests they submitted.
 */
export function canDeleteMaintenanceRequest(
  req: MaintenanceRequest,
  role: UserRole,
  user: UserContext | null,
  flatNumber?: number | string
): boolean {
  if (role === 'ADMIN') return true;

  const currentName = (user?.displayName || '').trim().toLowerCase();
  const reqName = (req.residentName || '').trim().toLowerCase();

  const isAuthorByName = Boolean(currentName && reqName && currentName === reqName);
  const isAuthorByFlat = flatNumber !== undefined && req.flatNumber !== undefined &&
    String(req.flatNumber).trim() === String(flatNumber).trim();
  const isAssistantRequest = role === 'ASSISTANT' &&
    (reqName.includes('المساعد الفني') || reqName.includes('فني الصيانة'));

  return isAuthorByName || isAuthorByFlat || isAssistantRequest;
}

/**
 * Checks if the current user has permission to delete a craftsman from the directory.
 * - Admin: Can delete any craftsman.
 * - Resident / Assistant: Can only delete craftsmen they added themselves.
 */
export function canDeleteCraftsman(
  craftsman: Craftsman,
  role: UserRole,
  user: UserContext | null,
  flatNumber?: number | string
): boolean {
  if (role === 'ADMIN') return true;

  const currentName = (user?.displayName || '').trim().toLowerCase();
  const addedBy = (craftsman.addedBy || '').trim().toLowerCase();

  const isAuthorByName = Boolean(currentName && addedBy && addedBy.includes(currentName));
  const isAuthorByFlat = flatNumber !== undefined && Boolean(addedBy) && addedBy.includes(String(flatNumber));
  const isAuthorAssistant = role === 'ASSISTANT' && Boolean(addedBy) &&
    (addedBy.includes('المساعد الفني') || addedBy.includes('فني الصيانة'));

  return isAuthorByName || isAuthorByFlat || isAuthorAssistant;
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
