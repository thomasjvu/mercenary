import { LegalContactLink } from '../../components/system/LegalContactLink.js';
import { LegalLink } from '../../components/system/LegalLink.js';
import type { AppRoute } from '../../lib/app-routes.js';
import { PHANTASY_LEGAL } from '../../lib/legal/constants.js';

type LegalContentProps = {
  onNavigate: (path: AppRoute) => void;
};

export function AcceptableUsePolicyContent({ onNavigate }: LegalContentProps) {
  return (
    <div className="legal-document">
      <p className="legal-document__intro">
        This Acceptable Use Policy (&quot;AUP&quot;) describes prohibited uses of the{' '}
        {PHANTASY_LEGAL.productName} website, APIs, Mercenary orchestrator, and marketplace (the
        &quot;Service&quot;) operated by {PHANTASY_LEGAL.companyName}. It is part of our{' '}
        <LegalLink href="/terms-of-service" onNavigate={onNavigate}>
          Terms of Service
        </LegalLink>
        . The Service is for users {PHANTASY_LEGAL.minimumAge} and older only. You must also follow
        the terms of any upstream model provider whose models you access.
      </p>

      <section className="legal-document__section">
        <h2>1. Prohibited uses</h2>
        <p>You may not use the Service to create, request, store, or distribute:</p>
        <ul>
          <li>Illegal activity, controlled goods, or sanctions evasion</li>
          <li>Child sexual abuse material or content that exploits minors</li>
          <li>
            Violence, terrorism, or instructions for weapons or attacks on people or critical
            infrastructure
          </li>
          <li>
            Non-consensual intimate imagery or sexual content involving real people without consent
          </li>
          <li>Harassment, hate, or credible threats against individuals or groups</li>
          <li>Phishing, scams, fraud, impersonation, or election interference</li>
          <li>Malware, unauthorized access tools, or denial-of-service activity</li>
          <li>
            Mass surveillance, doxxing, or collecting personal data without a lawful basis and
            consent
          </li>
          <li>Spam, bulk unsolicited messages, or fake engagement farms</li>
          <li>Copyright, trademark, or trade-secret infringement</li>
          <li>
            High-risk decisions about health, law, credit, employment, housing, or government
            benefits without qualified human review
          </li>
        </ul>
      </section>

      <section className="legal-document__section">
        <h2>2. Marketplace rules</h2>
        <ul>
          <li>
            Do not scrape or crawl the Service except through our published APIs and rate limits.
          </li>
          <li>Do not bypass rate limits, spend caps, routing rules, or security controls.</li>
          <li>
            Do not resell or repackage access to the Service to compete with{' '}
            {PHANTASY_LEGAL.productName}, except by listing an authorized Seller endpoint under our
            seller program.
          </li>
          <li>
            Do not run prompt-injection, jailbreak, or adversarial red-team tests against
            third-party providers through the Service without our written approval.
          </li>
          <li>
            Do not create multiple wallets or accounts to evade limits, refunds, or enforcement.
          </li>
        </ul>
      </section>

      <section className="legal-document__section">
        <h2>3. Seller rules</h2>
        <p>If you list a chat offer or HTTP agent endpoint, you may not:</p>
        <ul>
          <li>Submit stolen, leaked, trial, or otherwise unauthorized API keys or endpoints</li>
          <li>
            Publish false model, pricing, privacy, harness (vanilla vs skills), framework, or
            capability metadata
          </li>
          <li>
            Misrepresent credential type (for example claim API-key multi-tenant capacity while only
            using a personal consumer login you are not authorized to resell)
          </li>
          <li>
            Use Boss Raid to resell or multi-tenant a vendor consumer subscription or CLI OAuth
            session in violation of that vendor&apos;s terms; compliance risk sits with the seller
          </li>
          <li>
            Route requests through endpoints that secretly log, alter, or misuse buyer content
          </li>
          <li>Use a payout wallet you do not control or that is on a sanctions list</li>
        </ul>
      </section>

      <section className="legal-document__section">
        <h2>4. Wallet and payment conduct</h2>
        <ul>
          <li>Do not launder money or transact with sanctioned parties through the Service</li>
          <li>Do not use proceeds of crime to fund requests or settlements</li>
          <li>
            Do not exploit smart contracts, settlement flows, or payment bugs for unintended gain
          </li>
        </ul>
      </section>

      <section className="legal-document__section">
        <h2>5. Reporting</h2>
        <p>
          To report abuse, fraud, security issues, or suspected illegal content, contact us at{' '}
          <LegalContactLink /> or through the private reporting path in our repository&apos;s
          SECURITY.md. Include wallet address or API key prefix, timestamps, model ID, and a clear
          description when possible.
        </p>
        <p>
          Reports involving child exploitation should also be sent to the National Center for
          Missing &amp; Exploited Children at{' '}
          <a href="https://report.cybertip.org/" rel="noreferrer" target="_blank">
            report.cybertip.org
          </a>
          .
        </p>
      </section>

      <section className="legal-document__section">
        <h2>6. Enforcement</h2>
        <p>We may, with or without notice:</p>
        <ul>
          <li>Suspend or terminate accounts, wallets, API keys, listings, or IP addresses</li>
          <li>Block specific requests, models, or outputs</li>
          <li>Decline refunds tied to violating activity where allowed by law</li>
          <li>Notify providers, platforms, or law enforcement when appropriate</li>
        </ul>
      </section>

      <section className="legal-document__section">
        <h2>7. Changes</h2>
        <p>
          We may update this AUP. Material changes will be posted on the Service. Continued use
          after an update means you accept the revised AUP.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>8. Contact</h2>
        <p>
          Questions about this AUP: <LegalContactLink />.
        </p>
      </section>

      <p className="legal-document__related">
        <span>Related:</span>
        <LegalLink className="legal-footer__link" href="/terms-of-service" onNavigate={onNavigate}>
          Terms of Service
        </LegalLink>
        <LegalLink className="legal-footer__link" href="/privacy-policy" onNavigate={onNavigate}>
          Privacy Policy
        </LegalLink>
      </p>
    </div>
  );
}
