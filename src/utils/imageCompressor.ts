/**
 * Utility to compress images on the client side before uploading or saving.
 * Reduces image dimensions and uses JPEG compression to keep file sizes
 * well within free tier limits (typically under 100-150KB per image).
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0
  mimeType?: string;
}

export async function compressImageFile(
  file: File,
  options: CompressionOptions = {}
): Promise<string> {
  const {
    maxWidth = 800,
    maxHeight = 800,
    quality = 0.65,
    mimeType = 'image/jpeg'
  } = options;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // First pass scaling
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
          resolve(event.target?.result as string);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        let compressedDataUrl = canvas.toDataURL(mimeType, quality);

        // Safeguard: If compressed result is still larger than 180KB (~240k chars base64), do an aggressive second pass
        if (compressedDataUrl.length > 240000) {
          const pass2Canvas = document.createElement('canvas');
          const pass2Width = Math.min(width, 600);
          const pass2Height = Math.round((height * pass2Width) / width);
          pass2Canvas.width = pass2Width;
          pass2Canvas.height = pass2Height;
          const pass2Ctx = pass2Canvas.getContext('2d');
          if (pass2Ctx) {
            pass2Ctx.imageSmoothingEnabled = true;
            pass2Ctx.imageSmoothingQuality = 'medium';
            pass2Ctx.drawImage(img, 0, 0, pass2Width, pass2Height);
            compressedDataUrl = pass2Canvas.toDataURL(mimeType, 0.52);
          }
        }

        resolve(compressedDataUrl);
      };

      img.onerror = (err) => {
        reject(err);
      };

      img.src = event.target?.result as string;
    };

    reader.onerror = (err) => {
      reject(err);
    };

    reader.readAsDataURL(file);
  });
}
