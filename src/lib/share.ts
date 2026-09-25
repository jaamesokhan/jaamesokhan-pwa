import { showToast } from '../state/toast';
import { S } from '../strings';

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(S.copied, 'success');
  } catch {
    showToast(S.copy + ' ناموفق بود!', 'error');
  }
}

/** Web Share when available (mobile), otherwise copies to the clipboard. */
export async function shareText(text: string, title: string = S.appName): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  await copyText(text);
}

export function downloadBlob(data: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
