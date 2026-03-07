'use client';

/**
 * Iframe-based preview frame for the landing-page editor.
 *
 * Why an iframe — Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) react to
 * the **viewport width** (CSS media queries), not container width. Putting a
 * 380px-wide frame around a renderer on a 1920px desktop window doesn't
 * actually trigger mobile breakpoints inside, so the "mobile preview" looks
 * like desktop. An iframe gets its own window/viewport, so media queries
 * resolve to its real width.
 *
 * Implementation: we mount the iframe, copy the parent document's stylesheets
 * into its <head>, then use React.createPortal to render children into the
 * iframe's <body>. Height auto-resizes to content.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  device: 'desktop' | 'mobile';
  children: ReactNode;
  className?: string;
}

const MOBILE_WIDTH = 390; // iPhone 14 logical width

export function DevicePreviewFrame({ device, children, className }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState<number>(800);

  // Wait for the iframe to load, copy parent styles, mount target body.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    function setup() {
      if (cancelled) return;
      const doc = iframe!.contentDocument;
      if (!doc) return;

      // Reset the iframe document to a minimal HTML scaffold.
      doc.open();
      doc.write(
        '<!doctype html><html><head>' +
        '<meta charset="utf-8" />' +
        '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
        '</head><body class="bg-background text-foreground"></body></html>'
      );
      doc.close();

      // Copy every <link rel="stylesheet"> and <style> tag from the parent
      // <head> so Tailwind + theme variables apply inside the iframe.
      const parentHead = document.head;
      parentHead
        .querySelectorAll('link[rel="stylesheet"], style')
        .forEach((node) => {
          doc.head.appendChild(node.cloneNode(true));
        });

      // Inject the body class from the parent (carries the font-family).
      const cls = document.body.className;
      if (cls) doc.body.className = cls + ' bg-background text-foreground';

      // Auto-resize the iframe height to the body content.
      const updateHeight = () => {
        const h = doc.body.scrollHeight || 800;
        setHeight(h);
      };
      resizeObserver = new ResizeObserver(updateHeight);
      resizeObserver.observe(doc.body);
      updateHeight();

      setBody(doc.body);
    }

    // If the iframe is already loaded, set up immediately. Otherwise wait.
    if (iframe.contentDocument?.readyState === 'complete') {
      setup();
    } else {
      iframe.addEventListener('load', setup);
    }

    return () => {
      cancelled = true;
      if (resizeObserver) resizeObserver.disconnect();
      iframe.removeEventListener('load', setup);
    };
  }, []);

  return (
    <>
      <iframe
        ref={iframeRef}
        title="Aperçu"
        className={className}
        style={{
          width: device === 'mobile' ? `${MOBILE_WIDTH}px` : '100%',
          height: `${Math.max(height, 600)}px`,
          background: 'transparent',
          border: '0',
          display: 'block',
        }}
      />
      {body && createPortal(children, body)}
    </>
  );
}
