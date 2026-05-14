/**
 * Injects the merchant's marketing pixels into the public storefront.
 *
 * Supported:
 *   - Facebook / Meta Pixel  (fbq)
 *   - Google Analytics 4     (gtag)
 *   - TikTok Pixel           (ttq)
 *   - Snapchat Pixel         (snaptr)
 *   - Custom HTML in <head>  (use with caution — owner-supplied)
 *
 * Events emitted automatically:
 *   - PageView        (this component, on every page)
 *   - ViewContent     (product page wrapper component)
 *   - InitiateCheckout(checkout pages)
 *   - Purchase        (thank-you / paid order pages)
 *
 * Uses next/script with strategy="afterInteractive" so it never blocks
 * the storefront render but still loads ahead of user interactions.
 */
import Script from 'next/script';

export interface MarketingConfig {
  facebookPixelId?: string;
  googleAnalyticsId?: string;
  tiktokPixelId?: string;
  snapchatPixelId?: string;
  googleAdsConversionId?: string;
  customHeadCode?: string;
}

interface Props {
  config?: MarketingConfig;
}

export function MarketingPixels({ config }: Props) {
  if (!config) return null;
  const { facebookPixelId, googleAnalyticsId, tiktokPixelId, snapchatPixelId, googleAdsConversionId, customHeadCode } = config;

  return (
    <>
      {/* Facebook / Meta Pixel */}
      {facebookPixelId && (
        <>
          <Script id="fb-pixel" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
              n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
              document,'script','https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${facebookPixelId}');
              fbq('track', 'PageView');
            `}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              alt=""
              src={`https://www.facebook.com/tr?id=${facebookPixelId}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      )}

      {/* Google Analytics 4 */}
      {googleAnalyticsId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${googleAnalyticsId}', { send_page_view: true });
              ${googleAdsConversionId ? `gtag('config', '${googleAdsConversionId}');` : ''}
            `}
          </Script>
        </>
      )}

      {/* TikTok Pixel */}
      {tiktokPixelId && (
        <Script id="tt-pixel" strategy="afterInteractive">
          {`
            !function (w, d, t) {
              w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
              ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
              for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
              ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
              ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
              ttq.load('${tiktokPixelId}');
              ttq.page();
            }(window, document, 'ttq');
          `}
        </Script>
      )}

      {/* Snapchat Pixel */}
      {snapchatPixelId && (
        <Script id="snap-pixel" strategy="afterInteractive">
          {`
            (function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function()
            {a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};
            a.queue=[];var s='script';r=t.createElement(s);r.async=!0;
            r.src=n;var u=t.getElementsByTagName(s)[0];
            u.parentNode.insertBefore(r,u);})(window,document,
            'https://sc-static.net/scevent.min.js');
            snaptr('init', '${snapchatPixelId}');
            snaptr('track', 'PAGE_VIEW');
          `}
        </Script>
      )}

      {/* Custom head code — seller-supplied (dangerous, intentional) */}
      {customHeadCode && (
        <div
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: customHeadCode }}
          style={{ display: 'none' }}
        />
      )}
    </>
  );
}
