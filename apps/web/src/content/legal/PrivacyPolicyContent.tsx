import { LegalContactLink } from '../../components/system/LegalContactLink.js';
import { LegalLink } from '../../components/system/LegalLink.js';
import type { AppRoute } from '../../lib/app-routes.js';
import { PHANTASY_LEGAL } from '../../lib/legal/constants.js';

type LegalContentProps = {
  onNavigate: (path: AppRoute) => void;
};

export function PrivacyPolicyContent({ onNavigate }: LegalContentProps) {
  return (
    <div className="legal-document">
      <p className="legal-document__intro">
        {PHANTASY_LEGAL.companyName} respects your privacy. This Privacy Policy explains what we
        collect, how we use it, and the choices you have when you use our website, APIs, Mercenary
        orchestrator, and marketplace (the &quot;Service&quot;). Capitalized terms not defined here
        have the meaning in our{' '}
        <LegalLink href="/terms-of-service" onNavigate={onNavigate}>
          Terms of Service
        </LegalLink>
        .
      </p>

      <section className="legal-document__section">
        <h2>1. Information we collect</h2>
        <p>
          <strong>Information you provide.</strong> This includes your wallet address, optional
          email or profile details you choose to add, support messages, buyer API key metadata,
          seller endpoint details, pricing, payout wallet, and encrypted seller credentials needed
          to route work.
        </p>
        <p>
          <strong>Payment information.</strong> If you buy prepaid balance or pay through a card or
          on-ramp partner, that partner processes your payment instrument. We receive transaction
          references, amounts, and status — not full card numbers.
        </p>
        <p>
          <strong>Automatic data.</strong> We log request metadata such as model ID, timestamps,
          token counts, routing decisions, settlement amounts, status codes, wallet addresses, and
          API key prefixes. We also collect standard server logs (IP address, browser type, pages
          visited) for security and operations.
        </p>
        <p>
          <strong>Prompts and outputs.</strong> We process Inputs and Outputs to route requests and
          return results. By default we retain the metadata needed for billing, receipts, and abuse
          prevention. Sellers and upstream model providers receive the content required to fulfill
          your request. Their retention and training practices are their own.
        </p>
        <p>
          <strong>On-chain data.</strong> Wallet addresses and settlement transactions on public
          blockchains are visible to anyone. We do not control that visibility.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>2. Cookies and sessions</h2>
        <p>
          We use cookies and similar technologies to keep you signed in, remember preferences, and
          protect the Service. You can block cookies in your browser, but signed-in features may
          stop working.
        </p>
        <p>
          We do not currently use third-party advertising or cross-site tracking pixels. If that
          changes, we will update this policy and provide any consent required by law.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>3. How we use information</h2>
        <ul>
          <li>Provide routing, Mercenary raids, receipts, billing, and account features</li>
          <li>Meter usage, enforce spend caps, and reconcile payments</li>
          <li>Verify sellers, check health, and operate the marketplace</li>
          <li>Detect fraud, abuse, and security incidents</li>
          <li>Send service notices and respond to support requests</li>
          <li>Improve reliability, routing, and product design using aggregated metrics</li>
          <li>Publish aggregated marketplace stats that do not identify individual users</li>
          <li>Comply with law and enforce our Terms and AUP</li>
        </ul>
        <p>
          We do not sell personal information. We do not use your prompts for advertising or
          unrelated profiling.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>4. How we share information</h2>
        <p>
          <strong>Service providers.</strong> We use vendors for hosting, authentication, payments,
          attestation, and infrastructure. They may process data only to provide those services.
        </p>
        <p>
          <strong>Sellers and model providers.</strong> When you submit a request, the selected
          Seller and its upstream provider receive the data needed to complete it. Review their
          terms before sending sensitive content.
        </p>
        <p>
          <strong>Legal and safety.</strong> We may disclose information to comply with law, respond
          to valid legal process, protect users, or investigate fraud or abuse.
        </p>
        <p>
          <strong>Business transfers.</strong> If Phantasy LLC is involved in a merger, acquisition,
          or asset sale, information may transfer as part of that deal with notice where required.
        </p>
        <p>
          <strong>With your consent.</strong> We may share information for any other purpose you
          approve.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>5. Retention</h2>
        <p>
          We keep information for as long as needed to run the Service, meet legal obligations,
          settle disputes, and prevent abuse. Account and billing records may be kept for audit and
          tax periods. Seller credentials remain while an offer is active. On-chain records cannot
          be deleted by us.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>6. Your choices</h2>
        <p>
          Depending on where you live, you may have rights to access, correct, delete, or export
          personal information, or to object to certain processing. Contact us at{' '}
          <LegalContactLink />. We may ask you to verify wallet ownership before fulfilling a
          request. Some data must be retained for legal, billing, or security reasons.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>7. Security</h2>
        <p>
          We use technical and organizational measures such as TLS in transit and encryption at rest
          for sensitive seller credentials. No method of transmission or storage is perfectly
          secure.
        </p>
        <p>
          You are responsible for protecting wallet keys, API keys, and account access. Revoke
          compromised credentials immediately and notify us.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>8. Age requirement</h2>
        <p>
          The Service is for users {PHANTASY_LEGAL.minimumAge} and older only. We do not knowingly
          collect personal information from anyone under {PHANTASY_LEGAL.minimumAge}. If you believe
          a minor provided data to us, contact us at <LegalContactLink /> so we can delete it.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>9. International users</h2>
        <p>
          Phantasy LLC is operated from the United States. If you use the Service from another
          country, your information may be processed in the U.S. and other locations where our
          providers operate.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>10. Changes</h2>
        <p>
          We may update this Privacy Policy. The date at the top shows the latest revision. Material
          changes will be posted on the Service. Continued use after an update means you accept the
          revised policy.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>11. Contact</h2>
        <p>
          Privacy questions: <LegalContactLink />.
        </p>
      </section>

      <p className="legal-document__related">
        <span>Related:</span>
        <LegalLink className="legal-footer__link" href="/terms-of-service" onNavigate={onNavigate}>
          Terms of Service
        </LegalLink>
        <LegalLink
          className="legal-footer__link"
          href="/acceptable-use-policy"
          onNavigate={onNavigate}
        >
          Acceptable Use Policy
        </LegalLink>
      </p>
    </div>
  );
}
