/**
 * The seven legal pages of build/Doc10, plus About, as CMS rows.
 *
 * This is a TRANSCRIPTION, not a rewrite. Doc10 opens with an instruction that
 * outranks any impulse to tidy it: a qualified Indian advocate must review the
 * final text, and every `[SQUARE BRACKET]` is Rajan's to fill. So the bracket
 * placeholders are carried through EXACTLY as written — inventing a legal
 * entity name, a CIN or a grievance officer would be fabricating a legal
 * record, and the design draws "Name: [Officer Name]" for precisely that reason.
 *
 * Structure is the one the reader renders:
 *   `## N. Title`   →  an <h2> with an anchor; the "Table of contents" accordion
 *                      is built from these, so the numbering IS the TOC.
 *   `> info: …` / `> warn: …`  →  the design's accent / warning callouts.
 *   `- ` / `1. `    →  the two list styles in .longform.
 */

/**
 * requires_reacceptance is seeded FALSE on this first real publish, and that is
 * a deliberate call rather than an oversight.
 *
 * Turning it on walls EVERY existing account behind the interstitial on their
 * next page load. The flag exists for a MATERIAL CHANGE — Doc10's own wording —
 * and v1.0 is the first version, not a change to one. A20's "require
 * re-acceptance" toggle is the switch, and flipping it is a decision with a
 * user-visible cost that belongs to Rajan, not to a seed script.
 *
 * The gate itself is proven working either way by scripts/check-module12-live.mjs
 * §9, which publishes a version nobody has accepted and walks the whole flow.
 */
const EFFECTIVE = "2026-08-01";

