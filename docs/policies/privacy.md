# **{{hub.name | "HYPE"}} Privacy Policy**

**Last Updated:** {{ date.today() }}
<br>**Version:** 1.0

---

## 1. Introduction

This Privacy Policy explains how **{{hub.name | "HYPE"}}** ("**we**", "**us**", "**our**") and **HYPE** ("**HYPE**", operated by Droste Limited) collect, use, and protect your personal data when you use this Platform.

By using {{hub.name | "HYPE"}}, you acknowledge that your data is processed by both **{{hub.name | "HYPE"}}** (as the platform operator) and **HYPE** (as the infrastructure provider) as described in this Policy.

---

## 2. Who Processes Your Data

| Party                   | Role                                  | Responsibilities                                                                              |
| ----------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------- |
| **HYPE**                | Data Controller (Account & Ecosystem) | Account management, authentication storage, cross-platform activity, ecosystem security       |
| **{{hub.name \| "HYPE"}}**                            | Data Controller (Platform-Specific)                                                           | Platform usage, project participation, local moderation, partner communications |
| **Google/Facebook/WeChat** | Identity Provider (OAuth)             | Authentication verification; provides email, name, profile photo                              |
| **Cloudflare**          | Sub-processor (Infrastructure)        | Data hosting (D1 database), image storage (R2), CDN delivery, DDoS protection, edge computing |

Infrastructure Notice: All data you provide to {{hub.name | "HYPE"}} and HYPE is stored and processed using Cloudflare infrastructure (D1 for structured data, R2 for images and files). Cloudflare operates globally with edge locations worldwide. Data may be processed and stored in jurisdictions outside Hong Kong, including the United States and European Economic Area, subject to Cloudflare's Data Processing Terms and Standard Contractual Clauses where applicable.

Data is encrypted in transit and at rest. Cloudflare's processing is governed by their [Data Processing Agreement](https://www.cloudflare.com/trust-hub/gdpr/) and [Privacy Policy](https://www.cloudflare.com/privacypolicy/).

### Key compliance points for Cloudflare:

| Issue              | Action Required                                                                   |
| ------------------ | --------------------------------------------------------------------------------- |
| **Data residency** | Cloudflare D1/R2 don't guarantee Hong Kong-only storage; data is global by design |
| **GDPR/SCCs**      | Cloudflare offers Standard Contractual Clauses for international transfers        |
| **Encryption**     | Ensure client-side or transit encryption for sensitive data if needed             |
| **Access logs**    | Cloudflare may retain edge logs; consider if this affects your retention policies |

---

## 3. What We Collect

### 3.1 From Your HYPE Account (via HYPE)

- **Account Information:** Email address, username/display name/attribution name, profile photo (via Google)
- **Authentication Data:** Login history, security settings, connected devices
- **Ecosystem Activity:** Platforms accessed, content contributed across HYPE, attribution history
- **Payment Information:** If applicable, handled by HYPE's payment processors

### 3.2 From Your Use of {{hub.name | "HYPE"}}

- **Platform Interaction:** Pages visited, projects viewed, search queries, features used
- **Contributions:** Places added, images uploaded, feedback submitted, project participation
- **Communications:** Messages to {{hub.name | "HYPE"}} support, comments, reports
- **Device Information:** IP address, browser type, operating system (via standard logging)

### 3.3 Continuing Without an Account

When you open the interactive application without a signed-in account, HYPE automatically creates a pseudonymous server-side identifier and a secure session cookie. Preferences, locale, selected default layers, wishlist entries, visited-place state, and related activity are stored in our database against that temporary identifier. This is a guest account, not untracked or anonymous use.

The secure cookie is the only credential that reconnects the browser to this saved state. Clearing cookies or allowing the session and retention period to expire can make the state inaccessible. Guest accounts with no usable session are deleted after a 45-day inactivity grace period. When you upgrade using email/password or a support social login, the saved state is merged into the account you select and thereafter follows the account retention rules.

### 3.4 Location Data

- **Precise Location:** Only if you explicitly grant permission (e.g., when adding a place)
- **General Location:** Derived from IP address for service optimisation and security

---

## 4. How We Use Your Data

| Purpose                                           | Who Processes | Legal Basis                                |
| ------------------------------------------------- | ------------- | ------------------------------------------ |
| Provide and maintain your HYPE Account            | HYPE          | Contract performance                       |
| Enable single sign-on across platforms            | HYPE          | Contract performance                       |
| Operate this Platform and display content         | {{hub.name \| "HYPE"}}                                   | Contract performance                       |
| Attribute your contributions across the ecosystem | Both          | Contract performance / Legitimate interest |
| Moderate content and enforce Terms                | Both          | Legitimate interest / Legal obligation     |
| Improve services and develop features             | HYPE          | Legitimate interest                        |
| Send service notifications                        | HYPE          | Contract performance / Legitimate interest |
| Comply with legal obligations                     | Both          | Legal obligation                           |
| Send marketing newsletter to subscribers          | {{hub.name \| "HYPE"}}                                   | Contract performance / Legitimate interest |

---

## 5. Data Sharing & The HYPE Ecosystem

### 5.1 Within the Ecosystem

