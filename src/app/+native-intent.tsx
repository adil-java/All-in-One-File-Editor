/**
 * Routes files opened with this app from other apps ("Open with" from WhatsApp,
 * Files, Gmail, ...) to the import screen. The system passes them as file:// or
 * content:// URLs; everything else is a normal deep link.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (/^(file|content):\/\//i.test(path)) {
      return `/open?uri=${encodeURIComponent(path)}`;
    }
    return path;
  } catch {
    // Never crash here; fall back to the home screen.
    return '/';
  }
}
