import html2canvas from 'html2canvas';

// Helper canvas for parsing modern CSS color functions (oklch, oklab, lab, lch, hwb, etc.) to standard RGB/RGBA strings
const colorCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
if (colorCanvas) {
  colorCanvas.width = 1;
  colorCanvas.height = 1;
}
const colorCtx = colorCanvas ? colorCanvas.getContext('2d', { willReadFrequently: true }) : null;

// Regex matching modern CSS color functions that html2canvas cannot parse natively
const MODERN_COLOR_REGEX = /(oklch|oklab|lab|lch|hwb|color)\([^)]+\)/gi;

/**
 * Converts any CSS color string (including modern oklch, oklab, hwb, lab, etc.) into standard rgb()/rgba() format
 * using the browser's native 2D Canvas parser.
 */
export function parseCssColorToRgb(colorStr: string): string {
  if (!colorStr || typeof colorStr !== 'string') {
    return colorStr;
  }

  // Check if string contains any modern color function
  if (!/(oklch|oklab|lab|lch|hwb|color)\(/i.test(colorStr)) {
    return colorStr;
  }

  try {
    if (colorCtx) {
      colorCtx.clearRect(0, 0, 1, 1);
      colorCtx.fillStyle = colorStr;
      colorCtx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = colorCtx.getImageData(0, 0, 1, 1).data;
      if (a === 255) {
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`;
      }
    }
  } catch (e) {
    // Ignore fallback
  }

  return '#334155'; // Safe slate fallback
}

/**
 * Sanitizes stylesheet text or style attributes by replacing all oklch, oklab, etc. with standard rgb() strings.
 */
export function sanitizeStyleText(cssText: string): string {
  if (!cssText || !/(oklch|oklab|lab|lch|hwb|color)\(/i.test(cssText)) {
    return cssText;
  }
  return cssText.replace(MODERN_COLOR_REGEX, (match) => parseCssColorToRgb(match));
}

export interface GeneratedImageResult {
  dataUrl: string;
  blob: Blob;
  file: File;
  download: () => void;
}

/**
 * Ultra-fast client-side image generator for printable areas with full oklch/oklab color parsing fix.
 * Returns the generated dataUrl, blob, file, and download trigger.
 * Isolates the cloned target in the cloned document at exact specified width (default 920px)
 * so that mobile viewports or parent responsive styles never distort or compress the report.
 */
export async function generateElementImageBlob(
  elementId: string,
  fileName: string,
  customWidth: number = 920
): Promise<GeneratedImageResult> {
  const elem = document.getElementById(elementId);
  if (!elem) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  // Save original styles & class names
  const prevDisplay = elem.style.display;
  const prevPosition = elem.style.position;
  const prevLeft = elem.style.left;
  const prevTop = elem.style.top;
  const prevWidth = elem.style.width;
  const prevZIndex = elem.style.zIndex;
  const prevOpacity = elem.style.opacity;
  const prevPointerEvents = elem.style.pointerEvents;
  const prevBg = elem.style.backgroundColor;
  const hadHiddenClass = elem.classList.contains('hidden');

  if (hadHiddenClass) {
    elem.classList.remove('hidden');
  }

  // Temporarily position at (0,0) with target width and microscopic opacity
  // to give html2canvas exact physical layout coordinates without user-visible flicker
  elem.style.display = 'block';
  elem.style.position = 'fixed';
  elem.style.left = '0px';
  elem.style.top = '0px';
  elem.style.width = `${customWidth}px`;
  elem.style.zIndex = '-99999';
  elem.style.opacity = '0.01';
  elem.style.pointerEvents = 'none';
  elem.style.backgroundColor = '#ffffff';

  try {
    const canvas = await html2canvas(elem, {
      scale: 2.0, // Ultra-sharp Retina quality for crisp mobile viewing and WhatsApp sharing
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: customWidth,
      windowWidth: Math.max(1280, customWidth),
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      imageTimeout: 0,
      removeContainer: true,
      onclone: (clonedDoc) => {
        const clonedTarget = clonedDoc.getElementById(elementId);
        if (clonedTarget) {
          // 1. Isolate the target: remove all other elements from clonedDoc.body
          clonedDoc.body.innerHTML = '';

          // 2. Set explicit document and body dimensions to prevent mobile viewport squeezing
          clonedDoc.documentElement.style.width = `${customWidth}px`;
          clonedDoc.documentElement.style.minWidth = `${customWidth}px`;
          clonedDoc.documentElement.style.margin = '0';
          clonedDoc.documentElement.style.padding = '0';
          clonedDoc.documentElement.style.background = '#ffffff';
          clonedDoc.documentElement.style.overflow = 'visible';

          clonedDoc.body.style.width = `${customWidth}px`;
          clonedDoc.body.style.minWidth = `${customWidth}px`;
          clonedDoc.body.style.margin = '0';
          clonedDoc.body.style.padding = '0';
          clonedDoc.body.style.background = '#ffffff';
          clonedDoc.body.style.overflow = 'visible';

          // 3. Create a clean outer wrapper for the report
          const wrapper = clonedDoc.createElement('div');
          wrapper.id = 'report-clean-export-wrapper';
          wrapper.style.width = `${customWidth}px`;
          wrapper.style.minWidth = `${customWidth}px`;
          wrapper.style.maxWidth = `${customWidth}px`;
          wrapper.style.boxSizing = 'border-box';
          wrapper.style.margin = '0 auto';
          wrapper.style.padding = '0';
          wrapper.style.background = '#ffffff';
          wrapper.style.direction = 'rtl';
          wrapper.style.fontFamily = 'Cairo, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Arabic", sans-serif';

          // 4. Style clonedTarget
          clonedTarget.classList.remove('hidden');
          clonedTarget.style.display = 'block';
          clonedTarget.style.visibility = 'visible';
          clonedTarget.style.position = 'relative';
          clonedTarget.style.left = '0';
          clonedTarget.style.top = '0';
          clonedTarget.style.width = '100%';
          clonedTarget.style.minWidth = '100%';
          clonedTarget.style.maxWidth = '100%';
          clonedTarget.style.boxSizing = 'border-box';
          clonedTarget.style.backgroundColor = '#ffffff';
          clonedTarget.style.opacity = '1';

          wrapper.appendChild(clonedTarget);
          clonedDoc.body.appendChild(wrapper);

          // 5. Remove external stylesheet link tags and prune non-font <style> blocks from clonedDoc.head
          // This prevents html2canvas from making slow network requests or parsing thousands of CSS classes.
          const linkTags = Array.from(clonedDoc.head.querySelectorAll('link'));
          linkTags.forEach((link) => {
            const href = link.getAttribute('href') || '';
            if (!href.includes('fonts.googleapis.com') && !href.includes('fonts.gstatic.com')) {
              link.remove();
            }
          });

          const styleTags = Array.from(clonedDoc.head.querySelectorAll('style'));
          styleTags.forEach((styleTag) => {
            const cssContent = styleTag.textContent || '';
            const fontRules = cssContent.match(/@font-face\s*\{[^}]+\}/gi);
            if (fontRules && fontRules.length > 0) {
              // Preserve font rules
            }
            if (/(oklch|oklab|lab|lch|hwb|color)\(/i.test(cssContent)) {
              styleTag.textContent = sanitizeStyleText(cssContent);
            }
          });

          // 6. Fix for Arabic typography in html2canvas (letter-spacing breaks Arabic ligatures) and sanitize color functions
          const targetNodes = [clonedTarget, ...Array.from(clonedTarget.querySelectorAll('*'))] as HTMLElement[];
          targetNodes.forEach((node) => {
            node.style.letterSpacing = 'normal';
            (node.style as any).fontFeatureSettings = '"liga" 1, "calt" 1';
            node.style.textRendering = 'geometricPrecision';

            const styleAttr = node.getAttribute('style');
            if (styleAttr && /(oklch|oklab|lab|lch|hwb|color)\(/i.test(styleAttr)) {
              node.setAttribute('style', sanitizeStyleText(styleAttr));
            }
          });

          // 7. Sanitize computed color properties ONLY for target nodes that need it
          const origElem = document.getElementById(elementId);
          if (origElem) {
            const origNodes = [origElem, ...Array.from(origElem.querySelectorAll('*'))] as HTMLElement[];
            const colorProps = [
              'color',
              'backgroundColor',
              'borderColor',
              'borderTopColor',
              'borderRightColor',
              'borderBottomColor',
              'borderLeftColor',
            ];

            const nodeCount = Math.min(origNodes.length, targetNodes.length);
            for (let i = 0; i < nodeCount; i++) {
              const origNode = origNodes[i];
              const clonedNode = targetNodes[i];
              if (!origNode || !clonedNode) continue;

              const styleAttr = origNode.getAttribute('style') || '';
              // Only query computed style if inline style or node may have modern color function
              if (styleAttr.includes('var(') || styleAttr.includes('oklch') || styleAttr.includes('oklab') || !styleAttr) {
                try {
                  const computed = window.getComputedStyle(origNode);
                  for (let p = 0; p < colorProps.length; p++) {
                    const prop = colorProps[p];
                    const val = (computed as any)[prop];
                    if (val && typeof val === 'string' && /(oklch|oklab|lab|lch|hwb|color)\(/i.test(val)) {
                      (clonedNode.style as any)[prop] = parseCssColorToRgb(val);
                    }
                  }
                } catch (e) {
                  // Ignore node style lookup errors
                }
              }
            }
          }
        }
      },
    });

    const dataUrl = canvas.toDataURL('image/png', 1.0);
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => {
        resolve(b || new Blob([], { type: 'image/png' }));
      }, 'image/png', 1.0);
    });

    const safeFileName = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
    const file = new File([blob], safeFileName, { type: 'image/png' });

    const download = () => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = safeFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    return {
      dataUrl,
      blob,
      file,
      download,
    };
  } finally {
    // Always restore original element styles
    if (hadHiddenClass) {
      elem.classList.add('hidden');
    }
    elem.style.display = prevDisplay;
    elem.style.position = prevPosition;
    elem.style.left = prevLeft;
    elem.style.top = prevTop;
    elem.style.width = prevWidth;
    elem.style.zIndex = prevZIndex;
    elem.style.opacity = prevOpacity;
    elem.style.pointerEvents = prevPointerEvents;
    elem.style.backgroundColor = prevBg;
  }
}

/**
 * Ultra-fast client-side image generator for printable areas that directly downloads the file.
 */
export async function generateElementImage(elementId: string, fileName: string, customWidth: number = 920): Promise<void> {
  const result = await generateElementImageBlob(elementId, fileName, customWidth);
  result.download();
}
