# PRD.md — AICTE FDR Portal

## 1. Purpose
Streamline the submission, validation, review, and tracking of institutional Fixed Deposit Receipts (FDRs) and security deposits.

## 2. Users
- **Institutions:** Submit FDRs and track applications.
- **AICTE Officials:** Review documents and record decisions.
- **Admin:** Manage users and system settings, if required.

## 3. Core Features
- FDR details form and document upload.
- OCR-based data extraction.
- Automated checks for missing details, date and amount mismatches, and duplicates.
- AI-generated explanations of potential issues.
- Application status tracking and correction requests.
- Maturity reminders and review history.

## 4. Main Pages
- Landing page and login.
- Institution dashboard.
- FDR submission and application details.
- AICTE Official dashboard and review page.

## 5. Technology
HTML, CSS, JavaScript, Django REST Framework, PostgreSQL, OCR, and an AI API.

## 6. MVP Scope
Build the dashboards, submission workflow, document checks, and official review process first. Use clearly labelled demo data where real integrations are unavailable.

## 7. Success Criteria
- Institutions can submit and track FDR applications.
- Officials can review documents and record decisions.
- Validation warnings explain potential issues.
- The complete workflow works reliably in the SIH demo.

## 8. Constraints
AI does not make final regulatory decisions. Bank verification must not be simulated as genuine verification. Protect uploaded documents and user data.
