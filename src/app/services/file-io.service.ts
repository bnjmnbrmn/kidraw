import { Injectable } from '@angular/core';

/**
 * Browser file picker + download primitives.
 *
 * Uses plain `<input type=file>` for opening and a synthetic `<a download>`
 * for saving — works on Firefox / Safari / Chromium without the File System
 * Access API. (FSA-based handles for write-back come in a later phase.)
 */
@Injectable({ providedIn: 'root' })
export class FileIoService {
  static readonly KIDRAW_ACCEPT = '.kidraw.json,.kidraw.yaml,.kidraw.yml,.json,.yaml,.yml';
  static readonly STYLE_ACCEPT = '.kd-style.json,.kd-style.yaml,.kd-style.yml,.json,.yaml,.yml';

  /**
   * Open a file picker and read the selected file as text.
   * Returns null if the user cancels.
   */
  async openTextFile(accept: string = FileIoService.KIDRAW_ACCEPT): Promise<OpenedFile | null> {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.style.display = 'none';

      let settled = false;
      const settle = (value: OpenedFile | null) => {
        if (settled) return;
        settled = true;
        if (input.parentNode) input.parentNode.removeChild(input);
        resolve(value);
      };

      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) { settle(null); return; }
        try {
          const content = await file.text();
          settle({ name: file.name, content });
        } catch {
          settle(null);
        }
      });
      // 'cancel' fires in modern browsers when the picker is dismissed without
      // selecting a file. On older ones we fall back to a focus-based timeout.
      input.addEventListener('cancel', () => settle(null));
      window.addEventListener('focus', () => {
        // Defer to next tick so the change event has a chance to fire first.
        setTimeout(() => settle(null), 200);
      }, { once: true });

      document.body.appendChild(input);
      input.click();
    });
  }

  /** Trigger a browser download with the given filename + content. */
  saveAs(filename: string, content: string, mimeType: string = inferMimeType(filename)): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Defer URL revocation so the download has time to start.
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

export interface OpenedFile {
  name: string;
  content: string;
}

function inferMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'text/yaml';
  return 'application/json';
}
