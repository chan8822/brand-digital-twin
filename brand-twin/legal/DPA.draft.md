# Data Processing Addendum

> **DRAFT FOR COUNSEL REVIEW — NOT IN EFFECT.** Non-lawyer draft prepared for legal
> review. Not legal advice. All `[BRACKETED]` tokens must be resolved before publish
> (see `README.md`).

**Version:** `[VERSION]` · **Effective:** `[EFFECTIVE DATE]`

This Data Processing Addendum ("**DPA**") forms part of the Terms of Service between
the Customer ("**Controller**") and `Trending Media Service Pvt. Ltd.` ("**Processor**", "**we**")
and applies to our processing of personal data on the Controller's behalf in providing
the Service. Where terms are defined in the GDPR or the India DPDP Act, those meanings
apply. In case of conflict on data protection, this DPA prevails over the Terms.

## 1. Roles and scope

The Controller determines the purposes and means of processing the personal data it
connects or uploads ("**Customer Personal Data**"); we process it only as a Processor
(a "Data Processor"/"Data Fiduciary's processor" as applicable) on the Controller's
documented instructions, which include the Terms, this DPA, and configuration in the
Service (including Trust Tier and spend-cap settings that authorize actions).

## 2. Details of processing (Annex A)

- **Subject matter:** provision of the Brand Digital Twin Service.
- **Duration:** the term of the subscription plus the retention periods in Section 9.
- **Nature and purpose:** ingesting advertising, commerce, and accounting data;
  computing POAS and diagnostics; generating and, where authorized, executing
  recommendations; billing; support; security; and measurement.
- **Categories of data subjects:** the Controller's authorized users; and individuals
  reflected in connected advertising/commerce data (e.g. end customers, to the extent
  identifiers such as click IDs or order records are present).
- **Categories of personal data:** account/identity data; advertising and commerce
  metrics; transaction identifiers (e.g. click IDs, order totals); cost data; usage and
  log data. The Service is not intended for special-category data; the Controller must
  not submit it.

## 3. Processor obligations

We will: (a) process Customer Personal Data only on the Controller's documented
instructions, including for international transfers, unless required by law (and then
we will inform the Controller unless legally prohibited); (b) ensure persons authorized
to process are bound by confidentiality; (c) implement the security measures in
Section 6; (d) respect the conditions for engaging subprocessors in Section 4;
(e) assist the Controller, taking into account the nature of processing, with data-
subject requests (Section 5) and with security, breach notification, and data
protection impact assessments; and (f) at the Controller's choice, delete or return
Customer Personal Data on termination (Section 9).

If we believe an instruction infringes applicable data protection law, we will inform
the Controller.

## 4. Subprocessors

The Controller authorizes us to engage subprocessors to provide the Service. Current
subprocessors are listed at `[SUBPROCESSOR LIST URL]` and include hosting/database,
queueing, payment processing, and the advertising/commerce/accounting platforms the
Controller connects. We impose data protection obligations on subprocessors no less
protective than this DPA and remain responsible for their performance. We will give
notice of intended additions or replacements and a reasonable opportunity to object on
reasonable data protection grounds.

## 5. Data subject rights

Taking into account the nature of the processing, we will assist the Controller by
appropriate technical and organizational measures, insofar as possible, to respond to
data-subject requests. The Service provides **self-service export** (a signed export)
and **deletion** (a hard-delete cascade that also revokes connected credentials). If we
receive a request directly from a data subject, we will not respond except on the
Controller's instruction or as legally required, and will promptly inform the
Controller.

## 6. Security measures (Annex B)

We maintain technical and organizational measures appropriate to the risk, including:

- Encryption of data in transit and at rest.
- **Request-scoped database access to enforce tenant isolation** between Controllers.
- An encrypted credential vault for connected-platform tokens, with revocation on
  disconnection or account deletion.
- Secret management and boot-time validation of required secrets.
- **Redaction and anonymization of identifiers and access tokens in error/log events.**
- Access controls, least-privilege, and audit logging.
- Rate limiting and per-tenant spend caps enforced by the governance engine.
- Versioned database migrations with tested backup and restore procedures.
- A documented incident-response process with a severity model (SEV-0–SEV-3) and
  alerting.

## 7. Personal data breach

We will notify the Controller without undue delay after becoming aware of a personal
data breach affecting Customer Personal Data, with information reasonably available to
assist the Controller's own notification obligations, and will take reasonable steps to
mitigate and remediate.

## 8. International transfers

Where we transfer Customer Personal Data across borders, we will rely on a valid
transfer mechanism (e.g. **Standard Contractual Clauses** for GDPR transfers) and
equivalent mechanisms under other applicable laws. The relevant clauses are
incorporated by reference and prevail in case of conflict. *(Counsel: attach/confirm
SCC modules and any India DPDP transfer rules.)*

## 9. Return and deletion

On termination or at the Controller's request, we will delete or return Customer
Personal Data and delete existing copies within `[RETENTION — POST-TERMINATION]`,
except to the extent retention is required by law. Connected-platform credentials are
revoked as part of the deletion cascade.

## 10. Audits

We will make available information reasonably necessary to demonstrate compliance with
this DPA and allow for and contribute to audits, including inspections, conducted by
the Controller or an auditor it mandates, subject to reasonable confidentiality, notice,
frequency, and scope limits. *(Counsel: define cadence and cost-bearing.)*

## 11. Liability and miscellany

Each party's liability under this DPA is subject to the limitations of liability in
the Terms. This DPA is governed by the laws of India. If any provision conflicts with a
mandatory requirement of applicable data protection law, that law controls.

**Processor contact:** `Trending Media Service Pvt. Ltd.`, `Aashiana Palace, Karni Nagar, Samta Nagar, Lalgarh, Bikaner, Rajasthan, India` ·
`admin@trendingmediagroup.in` · Grievance Officer: admin@trendingmediagroup.in *(named officer to be designated)*
