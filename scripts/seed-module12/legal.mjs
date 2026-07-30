/**
 * The seven legal documents of build/Doc10, plus About, as CMS rows.
 *
 * The text is Doc10's verbatim, with its `[SQUARE BRACKET]` placeholders turned
 * into `{{token}}` substitutions resolved from public.legal_settings at render
 * time — so filling in the entity name and grievance officer before launch is an
 * UPDATE on one row, not an edit to eight documents.
 *
 * Markup is the small subset lib/legal/markdown.ts renders:
 *   ## heading · paragraph · - bullet · 1. ordered · **bold** · [text](/href)
 *   > info: … / > warn: …   → the design's .co callouts
 */

export const LEGAL_PAGES = [
  {
    slug: "terms",
    title: "Terms of Service",
    icon: "file",
    sort_order: 1,
    version: "1.0",
    effective_date: "2026-01-01",
    seo_title: "Terms of Service — HomzList",
    seo_description:
      "The terms that govern your use of HomzList: intermediary status under Section 79 of the IT Act, plans and payments, your content, liability and Rajkot jurisdiction.",
    body_md: `## 1. Who we are
HomzList ("HomzList", "Platform", "we", "us", "our") is owned and operated by **{{entity_name}}**, a **{{entity_type}}** registered in India, having its registered office at **{{registered_address}}** (**{{reg_no}}**). HomzList operates the website and progressive web app at **homzlist.com** and its subdomains.

## 2. Acceptance of these Terms
By accessing or using HomzList, creating an account, or posting any content, you agree to these Terms of Service, our [Privacy Policy](/legal/privacy), [Refund & Cancellation Policy](/legal/refund), [Community Guidelines](/legal/community), and [Cookie Policy](/legal/cookie) (together, the "Terms"). If you do not agree, do not use the Platform. You must be **18 years or older** and legally competent to contract under the Indian Contract Act, 1872.

## 3. What HomzList is — and is NOT
**3.1 We are an intermediary.** HomzList is a **neutral listing and discovery platform** that lets property owners, brokers, and builders ("Posters") publish property listings, requirements, and projects, and lets users browse and connect with them. HomzList is an "intermediary" under **Section 2(1)(w) of the Information Technology Act, 2000** and claims safe-harbour protection under **Section 79** of that Act.

**3.2 We are NOT a party to any transaction.** HomzList:
- is **not** a real-estate agent, broker, dealer, builder, or advisor;
- does **not** own, sell, rent, lease, inspect, verify, value, or guarantee any property;
- does **not** participate in negotiations, bookings, token payments, agreements, or transactions between users;
- does **not** guarantee the accuracy, legality, title, quality, or availability of any listing;
- does **not** verify ownership of any property (any "verified" badge refers **only** to identity/phone/RERA verification of a person, **never** to verification of a property, its title, or its legality).

**3.3 All dealings are directly between users.** Any inquiry, visit, negotiation, booking, payment, agreement, or dispute is **solely between the users concerned**, at their own risk and discretion. You are responsible for conducting your own due diligence (title checks, legal verification, physical inspection, price assessment, and professional/legal advice) before any transaction.

> warn: Never pay a token or advance without independent verification and proper documentation. HomzList is not a party to your transaction and cannot recover money paid off-platform.

## 4. Accounts, roles & verification
**4.1** Registration is via mobile number and OTP. You must provide accurate information and keep it updated. You are responsible for all activity under your account and for keeping your device/number secure.

**4.2 Roles:** Owner, Broker, Builder. You must select the role that truthfully applies to you and use the Platform accordingly.

**4.3 Verification badges** (phone/ID/RERA) indicate that we performed a limited identity check on the **person**. They do **not** certify any property, its documents, its title, or the truthfulness of any listing. Do not rely on a badge as proof of a property's legality.

**4.4** We may refuse, suspend, or terminate accounts that violate these Terms, the Community Guidelines, or applicable law.

## 5. Plans, payments & content quota
**5.1** Certain features (posting listings, viewing/using requirements, proposals, boosts) require a **paid plan** or credits, purchased in advance ("payment-first"). Current plans, prices, inclusions, validity, and quotas are shown on the Plans page and may change from time to time (existing purchases are honoured on their original terms — "grandfathering").

**5.2** Payments are processed by our third-party payment gateway (**Razorpay**). We do not store your card details.

**5.3** Quotas (listings, requirements, proposals) are consumed as described on the Plans page and in-app. Some actions consume quota even if later toggled off or deleted, as clearly indicated in-app.

**5.4** Refunds are governed by the [Refund & Cancellation Policy](/legal/refund). In general, fees are **non-refundable** except where a technical failure on our side prevented the service from being delivered.

## 6. Your content & responsibilities
**6.1** You retain ownership of content you post (photos, text, listings). By posting, you grant HomzList a **non-exclusive, royalty-free, worldwide licence** to host, store, reproduce, resize, watermark, display, and distribute that content **for the purpose of operating, promoting, and improving the Platform** (including in search results, feeds, stories, area pages, and shareable links).

**6.2 You represent and warrant** that: you own or are authorised to post the content; you have the right to list the property (as owner, or as an authorised broker/builder); the content is accurate, lawful, and not misleading; you have consent to share any photos; and the listing does not infringe anyone's rights.

**6.3 You must NOT** post: false, fake, duplicate, or misleading listings; properties you are not authorised to list; contact numbers/links inside photos or text to bypass the Platform's contact system; unlawful, fraudulent, discriminatory, obscene, defamatory, or infringing content; or content that violates the Community Guidelines or **Rule 3(1)(b) of the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021**.

**6.4** You are solely responsible for your content and dealings. HomzList may (but is not obliged to) review, moderate, request changes to, hide, or remove content, and may suspend accounts, at its discretion.

## 7. Contact-sharing & privacy of numbers
HomzList operates a **controlled contact system**: your phone number is not publicly displayed by default. Sharing of numbers happens only through the in-app flow you choose (e.g., when a Poster allows it). You agree not to attempt to circumvent this system. Once you share your number or contact another user, HomzList is not responsible for how the other party uses it.

## 8. Prohibited conduct
You must not: use the Platform unlawfully; scrape, crawl, or harvest data; reverse-engineer or disrupt the Platform; attempt unauthorised access, bypass security, or exploit vulnerabilities; use bots or automated posting; spam, harass, or defraud other users; post malware; or infringe intellectual property. Violations may lead to suspension, termination, and legal action.

## 9. Intermediary status, moderation & takedown
**9.1** Consistent with Section 79 and the 2021 Rules, HomzList acts as an intermediary and does not initiate, select the receiver of, or modify the information in user listings (beyond format/technical processing and lawful moderation).

**9.2** Upon **actual knowledge** (via a court order or government notification, or a valid grievance) that specific content is unlawful, HomzList will act expeditiously to remove or disable access to that content as required by law.

**9.3** HomzList publishes these Terms, Privacy Policy, and a Grievance mechanism as required by the 2021 Rules, and will not knowingly host content prohibited by Rule 3(1)(b).

## 10. Intellectual property
The HomzList name, logo, design, software, and compilation of listings are owned by **{{entity_name}}** and protected by law. You may not use them without written permission. User content remains the user's, subject to the licence in Section 6.

## 11. Third-party services & links
The Platform integrates third-party services (payment gateway, messaging/notification, storage, maps/links where applicable). Their use is governed by their own terms. HomzList is not responsible for third-party services or any external websites linked by users.

## 12. Disclaimers
The Platform and all listings are provided **"as is" and "as available"**, without warranties of any kind. See the full [Disclaimer](/legal/disclaimer), which forms part of these Terms.

## 13. Limitation of liability
To the maximum extent permitted by law, HomzList and its owners, directors, employees, and partners shall **not be liable** for any indirect, incidental, special, consequential, or punitive damages, or for any loss arising from: your use of (or inability to use) the Platform; any listing's accuracy, legality, or availability; any transaction, dealing, payment, token, fraud, or dispute between users; property defects or title issues; or reliance on any content. **HomzList's total aggregate liability, if any, for any claim shall not exceed the total fees you paid to HomzList in the {{liability_months}} months preceding the claim.**

## 14. Indemnity
You agree to indemnify and hold harmless HomzList and its owners/employees from any claim, loss, liability, or expense (including legal fees) arising from your content, your use of the Platform, your dealings with other users, or your breach of these Terms or law.

## 15. Suspension & termination
We may suspend or terminate your access at any time for violation of these Terms, suspected fraud, legal requirement, or risk to the Platform or users. You may stop using the Platform and delete your account at any time (subject to the Refund Policy and legal retention obligations).

## 16. Changes to these Terms
We may update these Terms. Material changes will be notified (in-app/email) and, where appropriate, will require your re-acceptance. Continued use after changes means you accept them. Each version is dated and archived.

## 17. Governing law & jurisdiction
These Terms are governed by the laws of India. Subject to Section 18 (Grievance), the courts at **{{jurisdiction_city}}, {{jurisdiction_state}}** shall have **exclusive jurisdiction** over any dispute.

## 18. Grievance redressal
For complaints about content or your experience, contact our [Grievance Officer](/legal/grievance). We follow the timelines prescribed under the 2021 Rules (acknowledgement within {{ack_hours}} hours; resolution within {{resolution_days}} days).

## 19. Contact
**{{entity_name}}**, {{registered_address}}. Support: **{{support_email}}**.

> info: The interface may be translated, but the legally binding version of this document is English.`,
  },

  {
    slug: "privacy",
    title: "Privacy Policy",
    icon: "shield",
    sort_order: 2,
    version: "1.0",
    effective_date: "2026-01-01",
    seo_title: "Privacy Policy — HomzList",
    seo_description:
      "How HomzList collects, uses, shares and protects your personal data, in line with the IT Act 2000, the SPDI Rules 2011 and the DPDP Act 2023.",
    body_md: `This Privacy Policy explains how **{{entity_name}}** ("we") collects, uses, shares, and protects your personal data when you use HomzList, in line with the **Information Technology Act, 2000**, the **SPDI Rules, 2011**, and the **Digital Personal Data Protection Act, 2023 (DPDP)**.

## 1. Data we collect
**1.1 You provide:** mobile number; name; role (owner/broker/builder); city; profile photo (optional); bio (optional); listing/requirement/project details and photos; verification documents (ID/RERA) if you submit them; messages you send; support tickets; payment-related info (processed by the gateway).

**1.2 Collected automatically:** device/browser type, IP address, approximate location (city-level), app usage/analytics, cookies and similar technologies (see [Cookie Policy](/legal/cookie)), log data.

**1.3 From third parties:** payment status from the payment gateway; verification results.

We collect only what is needed to provide the service (**data minimisation**).

## 2. How we use your data
- To create and manage your account and role.
- To publish and operate your listings/requirements/projects.
- To power search, feed, stories, matching, and area pages.
- To enable the controlled contact/chat system (including number-sharing that you authorise).
- To process payments, plans, invoices, and quotas.
- To send transactional notifications (approvals, inquiries, payments, expiries) and, if you opt in, marketing.
- To verify identity (where you request a badge), prevent fraud/abuse, and ensure safety.
- To provide support and handle grievances.
- To comply with law and enforce our Terms.
- To improve and secure the Platform.

## 3. Legal basis / consent
We process your data based on your **consent** (given at signup and for specific features), and as necessary to **perform our contract** with you, to comply with **legal obligations**, and for our **legitimate interests** (security, fraud-prevention, service improvement) consistent with DPDP. You may withdraw consent (see Section 8); some features may then be unavailable.

## 4. Sharing your data
**4.1 With other users:** the profile info and listing content you choose to publish are visible to other users. Your **phone number is not publicly displayed by default** — it is shared only through the in-app flow you initiate or allow.

**4.2 With service providers (processors):** payment gateway (Razorpay), cloud hosting/database (Supabase), image storage/CDN (Cloudflare R2), messaging/notifications (FCM, email via Resend, SMS provider), analytics/error-monitoring. They process data only on our instructions, under confidentiality.

**4.3 Legal:** we may disclose data to comply with law, a court order, a government request, or to protect rights, safety, and prevent fraud.

**4.4 Business transfer:** in a merger/acquisition, data may transfer to the successor, subject to this Policy.

**We do not sell your personal data.**

## 5. Number-sharing specifics
HomzList's contact system is designed so your number stays private until you share it. When a Poster receives an inquiry/proposal, the sender's number may be shown to the Poster as part of that flow, and a sender receives a Poster's number only if the Poster **allows** it. By using these features you consent to this specific sharing. Once shared, we cannot control the recipient's use.

## 6. Data retention
We keep personal data only as long as needed for the purposes above or as required by law:
- Account data: while your account is active (and a short period after, for legal/fraud purposes).
- Payment records: retained as required by tax/accounting law (up to **7 years**), in anonymised/minimised form after account deletion where possible.
- Notifications: ~90 days. OTP logs: ~30 days. Archived chats: as stated in-app.
- Verification documents: retained while your verification is active, then deleted per schedule.
- Soft-deleted content: recoverable for ~30 days, then purged.

## 7. Security
We use technical and organisational measures (encryption in transit and at rest, access controls, row-level security, audit logs, least-privilege) to protect your data. No system is perfectly secure; we cannot guarantee absolute security, but we work to protect your data and to notify you and authorities of significant breaches as required by law.

## 8. Your rights (DPDP)
Subject to law, you may: **access** your data; **correct/update** it; **withdraw consent**; request **erasure**; **download** your data; **opt out of marketing**; and **raise a grievance**.

> info: Use the in-app tools — [Download your data](/data) and [Deactivate or delete account](/account) — or contact the [Grievance Officer](/legal/grievance). We may need to verify your identity before acting, and some data may be retained where law requires.

## 9. Children
HomzList is not intended for anyone under **18**. We do not knowingly collect data from minors. If you believe a minor has used the Platform, contact us to remove the data.

## 10. Cookies
See the [Cookie Policy](/legal/cookie).

## 11. Cross-border processing
Some processors may store or process data outside India; where they do, we take steps consistent with DPDP to protect your data.

## 12. Changes
We may update this Policy; material changes will be notified and, where required, need re-acceptance. Versions are dated and archived.

## 13. Grievance Officer
For privacy concerns, contact the [Grievance Officer](/legal/grievance). We follow the 2021 Rules and DPDP timelines.`,
  },

  {
    slug: "refund",
    title: "Refund Policy",
    icon: "refund",
    sort_order: 3,
    version: "1.0",
    effective_date: "2026-01-01",
    seo_title: "Refund & Cancellation Policy — HomzList",
    seo_description:
      "HomzList sells prepaid digital services. Fees are generally non-refundable; refunds are issued for verified technical failures. Timelines and how to raise a request.",
    body_md: `## 1. Overview
HomzList sells **digital services** (listing plans, requirement access, proposals, boosts, top-ups) on a **payment-first, prepaid** basis. Because these are digital services delivered immediately, fees are **generally non-refundable**, except as expressly stated below. By purchasing, you agree to this Policy.

## 2. No-refund (general rule)
No refund is provided for, without limitation:
- a plan or credit that has been **activated, used, or partly used** (e.g., a listing posted, a requirement unlocked, a proposal sent, a boost run);
- **change of mind**, no longer needing the service, or not receiving inquiries/leads/results (HomzList does not guarantee inquiries, leads, visits, or a sale/rental);
- a listing that is **rejected, hidden, or removed** for violating these Terms, the Community Guidelines, or law (rejection due to your policy violation is not a service failure);
- account **suspension or termination** for violation;
- unused quota after a plan's **validity expires**;
- boosts where the listing was hidden or removed due to your violation.

## 3. When a refund MAY be given (technical failure only)
A refund (full, to the original payment method) may be issued where **a verified technical failure on HomzList's side** prevented the service from being delivered — for example:
- money was **debited but the plan/credit was not activated** and could not be activated;
- a **duplicate or double charge** for the same purchase;
- a **boost you paid for could not run** due to a HomzList error (not because your listing was removed for a violation).

> info: In these cases HomzList will **revoke the associated benefit** (e.g., unpublish the listing or remove the plan) as part of processing the refund.

## 4. How refunds work
- Raise a request via [Support](/support/new) or **{{support_email}}** within **7 days** of the charge, with the payment ID and details.
- We review (typically within **5–7 working days**). If approved, the refund is processed to the **original payment method** via our gateway; bank/gateway timelines (usually **5–10 working days**) then apply.
- **Partial refunds are not provided** unless expressly stated; approved refunds are for the full eligible amount.
- Applicable **taxes and gateway fees** are handled per gateway rules.

## 5. Cancellation
- You may stop using the Platform and **not renew** at any time. Periodic plans are prepaid and run until their validity ends; they do not auto-refund on cancellation.
- Cancelling a **pending boost before it starts** may be eligible for a refund at HomzList's discretion; once a boost has started, it is non-refundable.

## 6. Chargebacks
If you raise a chargeback, the related plan or benefit may be **suspended pending resolution**. Fraudulent chargebacks may lead to account termination and recovery action.

## 7. Changes & contact
We may update this Policy; the version in effect at your purchase applies to that purchase. Questions: **{{support_email}}** or the [Grievance Officer](/legal/grievance).`,
  },

  {
    slug: "disclaimer",
    title: "Disclaimer",
    icon: "alert",
    sort_order: 4,
    version: "1.0",
    effective_date: "2026-01-01",
    seo_title: "Disclaimer — HomzList",
    seo_description:
      "HomzList does not verify, inspect, own or guarantee any property. Listings are user-generated and all transactions are at users' own risk.",
    body_md: `## 1. "As is" service
HomzList is provided **"as is" and "as available"** without warranties of any kind, express or implied, including merchantability, fitness for a purpose, accuracy, or non-infringement.

## 2. No verification of properties
HomzList **does not verify, inspect, own, endorse, or guarantee** any property, listing, price, measurement, photograph, document, title, ownership, approval, RERA status, or availability. Listings are created by users and are the responsibility of those users.

> warn: Any "verified" badge relates only to a **person's identity, phone or RERA registration** — never to a property's title or legality.

## 3. No professional advice
Nothing on HomzList is legal, financial, tax, investment, valuation, or real-estate advice. **Do your own due diligence** and consult qualified professionals (advocate, chartered accountant, RERA/registration authorities) before any transaction, payment, token, booking, or agreement.

## 4. Transactions are at your own risk
All communication, visits, negotiations, payments, tokens/advances, bookings, and agreements are **directly between users**, entirely at their own risk. HomzList is **not a party** and bears **no responsibility** for fraud, misrepresentation, non-payment, defective property, disputes, or losses.

> warn: Never pay any token or advance without independent verification and proper documentation.

## 5. Third-party content & links
Listings, links, and information are provided by users and third parties. HomzList is not responsible for their accuracy, legality, or safety.

## 6. Availability
We do not guarantee uninterrupted or error-free operation, and may modify, suspend, or discontinue features at any time.

## 7. Limitation
This Disclaimer is subject to and read with the **Limitation of Liability** in the [Terms of Service](/legal/terms) (Section 13).`,
  },

  {
    slug: "community",
    title: "Community Guidelines",
    icon: "users",
    sort_order: 5,
    version: "1.0",
    effective_date: "2026-01-01",
    seo_title: "Community Guidelines — HomzList",
    seo_description:
      "The rules that keep HomzList trustworthy: post honestly, respect the contact system, no spam or manipulation, and how enforcement works.",
    body_md: `To keep HomzList trustworthy and spam-free, all users must follow these rules.

## 1. Post honestly
- List only **real, currently available** properties you own or are **authorised** to list.
- Use **accurate** details, **real photos** of the actual property (no stock, brochure or screenshot images passed off as real, no misleading edits), and **truthful** prices.
- No **duplicate** listings of the same property by the same person to game the feed.

## 2. Respect the contact system
- **Do not put phone numbers, WhatsApp, emails, or external links inside photos, titles, or descriptions** to bypass HomzList's controlled contact flow. Share contact only through the in-app number-sharing feature.

## 3. Be respectful & lawful
- No harassment, abuse, threats, hate speech, discrimination (including on religion, caste, gender), obscenity, or defamation.
- No fraud, scams, fake offers, phishing, or requests for token/advance without genuine dealing.
- No unlawful, infringing, or prohibited content (per Rule 3(1)(b) of the 2021 Rules).

## 4. No spam or manipulation
- No bots, mass or automated posting, scraping, or fake accounts.
- No manipulating search, feed, stories, ratings, or reports.
- No misusing requirements, proposals or boosts to spam users.

## 5. Photos & privacy
- Only upload images you have the right to use. Don't post other people's personal information without consent.

## 6. Enforcement
Violations may result in: content edits or removal, listing rejection (3 rejections → listing locked, support required), warnings, feature restrictions, temporary or permanent **account suspension**, device/IP bans, forfeiture of fees, and legal action or reporting to authorities where warranted. Reports are reviewed by our team; reporters are notified of the outcome where appropriate.

## 7. Reporting
Use the **Report** option on any listing, profile, or message, or contact the [Grievance Officer](/legal/grievance).`,
  },

  {
    slug: "grievance",
    title: "Grievance Officer",
    icon: "shield",
    sort_order: 6,
    version: "1.0",
    effective_date: "2026-01-01",
    reader: "grievance",
    seo_title: "Grievance Officer — HomzList",
    seo_description:
      "HomzList's grievance redressal mechanism under the IT Rules 2021 and DPDP Act 2023: officer details, what you can raise, and the 24-hour / 15-day timelines.",
    body_md: `Under the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, HomzList has appointed a Grievance Officer for complaints about content, accounts, or how the platform works.

## What to include
- Your name and registered mobile number
- A link to the listing, profile or content you're complaining about
- What went wrong, with dates and screenshots if possible

## What you can raise
- Unlawful, infringing, fraudulent, or policy-violating content.
- Privacy and data concerns, and DPDP rights requests.
- Impersonation, harassment, or safety issues.
- Complaints about listings, transaction-related conduct on the Platform, payments, or your account.

## Timelines (as prescribed)
- **Acknowledgement:** within **{{ack_hours}} hours** of receipt, with a ticket number.
- **Resolution:** within **{{resolution_days}} days** of receipt (or sooner where law requires faster action, e.g. certain content within 24–72 hours).
- Requests for removal of non-consensual or obscene content are actioned expeditiously as required by the 2021 Rules.

## Content removal
On a valid complaint, court order, or government notification, HomzList will remove or disable access to the specific unlawful content as required by law, consistent with its intermediary status under Section 79 of the Information Technology Act, 2000.

## Escalation
If you are unsatisfied with the resolution, you may pursue remedies available under applicable law. Nothing here limits your statutory rights.

## Legal framework
This mechanism is provided in accordance with the **Information Technology Act, 2000**, the **IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021**, the **Consumer Protection (E-Commerce) Rules, 2020**, and the **Digital Personal Data Protection Act, 2023**.`,
  },

  {
    slug: "cookie",
    title: "Cookie Policy",
    icon: "info",
    sort_order: 7,
    version: "1.0",
    effective_date: "2026-01-01",
    seo_title: "Cookie Policy — HomzList",
    seo_description:
      "What cookies and similar technologies HomzList uses, why, and how you can control them. No third-party advertising cookies.",
    body_md: `## 1. What we use
HomzList uses cookies and similar technologies (local storage for non-sensitive UI state, session tokens in secure cookies) to operate and improve the Platform.

## 2. Types
- **Strictly necessary:** authentication and session (secure, httpOnly), security, load-balancing, CSRF protection. The Platform cannot function without these.
- **Functional:** remembering preferences (city, language, mode) and UI state.
- **Analytics/performance:** aggregated usage to improve the Platform (privacy-respecting).

> info: **We do not use third-party advertising cookies to sell your data**, and we do not run ad-network tracking for third parties.

## 3. Your choices
You can manage cookies via your browser settings (blocking some may break essential features). Where required, we present a consent notice; analytics and functional cookies are set consistent with your choices. Marketing communications are opt-in and separate.

## 4. Changes
We may update this Policy; versions are dated and archived.`,
  },

  {
    slug: "about",
    title: "About HomzList",
    icon: "info",
    kind: "page",
    sort_order: 8,
    version: "1.0",
    effective_date: "2026-01-01",
    seo_title: "About HomzList — property in Rajkot, without the noise",
    seo_description:
      "HomzList is a photo-first property platform for Rajkot. Owners, brokers and builders post real properties; buyers browse without cold calls.",
    body_md: `## What HomzList is
HomzList is a photo-first property platform built for **{{jurisdiction_city}}**. Owners, brokers and builders post real properties with real photos; buyers and tenants browse a clean feed and reach the poster through a controlled chat — without their number being handed around.

## Why we built it
Property search in Rajkot ran on phone calls, forwarded images and repeated visits to the same three flats. We wanted the opposite: you see the property first, you decide, and only then does anyone get your number.

## How we're different
- **Photos first.** Every listing leads with real photos of the actual property.
- **Your number stays yours.** Nothing is shown publicly. You share it when you choose to.
- **Pay once, list for life.** One plan, no subscription, no renewal reminders.
- **No cold calls.** Buyers reach you through chat you accept, not a call centre.

## What we are not
We are a listing and discovery platform — an intermediary. We do not own, sell, inspect, value or guarantee any property, and we are never a party to your transaction. See the [Disclaimer](/legal/disclaimer) and [Terms of Service](/legal/terms).

## Who runs it
**{{entity_name}}**, {{registered_address}}. Questions: **{{support_email}}**. For complaints, our [Grievance Officer](/legal/grievance) is listed with contact details and timelines.`,
  },
];

/** Prior versions, so the version strip's "View previous versions" has history. */
export const LEGAL_HISTORY = [
  {
    slug: "terms",
    version: "0.9",
    effective_date: "2025-10-01",
    note: "Pre-launch draft circulated for legal review.",
    is_material: false,
  },
  {
    slug: "privacy",
    version: "0.9",
    effective_date: "2025-10-01",
    note: "Pre-launch draft; DPDP section added after review.",
    is_material: false,
  },
  {
    slug: "refund",
    version: "0.9",
    effective_date: "2025-10-01",
    note: "Pre-launch draft; technical-failure exception clarified.",
    is_material: false,
  },
];
