/**
 * Universal Print Utility for AI Studio Building Management Reports
 * 
 * Clones the printable content to a dedicated container outside the React root (#root)
 * and hides #root completely during printing.
 * 
 * This eliminates:
 * 1. Blank leading pages caused by invisible DOM elements above the printable area.
 * 2. Huge whitespace gaps at the top of Page 1.
 * 3. Truncated or empty reports when containers have CSS 'hidden'.
 * 4. Cut-off table rows across page breaks.
 */
export function printReportElement(elementId: string): void {
  const elem = document.getElementById(elementId);
  if (!elem) {
    console.warn(`Print element not found: #${elementId}`);
    return;
  }

  // 1. Get or create the dedicated global print container outside #root
  let printContainer = document.getElementById('global-print-container');
  if (!printContainer) {
    printContainer = document.createElement('div');
    printContainer.id = 'global-print-container';
    document.body.appendChild(printContainer);
  }

  // 2. Clone the inner HTML of the printable element
  printContainer.innerHTML = elem.innerHTML;
  printContainer.setAttribute('dir', 'rtl');

  // 3. Mark body as printing
  document.body.classList.add('is-printing-report');

  // 4. Trigger print
  window.focus();
  try {
    window.print();
  } catch (err) {
    console.warn('Direct print error:', err);
  }

  // 5. Cleanup on afterprint or timeout
  const cleanUp = () => {
    document.body.classList.remove('is-printing-report');
    if (printContainer) {
      printContainer.innerHTML = '';
    }
    window.removeEventListener('afterprint', cleanUp);
  };

  window.addEventListener('afterprint', cleanUp);
  // Fallback timeout in case user or browser doesn't fire afterprint
  setTimeout(cleanUp, 15000);
}
