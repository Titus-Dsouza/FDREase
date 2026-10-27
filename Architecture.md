# Architecture.md — AICTE FDR Portal

## Tech Stack
- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Python, Django, Django REST Framework
- **Database:** PostgreSQL
- **Document Processing:** OCR for PDF and image text extraction
- **AI:** API-based document analysis with rule-based fallback

## System Architecture

1. **Frontend:** Institution and AICTE Official dashboards.
2. **Backend:** Handles authentication, FDR submissions, validation, and application status.
3. **Document Processing:** Extracts FDR details and checks for inconsistencies.
4. **AI Layer:** Explains potential issues for official review.
5. **Database:** Stores users, FDR records, statuses, and review history.

## Data Flow

Institution uploads FDR → Backend stores document → OCR extracts details → Validation and AI checks → Official reviews results → Decision and status are saved → Institution sees the update.

## Security
- Role-based access for institutions and officials.
- Store secrets in environment variables.
- Validate uploaded files and restrict access to documents.
- Keep an audit trail of important actions.

## Important
AI assists with document review but does not make final regulatory decisions. Real bank verification requires an authorized integration.
