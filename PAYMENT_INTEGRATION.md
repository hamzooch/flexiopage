# Payment Integration — Flutterwave + CinetPay (+ COD)

FlexioPage routes checkout payments through two online gateways plus
Cash-on-Delivery, chosen automatically by the buyer's country and the store type.

## Business matrix

|                | Online (Card / Mobile Money) | Cash on Delivery |
|----------------|:----------------------------:|:----------------:|
| Digital store  | ✅ (only)                    | ❌               |
| Physical store | ✅                           | ✅               |

A digital store has no courier, so the buyer must pay online to receive the
download token / license. A physical store offers both; the buyer picks.

## Gateway zones (country → gateway)

| Zone | Countries (examples) | Gateway | Methods |
|------|----------------------|---------|---------|
| Francophone CFA | SN, CI, BJ, TG, BF, ML, CM, NE, GN… | **CinetPay** | Mobile Money (Wave, OM, MTN, Moov) |
| Anglophone / East-South | NG, GH, KE, ZA, UG, TZ, RW… | **Flutterwave** | Card + Mobile Money |
| Other | rest of the world | Flutterwave (card) for digital; **COD only** for physical | — |

Source of truth: `flexiopage-backend/src/services/payment/country-routing.ts`
(`getAvailableMethods(country, storeType)`). The storefront selector mirrors it.

---

## 1. Get the API keys

### CinetPay
1. Create a free merchant account at <https://cinetpay.com>.
2. Dashboard → **Intégrations / API** → copy **API key** and **Site ID**.
3. (Recommended) copy the **Secret key** → enables `x-token` HMAC verification
   of webhooks.
4. There is no separate sandbox portal — CinetPay tests use the real API with
   small amounts. Use a test Site ID if your account provides one.

Env:
```
CINETPAY_API_KEY=...
CINETPAY_SITE_ID=...
CINETPAY_SECRET_KEY=...      # optional but recommended
```

### Flutterwave
1. Create an account at <https://flutterwave.com>.
2. Dashboard → **Settings → API Keys**. Toggle to **Test mode** for sandbox.
3. Copy **Public key** (`FLWPUBK_TEST-…`) and **Secret key** (`FLWSECK_TEST-…`).
4. Dashboard → **Settings → Webhooks**:
   - URL: `https://<your-api-domain>/api/webhooks/flutterwave`
   - Set a **Secret hash** → put the same value in `FLW_SECRET_HASH`.

Env:
```
FLW_PUBLIC_KEY=FLWPUBK_TEST-...
FLW_SECRET_KEY=FLWSECK_TEST-...
FLW_SECRET_HASH=your-webhook-secret-hash
API_PUBLIC_URL=https://<your-api-domain>     # used to build CinetPay notify_url
```

> **Secrets stay server-side only.** None of `*_SECRET_*` / `*_API_KEY` are ever
> sent to the frontend. The browser only ever receives the hosted `paymentUrl`.

---

## 2. Sandbox test cards / numbers

**Flutterwave (test mode)** — successful card:
```
Card:  5531 8866 5214 2950   CVV 564   Exp 09/32   PIN 3310   OTP 12345
```
Test mobile money: use the test MSISDN shown on the FLW checkout page.

**CinetPay** — use the operator's test number in your CinetPay test environment,
or a small real amount in production mode.

**No keys set?** The backend automatically runs in **MOCK mode**: checkout
redirects to `/thanks/<orderId>?simulate=1` and you can finalize the order
without any real gateway — perfect for local development.

---

## 3. API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/payment/methods?storeSlug=&country=` | Methods to render in the selector |
| `POST` | `/api/payment/initiate` | Create order + return `{ paymentUrl, transactionRef }` |
| `GET`  | `/api/payment/verify/:ref` | Authoritative server-side status re-check |
| `POST` | `/api/webhooks/cinetpay` | CinetPay IPN |
| `POST` | `/api/webhooks/flutterwave` | Flutterwave webhook |
| `POST` | `/api/public/checkout/cod` | COD (physical stores only) |

`/api/payment/initiate` body:
```jsonc
{
  "storeSlug": "ma-boutique",
  "productSlug": "mon-produit",
  "quantity": 1,
  "email": "buyer@example.com",
  "customerName": "Awa Diop",
  "phone": "+221770000000",
  "country": "SN",
  "gateway": "cinetpay",        // 'cinetpay' | 'flutterwave'
  "method": "mobile_money",     // 'mobile_money' | 'card'
  "shippingAddress": { "line1": "...", "city": "Dakar", "country": "SN" } // physical only
}
```
> The server **ignores any client-sent amount** and recomputes the total from
> the product price × quantity. It also rejects `(gateway, method)` combos that
> aren't allowed for the buyer's country/store type.

---

## 4. Security model

- **Signature verification before any DB write.** CinetPay `x-token` HMAC and
  Flutterwave `verif-hash` are checked; a payload that fails is logged and
  rejected with `401`.
- **Server-to-server re-verification.** Even with a valid signature, the order
  is only marked `paid` after an independent gateway re-check
  (CinetPay `/payment/check`, Flutterwave `verify_by_reference`). A forged or
  replayed webhook can never fake a payment.
- **Idempotence.** `finalizePaidOrder` is a no-op once an order is `paid`, so a
  webhook delivered twice never double-credits or duplicates the order.
- **Audit.** Every event (initiate / webhook / verify) is written to the
  `PaymentLog` collection with the raw provider payload.
- **Never trust the client redirect.** The `/thanks` page re-checks status via
  `/api/payment/verify/:ref`; success is shown only after the server confirms.

---

## 5. Run the end-to-end test

```bash
cd flexiopage-backend
npm run seed:test-store     # once, creates "boutique-test"
npm run test:payment-flow
```

In MOCK mode it validates the routing matrix, order creation, init, the
finalize **idempotence**, and the audit log. With real TEST keys set it prints
a live sandbox checkout URL to open in the browser.
