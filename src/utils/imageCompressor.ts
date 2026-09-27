/**
 * Utility to compress images on the client side before uploading or saving.
 * Reduces image dimensions and uses JPEG compression to keep file sizes
 * ultra-compact (typically 15-35KB per image), preserving high legibility of
 * numbers, text, stamps and receipts without risking storage quota exhaustion.
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0
  mimeType?: string;
}

export async function compressBase64Image(
  dataUrl: string,
  options: CompressionOptions = {}
): Promise<string> {
  const {
    maxWidth = 550,
    maxHeight = 550,
    quality = 0.48,
    mimeType = 'image/jpeg'
  } = options;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      let compressed = canvas.toDataURL(mimeType, quality);

      // Aggressive second pass if still above ~30KB (approx 40,000 base64 chars)
      if (compressed.length > 40000) {
        const pass2Canvas = document.createElement('canvas');
        const pass2Width = Math.min(width, 420);
        const pass2Height = Math.round((height * pass2Width) / width);
        pass2Canvas.width = pass2Width;
        pass2Canvas.height = pass2Height;
        const pass2Ctx = pass2Canvas.getContext('2d');
        if (pass2Ctx) {
          pass2Ctx.imageSmoothingEnabled = true;
          pass2Ctx.imageSmoothingQuality = 'medium';
          pass2Ctx.drawImage(img, 0, 0, pass2Width, pass2Height);
          compressed = pass2Canvas.toDataURL(mimeType, 0.38);
        }
      }

      // Final pass if still above ~22KB
      if (compressed.length > 30000) {
        const pass3Canvas = document.createElement('canvas');
        const pass3Width = Math.min(width, 320);
        const pass3Height = Math.round((height * pass3Width) / width);
        pass3Canvas.width = pass3Width;
        pass3Canvas.height = pass3Height;
        const pass3Ctx = pass3Canvas.getContext('2d');
        if (pass3Ctx) {
          pass3Ctx.imageSmoothingEnabled = true;
          pass3Ctx.drawImage(img, 0, 0, pass3Width, pass3Height);
          compressed = pass3Canvas.toDataURL(mimeType, 0.32);
        }
      }

      resolve(compressed);
    };

    img.onerror = () => {
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
}

export async function compressImageFile(
  file: File,
  options: CompressionOptions = {}
): Promise<string> {
  const {
    maxWidth = 550,
    maxHeight = 550,
    quality = 0.48,
    mimeType = 'image/jpeg'
  } = options;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (event) => {
      const rawDataUrl = event.target?.result as string;
      if (!rawDataUrl) {
        reject(new Error('Failed to read file'));
        return;
      }

      try {
        const compressed = await compressBase64Image(rawDataUrl, {
          maxWidth,
          maxHeight,
          quality,
          mimeType
        });
        resolve(compressed);
      } catch {
        // Even if compression error happens, do not return huge raw data
        try {
          const fallback = await compressBase64Image(rawDataUrl, {
            maxWidth: 380,
            maxHeight: 380,
            quality: 0.35,
            mimeType: 'image/jpeg'
          });
          resolve(fallback);
        } catch {
          resolve(rawDataUrl);
        }
      }
    };

    reader.onerror = (err) => {
      reject(err);
    };

    reader.readAsDataURL(file);
  });
}
