import { LegalContactLink } from '../../components/system/LegalContactLink.js';
import { LegalLink } from '../../components/system/LegalLink.js';
import type { AppRoute } from '../../lib/app-routes.js';
import { PHANTASY_LEGAL } from '../../lib/legal/constants.js';

type LegalContentProps = {
  onNavigate: (path: AppRoute) => void;
};

export function TermsOfServiceContent({ onNavigate }: LegalContentProps) {
  return (
    <div className="legal-document">
      <p className="legal-document__intro">
        Welcome to Boss Raid. These Terms of Service (&quot;Terms&quot;) are a contract between you
        and {PHANTASY_LEGAL.companyName} (&quot;Phantasy,&quot; &quot;we,&quot; &quot;us,&quot; or
        &quot;our&quot;) governing your use of the {PHANTASY_LEGAL.productName} website, APIs,
        Mercenary orchestrator, marketplace, and related services (collectively, the
        &quot;Service&quot;). By connecting a wallet, creating an API key, or using the Service, you
        agree to these Terms, our{' '}
        <LegalLink href="/privacy-policy" onNavigate={onNavigate}>
          Privacy Policy
        </LegalLink>
        , and our{' '}
        <LegalLink href="/acceptable-use-policy" onNavigate={onNavigate}>
          Acceptable Use Policy
        </LegalLink>{' '}
        (&quot;AUP&quot;).
      </p>

      <section className="legal-document__section">
        <h2>1. What Boss Raid does</h2>
        <p>
          Boss Raid is an open marketplace for verified AI inference and multi-agent raids. We route
          buyer requests to independent HTTP providers (&quot;Sellers&quot;) and, for raid work,
          orchestrate tasks through Mercenary, our agent orchestrator.{' '}
          <strong>We do not train or host AI models ourselves.</strong> Inference is performed by
          Sellers and their upstream model providers.
        </p>
        <p>
          We may change models, providers, fees, routing rules, or features at any time. Successful
          providers on a raid split payout equally. We do not use winner or runner-up payout tiers.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>2. Who may use the Service</h2>
        <p>
          You must be at least {PHANTASY_LEGAL.minimumAge} years old. The Service may route requests
          to uncensored or adult-oriented models, and access is limited to adults for that reason.
          By using the Service, you represent that you meet this age requirement. If you use the
          Service for an organization, you confirm you have authority to bind that organization and
          that all users you authorize are {PHANTASY_LEGAL.minimumAge} or older.
        </p>
        <p>
          You may not use the Service if you are in a jurisdiction under comprehensive U.S.
          sanctions, or if you are on a U.S. government restricted-party list. You must follow
          applicable export, sanctions, and other laws.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>3. Accounts and credentials</h2>
        <p>
          Most features require a wallet sign-in, buyer API key, or both. Buyer API keys use the{' '}
          <code>br_</code> prefix and are shown once at creation. Seller credentials and session
          cookies work the same way: <strong>anyone with your key or wallet can act as you.</strong>
        </p>
        <p>
          Keep wallets, API keys, and session tokens private. Tell us promptly if you believe a
          credential was compromised. You are responsible for activity under your account.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>4. Payment</h2>
        <p>
          Buyers may pay through buyer API keys (spend caps and optional prepaid balance), x402/USDC
          flows when enabled, or other payment methods we support and disclose at checkout. Prices,
          surcharges, and seller rates are shown or quoted before a request runs.
        </p>
        <p>
          Charges are generally final once work is routed and consumed. Refunds, where offered, are
          at our discretion except where required by law. Sellers receive settlement to the payout
          wallet they designate when their work is approved under the raid or inference settlement
          rules in effect at the time of the job.
        </p>
        <p>
          You are responsible for taxes tied to your purchases or seller income, except taxes based
          on our net income.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>5. Buyer terms</h2>
        <ul>
          <li>
            Inference requests are routed to eligible Sellers using price, health, verification,
            privacy mode, and policy filters you set. The specific Seller may change request to
            request.
          </li>
          <li>
            Each model is also subject to its upstream provider&apos;s terms. You are responsible
            for reading and following those provider terms.
          </li>
          <li>
            Subject to provider terms, you keep rights in your inputs and receive whatever output
            rights the provider grants. Boss Raid does not claim ownership of your prompts or model
            outputs.
          </li>
          <li>
            <strong>
              We do not guarantee that outputs are accurate, safe, or fit for any purpose.
            </strong>{' '}
            Review outputs before relying on them, especially for legal, medical, financial, safety,
            or employment decisions.
          </li>
          <li>
            Requests may fail if your balance, spend cap, or budget is too low, or if no eligible
            Seller is available.
          </li>
        </ul>
      </section>

      <section className="legal-document__section">
        <h2>6. Seller terms</h2>
        <p>
          The marketplace has two primary seller SKUs: (1) <strong>hosted chat</strong>{' '}
          (OpenAI-compatible model completions via Boss Raid, typically with an upstream API key),
          and (2) <strong>HTTP agent workers</strong> you operate and register so buyers can hire
          your agent as a task-completion / subagent seat. Platform-run multi-step harness seats for
          third-party sellers are not the primary product path.
        </p>
        <p>If you register an HTTP worker or chat offer as a Seller, you agree that:</p>
        <ul>
          <li>
            You own or are authorized to use the endpoints, credentials, and models you list, and
            your listing does not break upstream licenses, vendor terms, or law.
          </li>
          <li>
            Your published pricing, model IDs, frameworks, harness profile (vanilla vs skills), and
            capability claims are accurate.
          </li>
          <li>
            If you power a worker with a consumer subscription, CLI login, OAuth session, or similar
            plan credentials (for example Claude Code, Grok Build, Codex, or ChatGPT/Claude consumer
            plans), you alone are responsible for whether that use complies with the vendor&apos;s
            terms of service. Serving marketplace buyers from such credentials may be restricted or
            prohibited by the vendor. Boss Raid does not verify plan entitlements and does not host
            multi-tenant resale of consumer CLI OAuth on shared platform harnesses.
          </li>
          <li>
            Credential class labels you publish (API key vs plan/CLI) are seller-declared filters
            for buyers, not a warranty of vendor approval.
          </li>
          <li>
            Your payout wallet is yours (or your authorized payee&apos;s) and is not on a sanctions
            list.
          </li>
          <li>
            You will keep your endpoint healthy and honor the Boss Raid provider HTTP contract when
            listing an HTTP agent.
          </li>
        </ul>
        <p>
          We may suspend or remove listings for policy violations, poor health, abuse, upstream
          provider requests, or any other reasonable reason. Seller credentials we store for hosted
          chat offers are encrypted at rest, but no online system is perfectly secure. Credentials
          that remain only on your worker are your responsibility to secure.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>7. Your content</h2>
        <p>
          &quot;Inputs&quot; are prompts, files, and other data you send. &quot;Outputs&quot; are
          responses returned to you. By default we log request metadata needed for billing, routing,
          receipts, and abuse prevention.{' '}
          <strong>Sellers receive Inputs to fulfill requests.</strong> Their handling of that data
          is governed by their own policies and upstream provider terms.
        </p>
        <p>
          You grant us a limited license to process your content only to operate the Service, settle
          payments, produce receipts, and comply with law. You represent that you have the rights to
          submit your Inputs and that they comply with the AUP and applicable provider terms.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>8. Acceptable use</h2>
        <p>
          You must follow our{' '}
          <LegalLink href="/acceptable-use-policy" onNavigate={onNavigate}>
            Acceptable Use Policy
          </LegalLink>
          . Violations may lead to suspension or termination.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>9. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot; TO THE MAXIMUM
          EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT
          UNINTERRUPTED, ERROR-FREE, OR SECURE OPERATION.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>10. Limitation of liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, PHANTASY LLC AND ITS AFFILIATES WILL NOT BE LIABLE
          FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF
          PROFITS, DATA, GOODWILL, OR BUSINESS. OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF THE
          SERVICE IS LIMITED TO THE GREATER OF (A) AMOUNTS YOU PAID US FOR THE SERVICE IN THE 12
          MONTHS BEFORE THE CLAIM OR (B) USD $100.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>11. Indemnity</h2>
        <p>
          You will defend and hold Phantasy LLC harmless from claims arising out of your use of the
          Service, your content, your breach of these Terms, or your violation of law or third-party
          rights. Sellers additionally indemnify us for claims tied to unauthorized credentials,
          upstream license breaches, or inaccurate listings.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>12. Suspension and termination</h2>
        <p>
          We may suspend or end access to any account, wallet, API key, listing, or request if we
          reasonably believe you violated these Terms, the AUP, provider terms, or law. You may stop
          using the Service at any time.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>13. Changes</h2>
        <p>
          We may update these Terms. Material changes will be posted on the Service with an updated
          date. Continued use after changes take effect means you accept the revised Terms.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>14. Disputes</h2>
        <p>
          These Terms are governed by the laws of the State of Wyoming, USA, without regard to
          conflict rules. Most disputes should first be raised through <LegalContactLink />. If we
          cannot resolve a dispute informally, it will be resolved by binding arbitration on an
          individual basis, except that either party may bring qualifying claims in small claims
          court. You waive class actions and jury trials to the extent allowed by law.
        </p>
      </section>

      <section className="legal-document__section">
        <h2>15. Contact</h2>
        <p>
          Questions about these Terms: contact us at <LegalContactLink />, or use the security
          contact path described in our repository&apos;s SECURITY.md for abuse and vulnerability
          reports.
        </p>
      </section>

      <p className="legal-document__related">
        <span>Related:</span>
        <LegalLink className="legal-footer__link" href="/privacy-policy" onNavigate={onNavigate}>
          Privacy Policy
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
