import { toWhatsAppNumber } from './phoneUtils';

export interface ShareImageOptions {
  imageBlob: Blob;
  fileName: string;
  phone?: string | number | null;
  recipientName?: string;
  title: string;
  text: string;
  onSuccessToast?: (msg: string) => void;
  onErrorToast?: (msg: string) => void;
}

export interface ShareImageResult {
  success: boolean;
  method: 'native' | 'clipboard_whatsapp' | 'download_whatsapp' | 'cancelled';
  message?: string;
}

/**
 * Shares an image directly to WhatsApp using:
 * 1. Copies image to clipboard (for instant paste in WhatsApp)
 * 2. Downloads the PNG image to user's device
 * 3. Opens WhatsApp directly to the recipient's phone number with prefilled message
 * Note: NEVER uses window.location.href inside iframes to prevent X-Frame-Options crashes.
 */
export async function shareImageViaWhatsApp(options: ShareImageOptions): Promise<ShareImageResult> {
  const {
    imageBlob,
    fileName,
    phone,
    recipientName,
    title,
    text,
    onSuccessToast,
    onErrorToast,
  } = options;

  const cleanPhone = toWhatsAppNumber(phone);
  const targetLabel = recipientName ? `(${recipientName})` : (phone ? `(${phone})` : '');

  // 1. Copy image to Clipboard if supported
  let copiedToClipboard = false;
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': imageBlob }),
      ]);
      copiedToClipboard = true;
    } catch (clipErr) {
      console.warn('Clipboard image write not permitted or failed:', clipErr);
    }
  }

  // 2. Download image file to user device
  try {
    const blobUrl = URL.createObjectURL(imageBlob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
  } catch (dlErr) {
    console.warn('Direct file download error:', dlErr);
  }

  // 3. Construct direct WhatsApp link using universal API endpoint
  const waUrl = cleanPhone
    ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

  // 4. Safely trigger link opening in a new tab/window without modifying iframe window.location
  let openedDirectly = false;
  try {
    const waLink = document.createElement('a');
    waLink.href = waUrl;
    waLink.target = '_blank';
    waLink.rel = 'noopener noreferrer';
    document.body.appendChild(waLink);
    waLink.click();
    document.body.removeChild(waLink);
    openedDirectly = true;
  } catch (openErr) {
    console.warn('Anchor click error, attempting window.open:', openErr);
  }

  if (!openedDirectly) {
    try {
      const win = window.open(waUrl, '_blank', 'noopener,noreferrer');
      if (win) openedDirectly = true;
    } catch (winErr) {
      console.warn('window.open blocked:', winErr);
    }
  }

  const statusMsg = copiedToClipboard
    ? `تم نسخ الصورة للحافظة وتحميلها، وفتح محادثة الواتساب مباشرة ${targetLabel} — اضغط (لصق / Ctrl+V) في الشات لإرسال الصورة فوراً!`
    : `تم تحميل الصورة لجهازك وفتح محادثة الواتساب مباشرة ${targetLabel} — يمكنك إرفاق الصورة في الشات الآن.`;

  onSuccessToast?.(statusMsg);
  return {
    success: true,
    method: copiedToClipboard ? 'clipboard_whatsapp' : 'download_whatsapp',
    message: statusMsg,
  };
}