Your data is shared between **HYPE** and **{{hub.name | "HYPE"}}**, and potentially other HYPE-powered platforms, as follows:

- **Profile Data:** Your username, display name, profile photo, and public contributions are visible across platforms you access
- **Attribution:** Your attribution name travels with your content throughout the ecosystem
- **Activity:** HYPE maintains a record of your platform access for security and service provision

### 5.2 With Third Parties

| Recipient                       | Purpose                                | Data Shared                                            |
| ------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| Other HYPE-powered platforms    | Single sign-on and content attribution | Profile identifier, display name, public contributions |
| Cloudflare (hosting, analytics) | Platform operation                     | Technical data, aggregated usage                       |
| Law enforcement                 | Legal compliance                       | As required by valid legal process                     |
| Project collaborators           | Project-specific collaboration         | As specified by project terms                          |

### 5.3 Requests From Public Authorities

We respond to requests for personal data from public authorities, including law-enforcement and regulatory bodies, only when required by applicable law or a valid, binding legal process. Before disclosing any personal data, we:

- Review the request for legal validity, scope, and authority.
- Challenge, seek clarification of, or narrow a request where we reasonably consider it unlawful, invalid, or overbroad.
- Disclose only the minimum personal data necessary to comply with the valid request.
- Document the request, our response, the legal basis for the decision, and the people involved in handling it.

Where permitted by law and where doing so would not compromise an investigation or safety, we will notify the affected user before disclosure or as soon as we are permitted to do so.

### 5.4 Pseudonymous/Anonymous Contributions

If you set your attribution to a pseudonym or "anonymous":

- Your real account identity is not displayed publicly
- **HYPE** retains the link between your account and contributions for moderation and legal compliance
- **{{hub.name | "HYPE"}}** may still see your account identity for platform management purposes

---

## 6. Data Retention

| Data Category                   | Retention Period                                                           |
| ------------------------------- | -------------------------------------------------------------------------- |
| HYPE Account data               | Until account deletion                                                     |
| Guest account data              | While a usable session exists, then up to a 45-day inactivity grace period |
| Platform usage logs ({{hub.name | "HYPE"}})                                                                  | 12 months |
| Content contributions           | Until content deletion (or longer if licensed to projects)                 |
| Deleted content                 | Up to 30 days in backup systems                                            |
| Legal compliance records        | As required by applicable law                                              |

**Project data:** If you contribute to a project with specific licensing terms, your contribution may be retained according to those terms even if you delete your account, subject to attribution requirements.

---

## 7. Your Rights

Under the **Hong Kong Personal Data (Privacy) Ordinance (Cap. 486)** and applicable regulations, you have the right to:

| Right                                 | How to Exercise                                                           |
| ------------------------------------- | ------------------------------------------------------------------------- |
| **Access** your personal data         | Contact HYPE for account data; contact {{hub.name \| "HYPE"}} for platform-specific data |
| **Correction** of inaccurate data     | Via account settings or contacting respective party                       |
| **Deletion** of your account and data | Delete your HYPE Account (affects entire ecosystem) or request {{hub.name | "HYPE"}}-specific deletion          |
| **Object** to certain processing      | Contact the relevant controller with your objection                       |
| **Data portability**                  | Request export of your contributions and account data from HYPE           |

**Limitations:** We may retain data where required by law, for legitimate security purposes, or where licensed to projects under Section 4.3 of the Terms.

---

## 8. Security

Both **HYPE** and **{{hub.name | "HYPE"}}** implement appropriate technical and organisational measures to protect your data, including:

- Encryption in transit (TLS) and at rest
- Access controls and authentication
- Regular security assessments
- Incident response procedures

No system is completely secure. You are responsible for maintaining the confidentiality of your account credentials.

---

## 9. International Transfers

HYPE infrastructure may utilise servers and service providers located outside Hong Kong. By using the service, you consent to transfer of your data to these locations, subject to appropriate safeguards.

---

## 10. Cookies & Similar Technologies

Both **HYPE** and **{{hub.name | "HYPE"}}** use cookies and similar technologies for:

- Authentication and session management
- Reconnecting a guest account to its server-side preferences and saved-place state
- Service functionality
- Analytics and service improvement

You can manage cookie preferences through your browser settings. Essential cookies for service operation cannot be disabled.

---

## 11. Changes to This Policy

We may update this Privacy Policy. Material changes will be notified via:

- Email to your registered address
- Notice on this Platform
- Notification through your HYPE Account

Continued use after changes constitutes acceptance.

---

## 12. Contact

| Party        | Contact           | For Issues Relating To                                       |
| ------------ | ----------------- | ------------------------------------------------------------ |
| **{{hub.name \| "HYPE"}}**        | [{{hub.legalContactAddress \| "privacy@hype.hk"}}] | Platform-specific data, project participation, local content |
| **HYPE**     | [privacy@hype.hk] | Account data, ecosystem-wide activity, attribution, security |

**Data Protection Officer (HYPE):**
<br>Mart van de Ven
<br>14/F, 8 Hennessy Rd,
<br>Wan Chai, Hong Kong

---

## 13. Governing Law

This Privacy Policy is governed by the laws of the **Hong Kong Special Administrative Region**.
