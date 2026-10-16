export type ShareResult = 'shared' | 'copied' | 'manual';

/** Share a link via the Web Share API, falling back to the clipboard, else ask the caller to show it for manual copy. */
export async function shareLink(url: string, title: string, nav: Navigator = navigator): Promise<ShareResult> {
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ url, title });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared'; // user cancelled the sheet: nothing to do
    }
  }
  try {
    await nav.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'manual';
  }
}
