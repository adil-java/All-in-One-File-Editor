import {
  type ComponentType,
  createContext,
  type ReactElement,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { RENDERER_HTML } from './renderer-html';

/** Size of a page in PDF points, as displayed with its intrinsic /Rotate applied. */
export type PageInfo = { width: number; height: number; rotation: number };

export type PdfRenderer = {
  status: 'loading' | 'loaded' | 'error';
  error: string | null;
  pages: PageInfo[];
  /** Increments every time a document finishes loading. */
  generation: number;
  /** Renders a page to a JPEG data URL `width` pixels wide. */
  renderPage: (index: number, width: number, extraRotation: number) => Promise<string>;
  getCachedPage: (index: number, width: number, extraRotation: number) => string | undefined;
  /** Hidden WebView hosting pdf.js; must be mounted for rendering to work. */
  element: ReactElement;
};

type LoadResult = { source: string; pages: PageInfo[]; error: string | null };

type Message =
  | { type: 'ready' }
  | { type: 'loaded'; token: number; pages: PageInfo[] }
  | { type: 'load-error'; token: number; message: string }
  | { type: 'rendered'; requestId: number; dataUrl: string }
  | { type: 'render-error'; requestId: number; message: string };

const MAX_CACHED_PAGES = 40;

// react-native-webview's props type collapses to `never` with current RN typings,
// so expose just the props this module uses.
const RendererWebView = WebView as unknown as ComponentType<{
  ref: Ref<WebView>;
  source: { html: string };
  originWhitelist: string[];
  onMessage: (event: WebViewMessageEvent) => void;
  style: StyleProp<ViewStyle>;
  containerStyle: StyleProp<ViewStyle>;
}>;

const cacheKey = (index: number, width: number, rotation: number) =>
  `${index}:${rotation}:${width}`;

export function usePdfRenderer(
  base64: string | null,
  /** Called each time a document finishes loading successfully. */
  onLoaded?: (pages: PageInfo[]) => void,
): PdfRenderer {
  const webView = useRef<WebView>(null);
  const onLoadedRef = useRef(onLoaded);
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [generation, setGeneration] = useState(0);

  const sources = useRef(new Map<number, string>());
  const nextToken = useRef(1);
  const nextRequestId = useRef(1);
  const pending = useRef(
    new Map<number, { resolve: (uri: string) => void; reject: (error: Error) => void }>(),
  );
  const cache = useRef(new Map<string, string>());

  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  useEffect(() => {
    if (!ready || !base64) return;
    const token = nextToken.current++;
    sources.current.set(token, base64);
    webView.current?.injectJavaScript(`window.__load(${JSON.stringify(base64)}, ${token}); true;`);
  }, [ready, base64]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    const message = JSON.parse(event.nativeEvent.data) as Message;
    switch (message.type) {
      case 'ready':
        setReady(true);
        break;
      case 'loaded':
      case 'load-error': {
        const source = sources.current.get(message.token);
        sources.current.delete(message.token);
        if (source === undefined) return;
        cache.current.clear();
        setResult({
          source,
          pages: message.type === 'loaded' ? message.pages : [],
          error: message.type === 'load-error' ? message.message : null,
        });
        setGeneration((g) => g + 1);
        if (message.type === 'loaded') onLoadedRef.current?.(message.pages);
        break;
      }
      case 'rendered':
      case 'render-error': {
        const request = pending.current.get(message.requestId);
        pending.current.delete(message.requestId);
        if (message.type === 'rendered') request?.resolve(message.dataUrl);
        else request?.reject(new Error(message.message));
        break;
      }
    }
  }, []);

  const getCachedPage = useCallback(
    (index: number, width: number, extraRotation: number) =>
      cache.current.get(cacheKey(index, width, extraRotation)),
    [],
  );

  const renderPage = useCallback((index: number, width: number, extraRotation: number) => {
    const key = cacheKey(index, width, extraRotation);
    const cached = cache.current.get(key);
    if (cached) return Promise.resolve(cached);

    const requestId = nextRequestId.current++;
    return new Promise<string>((resolve, reject) => {
      pending.current.set(requestId, {
        resolve: (uri) => {
          cache.current.set(key, uri);
          if (cache.current.size > MAX_CACHED_PAGES) {
            cache.current.delete(cache.current.keys().next().value!);
          }
          resolve(uri);
        },
        reject,
      });
      webView.current?.injectJavaScript(
        `window.__render(${requestId}, ${index}, ${width}, ${extraRotation}); true;`,
      );
    });
  }, []);

  const element = useMemo(
    () => (
      <RendererWebView
        ref={webView}
        source={{ html: RENDERER_HTML }}
        originWhitelist={['*']}
        onMessage={onMessage}
        style={styles.hidden}
        containerStyle={styles.hidden}
      />
    ),
    [onMessage],
  );

  const current = result && result.source === base64 ? result : null;

  return {
    status: current ? (current.error ? 'error' : 'loaded') : 'loading',
    error: current?.error ?? null,
    pages: current?.pages ?? result?.pages ?? [],
    generation,
    renderPage,
    getCachedPage,
    element,
  };
}

const PdfRendererContext = createContext<PdfRenderer | null>(null);

export const PdfRendererProvider = PdfRendererContext.Provider;

export function usePdfRendererContext() {
  const renderer = useContext(PdfRendererContext);
  if (!renderer) throw new Error('usePdfRendererContext must be used inside PdfRendererProvider');
  return renderer;
}

/**
 * Returns a rendered image for a page, requesting it from the renderer as needed.
 * Keeps showing the previous image while a newer document generation re-renders.
 */
export function usePageImage(index: number, width: number, extraRotation: number) {
  const renderer = usePdfRendererContext();
  const { status, generation, renderPage, getCachedPage } = renderer;
  const key = cacheKey(index, width, extraRotation);
  const [image, setImage] = useState<{ key: string; uri: string } | null>(null);

  useEffect(() => {
    if (status !== 'loaded' || width <= 0) return;
    let cancelled = false;
    renderPage(index, width, extraRotation)
      .then((uri) => {
        if (!cancelled) setImage({ key, uri });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, generation, renderPage, index, width, extraRotation, key]);

  const cached = getCachedPage(index, width, extraRotation);
  return cached ?? (image?.key === key ? image.uri : null);
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
