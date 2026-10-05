import { pushToast } from '../app/ui.ts';

/** Copies text, falling back to a hidden textarea when the Clipboard API is blocked. */
export async function copyText(text: string, what = 'DNA code'): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    pushToast({ kind: 'info', title: `${what} copied`, body: 'Paste it anywhere, or release it into a world from the ⋯ menu.' }, 4000);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    pushToast(
      ok
        ? { kind: 'info', title: `${what} copied`, body: 'Paste it anywhere, or release it into a world from the ⋯ menu.' }
        : { kind: 'warning', title: 'Could not copy', body: 'Your browser blocked the clipboard. Open the DNA tab and select the code by hand.' },
      5000,
    );
    return ok;
  }
}