export const LEGAL_PAGES = [
  /* ───────────────────────────────────────────────────────── 1 · TERMS ── */
  {
    slug: "terms",
    title: "Terms of Service",
    kind: "legal",
    reader: "longform",
    icon: "file",
    sort_order: 1,
    version: "1.0",
    effective_date: EFFECTIVE,
    requires_reacceptance: false,
    seo_title: "Terms of Service — HomzList",
    seo_description:
      "The terms that govern your use of HomzList: intermediary status under Section 79 of the IT Act, posting rules, plans and payments, liability, and Rajkot jurisdiction.",
    body_md: `> info: HomzList is a listing and discovery platform. We are not a broker, we do not own or verify any property, and we are not a party to any deal made through the platform.

## 1. Who we are
HomzList ("HomzList", "Platform", "we", "us", "our") is owned and operated by **[LEGAL ENTITY NAME]**, a **[ENTITY TYPE]** registered in India, having its registered office at **[REGISTERED ADDRESS, RAJKOT, GUJARAT]** (**[CIN/LLPIN/REG NO]**). HomzList operates the website and progressive web app at **homzlist.com** and its subdomains.

## 2. Acceptance of these Terms
By accessing or using HomzList, creating an account, or posting any content, you agree to these Terms of Service, our Privacy Policy, Refund & Cancellation Policy, Community Guidelines, and Cookie Policy (together, the "Terms"). If you do not agree, do not use the Platform.

You must be **18 years or older** and legally competent to contract under the Indian Contract Act, 1872.

## 3. What HomzList is — and is not
**3.1 We are an intermediary.** HomzList is a **neutral listing and discovery platform** that lets property owners, brokers, and builders ("Posters") publish property listings, requirements, and projects, and lets users browse and connect with them. HomzList is an "intermediary" under **Section 2(1)(w) of the Information Technology Act, 2000** and claims safe-harbour protection under **Section 79** of that Act.

**3.2 We are not a party to any transaction.** HomzList:

- is **not** a real-estate agent, broker, dealer, builder, or advisor;
- does **not** own, sell, rent, lease, inspect, verify, value, or guarantee any property;
- does **not** participate in negotiations, bookings, token payments, agreements, or transactions between users;
- does **not** guarantee the accuracy, legality, title, quality, or availability of any listing;
- does **not** verify ownership of any property (any "verified" badge refers **only** to identity, phone, or RERA verification of a person, **never** to verification of a property, its title, or its legality).

**3.3 All dealings are directly between users.** Any inquiry, visit, negotiation, booking, payment, agreement, or dispute is **solely between the users concerned**, at their own risk and discretion. You are responsible for conducting your own due diligence — title checks, legal verification, physical inspection, price assessment, and professional advice — before any transaction.

## 4. Accounts, roles and verification
1. Registration is via mobile number and OTP. You must provide accurate information and keep it updated. You are responsible for all activity under your account and for keeping your device and number secure.
2. **Roles:** Owner, Broker, Builder. You must select the role that truthfully applies to you and use the Platform accordingly.
3. **Verification badges** (phone, ID, RERA) indicate that we performed a limited identity check on the **person**. They do **not** certify any property, its documents, its title, or the truthfulness of any listing. Do not rely on a badge as proof of a property's legality.
4. We may refuse, suspend, or terminate accounts that violate these Terms, the Community Guidelines, or applicable law.

## 5. Plans, payments and content quota
1. Certain features — posting listings, viewing and using requirements, proposals, boosts — require a **paid plan** or credits, purchased in advance ("payment-first"). Current plans, prices, inclusions, validity, and quotas are shown on the Plans page and may change from time to time. Existing purchases are honoured on their original terms.
2. Payments are processed by our third-party payment gateway (**Razorpay**). We do not store your card details.
3. Quotas — listings, requirements, proposals — are consumed as described on the Plans page and in-app. Some actions consume quota even if later toggled off or deleted, as clearly indicated in-app.
4. Refunds are governed by the **Refund & Cancellation Policy**. In general, fees are **non-refundable** except where a technical failure on our side prevented the service from being delivered.

> warn: Turning off or deleting a requirement still uses its slot. This is shown in-app before you confirm.

## 6. Your content and responsibilities
1. You retain ownership of content you post — photos, text, listings. By posting, you grant HomzList a **non-exclusive, royalty-free, worldwide licence** to host, store, reproduce, resize, watermark, display, and distribute that content **for the purpose of operating, promoting, and improving the Platform**, including in search results, feeds, stories, area pages, and shareable links.
2. **You represent and warrant** that: you own or are authorised to post the content; you have the right to list the property as owner, or as an authorised broker or builder; the content is accurate, lawful, and not misleading; you have consent to share any photos; and the listing does not infringe anyone's rights.
3. **You must not post** false, fake, duplicate, or misleading listings; properties you are not authorised to list; contact numbers or links inside photos or text to bypass the Platform's contact system; unlawful, fraudulent, discriminatory, obscene, defamatory, or infringing content; or content that violates the Community Guidelines or **Rule 3(1)(b) of the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021**.
4. You are solely responsible for your content and your dealings. HomzList may — but is not obliged to — review, moderate, request changes to, hide, or remove content, and may suspend accounts, at its discretion.

## 7. Contact-sharing and privacy of numbers
HomzList operates a **controlled contact system**: your phone number is not publicly displayed by default. Sharing of numbers happens only through the in-app flow you choose — for example, when a Poster accepts your inquiry. You agree not to attempt to circumvent this system. Once you share your number or contact another user, HomzList is not responsible for how the other party uses it.

## 8. Prohibited conduct
You must not: use the Platform unlawfully; scrape, crawl, or harvest data; reverse-engineer or disrupt the Platform; attempt unauthorised access, bypass security, or exploit vulnerabilities; use bots or automated posting; spam, harass, or defraud other users; post malware; or infringe intellectual property. Violations may lead to suspension, termination, and legal action.

## 9. Intermediary status, moderation and takedown
1. Consistent with Section 79 and the 2021 Rules, HomzList acts as an intermediary and does not initiate, select the receiver of, or modify the information in user listings, beyond format and technical processing and lawful moderation.
2. Upon **actual knowledge** — via a court order or government notification, or a valid grievance — that specific content is unlawful, HomzList will act expeditiously to remove or disable access to that content as required by law.
3. HomzList publishes these Terms, the Privacy Policy, and a grievance mechanism as required by the 2021 Rules, and will not knowingly host content prohibited by Rule 3(1)(b).

## 10. Intellectual property
The HomzList name, logo, design, software, and compilation of listings are owned by **[LEGAL ENTITY NAME]** and protected by law. You may not use them without written permission. User content remains the user's, subject to the licence in Section 6.

## 11. Third-party services and links
The Platform integrates third-party services — payment gateway, messaging and notification providers, storage, and links where applicable. Their use is governed by their own terms. HomzList is not responsible for third-party services or any external websites linked by users.

## 12. Disclaimers
The Platform and all listings are provided **"as is" and "as available"**, without warranties of any kind. See the full **Disclaimer**, which forms part of these Terms.

## 13. Limitation of liability
To the maximum extent permitted by law, HomzList and its owners, directors, employees, and partners shall **not be liable** for any indirect, incidental, special, consequential, or punitive damages, or for any loss arising from: your use of, or inability to use, the Platform; any listing's accuracy, legality, or availability; any transaction, dealing, payment, token, fraud, or dispute between users; property defects or title issues; or reliance on any content.

**HomzList's total aggregate liability, if any, for any claim shall not exceed the total fees you paid to HomzList in the [three (3)] months preceding the claim.**

## 14. Indemnity
You agree to indemnify and hold harmless HomzList and its owners and employees from any claim, loss, liability, or expense — including legal fees — arising from your content, your use of the Platform, your dealings with other users, or your breach of these Terms or of law.

## 15. Suspension and termination
We may suspend or terminate your access at any time for violation of these Terms, suspected fraud, legal requirement, or risk to the Platform or its users. You may stop using the Platform and delete your account at any time, subject to the Refund Policy and legal retention obligations.

## 16. Changes to these Terms
We may update these Terms. Material changes will be notified in-app or by email and, where appropriate, will require your re-acceptance. Continued use after changes means you accept them. Each version is dated and archived, and you can read any previous version from this page.

## 17. Governing law and jurisdiction
These Terms are governed by the laws of India. Subject to Section 18, the courts at **Rajkot, Gujarat** shall have **exclusive jurisdiction** over any dispute.

## 18. Grievance redressal
For complaints about content or your experience, contact our **Grievance Officer**. We follow the timelines prescribed under the 2021 Rules: acknowledgement within 24 hours, resolution within 15 days.

## 19. Contact
**[LEGAL ENTITY NAME]**, [REGISTERED ADDRESS, RAJKOT, GUJARAT]. Support: **[SUPPORT EMAIL]**.

The interface may be translated, but the **legally binding version of this page is the English one**.`,
  },

  /* ─────────────────────────────────────────────────────── 2 · PRIVACY ── */
  {
    slug: "privacy",
    title: "Privacy Policy",
    kind: "legal",
    reader: "longform",
    icon: "shield",
    sort_order: 2,
    version: "1.0",
    effective_date: EFFECTIVE,
    requires_reacceptance: false,
    seo_title: "Privacy Policy — HomzList",
    seo_description:
      "How HomzList collects, uses, shares and protects your personal data under the IT Act, the SPDI Rules and the DPDP Act, 2023 — including how phone numbers are kept private.",
    body_md: `This Privacy Policy explains how **[LEGAL ENTITY NAME]** ("we") collects, uses, shares, and protects your personal data when you use HomzList, in line with the **Information Technology Act, 2000**, the **SPDI Rules, 2011**, and the **Digital Personal Data Protection Act, 2023 (DPDP)**.

> info: Your phone number is never displayed publicly. It is shared with another user only through a flow you start or accept.

## 1. Data we collect
**1.1 You provide:** mobile number; name; role (owner, broker or builder); city; profile photo (optional); bio (optional); listing, requirement and project details and photos; verification documents (ID or RERA) if you submit them; messages you send; support tickets; and payment-related information, which is processed by the gateway.

**1.2 Collected automatically:** device and browser type, IP address, approximate location at city level, app usage and analytics, cookies and similar technologies, and log data.

**1.3 From third parties:** payment status from the payment gateway, and verification results.

We collect only what is needed to provide the service — **data minimisation**.

## 2. How we use your data
- To create and manage your account and role.
- To publish and operate your listings, requirements and projects.
- To power search, the feed, stories, matching, and area pages.
- To enable the controlled contact and chat system, including number-sharing that you authorise.
- To process payments, plans, invoices, and quotas.
- To send transactional notifications — approvals, inquiries, payments, expiries — and, if you opt in, marketing.
- To verify identity where you request a badge, prevent fraud and abuse, and keep users safe.
- To provide support and handle grievances.
- To comply with law and enforce our Terms.
- To improve and secure the Platform.

## 3. Legal basis and consent
We process your data based on your **consent**, given at signup and for specific features, and as necessary to **perform our contract** with you, to comply with **legal obligations**, and for our **legitimate interests** — security, fraud prevention, service improvement — consistent with DPDP. You may withdraw consent (see Section 8); some features may then be unavailable.

## 4. Sharing your data
1. **With other users:** the profile information and listing content you choose to publish are visible to other users. Your **phone number is not publicly displayed by default** — it is shared only through the in-app flow you initiate or allow.
2. **With service providers (processors):** payment gateway (Razorpay), cloud hosting and database (Supabase), image storage and CDN (Cloudflare R2), messaging and notifications (FCM, email via Resend, SMS provider), and analytics and error monitoring. They process data only on our instructions, under confidentiality.
3. **Legal:** we may disclose data to comply with law, a court order, or a government request, or to protect rights and safety and prevent fraud.
4. **Business transfer:** in a merger or acquisition, data may transfer to the successor, subject to this Policy.

**We do not sell your personal data.**

## 5. Number-sharing specifics
HomzList's contact system is designed so your number stays private until you share it. When a Poster receives an inquiry or proposal, the sender's number may be shown to the Poster as part of that flow, and a sender receives a Poster's number only if the Poster **allows** it. By using these features you consent to this specific sharing. Once shared, we cannot control the recipient's use.

## 6. Data retention
We keep personal data only as long as needed for the purposes above, or as required by law:

- **Account data:** while your account is active, and for a short period after, for legal and fraud purposes.
- **Payment records:** retained as required by tax and accounting law — up to **7 years** — in anonymised or minimised form after account deletion where possible.
- **Notifications:** about 90 days. OTP logs: about 30 days. Archived chats: as stated in-app.
- **Verification documents:** retained while your verification is active, then deleted on schedule.
- **Soft-deleted content:** recoverable for about 30 days, then purged.

## 7. Security
We use technical and organisational measures — encryption in transit and at rest, access controls, row-level security, audit logs, least privilege — to protect your data. No system is perfectly secure; we cannot guarantee absolute security, but we work to protect your data and to notify you and the authorities of significant breaches as required by law.

## 8. Your rights under DPDP
Subject to law, you may **access** your data, **correct or update** it, **withdraw consent**, request **erasure**, **download** your data, **opt out of marketing**, and **raise a grievance**.

Use the in-app tools — Settings → Download your data, and Settings → Deactivate or delete account — or contact the Grievance Officer. We may need to verify your identity before acting. Some data may be retained where law requires.

## 9. Children
HomzList is not intended for anyone under **18**. We do not knowingly collect data from minors. If you believe a minor has used the Platform, contact us to remove the data.

## 10. Cookies
See the **Cookie Policy**.

## 11. Cross-border processing
Some processors may store or process data outside India. Where they do, we take steps consistent with DPDP to protect your data.

## 12. Changes
We may update this Policy. Material changes will be notified and, where required, will need re-acceptance. Versions are dated and archived.

## 13. Grievance Officer
For privacy concerns, contact the **Grievance Officer**. We follow the 2021 Rules and DPDP timelines.

The interface may be translated, but the **legally binding version of this page is the English one**.`,
  },

  /* ──────────────────────────────────────────────────────── 3 · REFUND ── */
  {
    slug: "refund",
    title: "Refund Policy",
    kind: "legal",
    reader: "longform",
    icon: "refund",
    sort_order: 3,
    version: "1.0",
    effective_date: EFFECTIVE,
    requires_reacceptance: false,
    seo_title: "Refund & Cancellation Policy — HomzList",
    seo_description:
      "HomzList sells prepaid digital services. Fees are generally non-refundable; refunds are issued for verified technical failures such as a debited payment with no plan activated.",
    body_md: `## 1. Overview
HomzList sells **digital services** — listing plans, requirement access, proposals, boosts, top-ups — on a **payment-first, prepaid** basis. Because these are digital services delivered immediately, fees are **generally non-refundable**, except as expressly stated below. By purchasing, you agree to this Policy.

## 2. No refund — the general rule
No refund is provided for, without limitation:

- a plan or credit that has been **activated, used, or partly used** — a listing posted, a requirement unlocked, a proposal sent, a boost run;
- **change of mind**, no longer needing the service, or not receiving inquiries, leads or results. HomzList does not guarantee inquiries, leads, visits, or a sale or rental;
- a listing that is **rejected, hidden, or removed** for violating these Terms, the Community Guidelines, or law. A rejection caused by your policy violation is not a service failure;
- account **suspension or termination** for violation;
- unused quota after a plan's **validity expires**;
- boosts where the listing was hidden or removed due to your violation.

## 3. When a refund may be given — technical failure only
A refund, in full, to the original payment method, may be issued where **a verified technical failure on HomzList's side** prevented the service from being delivered. For example:

1. money was **debited but the plan or credit was not activated**, and could not be activated;
2. a **duplicate or double charge** for the same purchase;
3. a **boost you paid for could not run** because of a HomzList error — not because your listing was removed for a violation.

> info: If a payment succeeds but the plan does not activate, you do not need to raise a ticket. We activate it or refund automatically. You can still raise a ticket if you would like an update.

In such cases, HomzList will **revoke the associated benefit** — unpublish the listing, remove the plan — as part of processing the refund.

## 4. How refunds work
- Raise a request via **Support** in-app, or **[SUPPORT EMAIL]**, within **[7] days** of the charge, with the payment ID and details.
- We review, typically within **[5–7] working days**. If approved, the refund is processed to the **original payment method** through our gateway; bank and gateway timelines, usually **5–10 working days**, then apply.
- **Partial refunds are not provided** unless expressly stated. Approved refunds are for the full eligible amount.
- Applicable **taxes and gateway fees** are handled per gateway rules.

## 5. Cancellation
- You may stop using the Platform and **not renew** at any time. Prepaid plans run until their validity ends; they do not auto-refund on cancellation.
- Cancelling a **pending boost before it starts** may be eligible for a refund at HomzList's discretion. Once a boost has started, it is non-refundable.

## 6. Chargebacks
If you raise a chargeback, the related plan or benefit may be **suspended pending resolution**. Fraudulent chargebacks may lead to account termination and recovery action.

## 7. Changes and contact
We may update this Policy. The version in effect at the time of your purchase applies to that purchase. Questions: **[SUPPORT EMAIL]**, or the Grievance Officer.

The interface may be translated, but the **legally binding version of this page is the English one**.`,
  },

  /* ──────────────────────────────────────────────────── 4 · DISCLAIMER ── */
  {
    slug: "disclaimer",
    title: "Disclaimer",
    kind: "legal",
    reader: "longform",
    icon: "alert",
    sort_order: 4,
    version: "1.0",
    effective_date: EFFECTIVE,
    requires_reacceptance: false,
    seo_title: "Disclaimer — HomzList",
    seo_description:
      "HomzList does not verify, inspect, own, endorse or guarantee any property. All visits, negotiations, tokens and agreements are directly between users, at their own risk.",
    body_md: `> warn: Never pay a token or advance without independent verification and proper documentation. HomzList is not a party to any deal and cannot recover money paid to another user.

## 1. "As is" service
HomzList is provided **"as is" and "as available"**, without warranties of any kind, express or implied, including merchantability, fitness for a purpose, accuracy, or non-infringement.

## 2. No verification of properties
HomzList **does not verify, inspect, own, endorse, or guarantee** any property, listing, price, measurement, photograph, document, title, ownership, approval, RERA status, or availability. Listings are created by users and are the responsibility of those users.

Any "verified" badge relates only to a **person's identity, phone, or RERA registration** — never to a property's title or legality.

## 3. No professional advice
Nothing on HomzList is legal, financial, tax, investment, valuation, or real-estate advice. **Do your own due diligence** and consult qualified professionals — an advocate, a chartered accountant, the RERA and registration authorities — before any transaction, payment, token, booking, or agreement.

## 4. Transactions are at your own risk
All communication, visits, negotiations, payments, tokens and advances, bookings, and agreements are **directly between users**, entirely at their own risk. HomzList is **not a party** and bears **no responsibility** for fraud, misrepresentation, non-payment, defective property, disputes, or losses.

## 5. Third-party content and links
Listings, links, and information are provided by users and third parties. HomzList is not responsible for their accuracy, legality, or safety.

## 6. Availability
We do not guarantee uninterrupted or error-free operation, and may modify, suspend, or discontinue features at any time.

## 7. Limitation
This Disclaimer is subject to and read with the **Limitation of Liability** in Section 13 of the Terms of Service.

The interface may be translated, but the **legally binding version of this page is the English one**.`,
  },

  /* ──────────────────────────────────────────────────── 5 · COMMUNITY ── */
  {
    slug: "community",
    title: "Community Guidelines",
    kind: "legal",
    reader: "longform",
    icon: "users",
    sort_order: 5,
    version: "1.0",
    effective_date: EFFECTIVE,
    requires_reacceptance: false,
    seo_title: "Community Guidelines — HomzList",
    seo_description:
      "The rules that keep HomzList trustworthy: post honestly, respect the contact system, no spam or manipulation, and how enforcement works.",
    body_md: `To keep HomzList trustworthy and spam-free, all users must follow these rules.

## 1. Post honestly
- List only **real, currently available** properties that you own or are **authorised** to list.
- Use **accurate** details, **real photos** of the actual property — no stock, brochure, or screenshot images passed off as real, and no misleading edits — and **truthful** prices.
- No **duplicate** listings of the same property by the same person to game the feed.

## 2. Respect the contact system
**Do not put phone numbers, WhatsApp handles, emails, or external links inside photos, titles, or descriptions** to bypass HomzList's controlled contact flow. Share contact details only through the in-app number-sharing feature.

> info: This is the single most common reason a listing is sent back for changes. A number in the description is detected automatically, before a human ever sees the listing.

## 3. Be respectful and lawful
- No harassment, abuse, threats, hate speech, discrimination — including on religion, caste or gender — obscenity, or defamation.
- No fraud, scams, fake offers, phishing, or requests for a token or advance without a genuine dealing.
- No unlawful, infringing, or prohibited content, per Rule 3(1)(b) of the 2021 Rules.

## 4. No spam or manipulation
- No bots, mass or automated posting, scraping, or fake accounts.
- No manipulating search, the feed, stories, ratings, or reports.
- No misusing requirements, proposals, or boosts to spam users.

## 5. Photos and privacy
Only upload images you have the right to use. Do not post other people's personal information without their consent.

## 6. Enforcement
Violations may result in content edits or removal, listing rejection — **three rejections locks the listing and support is required** — warnings, feature restrictions, temporary or permanent **account suspension**, device or IP bans, forfeiture of fees, and legal action or reporting to the authorities where warranted.

Reports are reviewed by our team, and reporters are notified of the outcome where appropriate.

## 7. Reporting
Use the **Report** option on any listing, profile, or message, or contact the **Grievance Officer**.

The interface may be translated, but the **legally binding version of this page is the English one**.`,
  },

  /* ─────────────────────────────────────────────────── 6 · GRIEVANCE ── */
  {
    slug: "grievance",
    title: "Grievance Officer",
    kind: "legal",
    reader: "grievance",
    icon: "shield",
    sort_order: 6,
    version: "1.0",
    effective_date: EFFECTIVE,
    requires_reacceptance: false,
    seo_title: "Grievance Officer — HomzList",
    seo_description:
      "HomzList's grievance mechanism under the IT Rules 2021 and the DPDP Act: officer details, what you can raise, and the 24-hour acknowledgement / 15-day resolution timeline.",
    body_md: `In accordance with the **Information Technology Act, 2000**, the **IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021**, the **Consumer Protection (E-Commerce) Rules, 2020**, and the **DPDP Act, 2023**, HomzList provides the following grievance mechanism.

## 1. What you can raise
- Unlawful, infringing, fraudulent, or policy-violating content.
- Privacy and data concerns, and DPDP rights requests.
- Impersonation, harassment, or safety issues.
- Complaints about listings, transaction-related conduct on the Platform, payments, or your account.

## 2. How to complain
Email the Grievance Officer, or use in-app **Support**, with:

- your name and contact details;
- a description of the issue;
- the specific listing, profile, message, URL or ID;
- any supporting evidence.

For content-takedown requests, include the reason and the legal basis where possible. False or malicious complaints may lead to action.

## 3. Timelines
1. **Acknowledgement:** within **24 hours** of receipt, with a ticket number.
2. **Resolution:** within **15 days** of receipt — or sooner where the law requires faster action, for example certain content within 24 to 72 hours.
3. Requests for removal of non-consensual or obscene content are actioned expeditiously as required by the 2021 Rules.

## 4. Content removal
On a valid complaint, a court order, or a government notification, HomzList will remove or disable access to the specific unlawful content as required by law, consistent with its intermediary status under Section 79.

## 5. Escalation
If you are not satisfied with the resolution, you may pursue the remedies available to you under applicable law. Nothing here limits your statutory rights.

The interface may be translated, but the **legally binding version of this page is the English one**.`,
    // The grievance reader draws an officer card above the body. The values are
    // Doc10 placeholders on purpose — see the file header.
    meta: {
      officer_name: "[GRIEVANCE OFFICER NAME]",
      officer_designation: "Grievance Officer, [LEGAL ENTITY NAME]",
      officer_email: "[GRIEVANCE EMAIL]",
      officer_address: "[REGISTERED ADDRESS, RAJKOT, GUJARAT]",
      officer_phone: "[PHONE]",
      officer_hours: "[Mon–Fri, 10:00–18:00 IST]",
    },
  },

  /* ────────────────────────────────────────────────────── 7 · COOKIE ── */
  {
    slug: "cookie",
    title: "Cookie Policy",
    kind: "legal",
    reader: "longform",
    icon: "info",
    sort_order: 7,
    version: "1.0",
    effective_date: EFFECTIVE,
    requires_reacceptance: false,
    seo_title: "Cookie Policy — HomzList",
    seo_description:
      "What cookies HomzList uses and why: strictly necessary session cookies, functional preferences, and privacy-respecting analytics. No third-party advertising cookies.",
    body_md: `## 1. What we use
HomzList uses cookies and similar technologies — local storage for non-sensitive interface state, and session tokens in secure cookies — to operate and improve the Platform.

## 2. Types
1. **Strictly necessary:** authentication and session cookies (secure, httpOnly), security, load balancing, CSRF protection. The Platform cannot function without these.
2. **Functional:** remembering preferences such as city, language and appearance, and interface state.
3. **Analytics and performance:** aggregated usage, to improve the Platform, in a privacy-respecting way.

**We do not use third-party advertising cookies to sell your data**, and we do not run ad-network tracking for third parties.

## 3. Your choices
You can manage cookies through your browser settings — blocking some may break essential features. Where required, we present a consent notice; analytics and functional cookies are set consistent with your choices. Marketing communications are opt-in and separate.

## 4. Changes
We may update this Policy. Versions are dated and archived.

The interface may be translated, but the **legally binding version of this page is the English one**.`,
  },

  /* ─────────────────────────────────────────────────────── 8 · ABOUT ── */
  {
    slug: "about",
    title: "About HomzList",
    kind: "page",
    reader: "longform",
    icon: "info",
    sort_order: 8,
    version: "1.0",
    effective_date: EFFECTIVE,
    requires_reacceptance: false,
    seo_title: "About HomzList — property in Rajkot, without the broker chain",
    seo_description:
      "HomzList is a Rajkot-first property platform: owners, brokers and builders post directly, numbers stay private until you share them, and there is one honest ₹999 plan.",
    body_md: `## 1. Why we built it
Looking for a flat in Rajkot used to mean one thing: give your number to four brokers and then stop answering your phone for a month. The listings you saw were months old, half of them were already sold, and the price on the site was never the price on the site visit.

HomzList started as a simple fix for that. Owners, brokers and builders post their own property. You browse it the way you browse anything else on your phone — photos first, price visible, no login wall. And your number stays yours until you decide to hand it over.

## 2. What we are
We are a **listing and discovery platform**, and we are careful about that wording. We do not own property, we do not broker deals, we do not take a cut of your sale, and we are not in the room when you negotiate. What we run is the noticeboard and the introduction.

That also means we cannot promise a property is what its listing says it is. We check people — phone, and ID or RERA where they ask for a badge. We do not check titles. Section 2 of our Disclaimer says this in more formal language, and it is worth reading before you pay anyone a token.

## 3. How we make money
One plan, ₹999, paid once. It gives an owner one lifetime listing, one requirement live for 30 days, and ten proposals. Boosts are separate and optional. That is the whole business model — there is no commission, no lead resale, and no "premium buyer" tier that pushes you down the results.

We would rather explain a price once than defend a bill every month.

## 4. Where we are
Rajkot, Gujarat. We started here on purpose. A property platform that knows the difference between Mavdi and Mavdi Chowkdi, or why a 150 Feet Ring Road address means something different from a Kalawad Road one, is more useful than a national site that treats the whole city as one dot on a map.

Other Gujarat cities come next, one at a time, and only when there are enough real listings in them to be worth opening.

## 5. Getting in touch
The fastest route is **Help centre → Contact support** in the app: it opens a ticket with a number, and we reply within 24 hours. For anything legal, or a complaint that needs a formal record, use the **Grievance Officer** page.`,
  },
];
