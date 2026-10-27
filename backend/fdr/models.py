"""
FDREase — Data models.

Three models:
  Institution  — a registered institution (maps to AICTE-registered entity)
  FDRSubmission — a security deposit / FDR record submitted by an institution
  ReviewNote   — an official's review action on a submission
"""
from django.db import models
from django.core.validators import MinValueValidator
from django.contrib.auth.models import User
import os


class Institution(models.Model):
    """An AICTE-registered institution that can submit FDRs."""
    name         = models.CharField(max_length=255, unique=True)
    code         = models.CharField(max_length=50, blank=True, help_text="AICTE institution code")
    city         = models.CharField(max_length=100, blank=True)
    state        = models.CharField(max_length=100, blank=True)
    contact_email = models.EmailField(blank=True)
    # Link to the Django user who represents this institution
    user         = models.OneToOneField(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='institution'
    )
    created_at   = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['name']


def fdr_upload_path(instance, filename):
    """Store uploads under media/fdr/<institution_id>/<filename>."""
    safe_name = os.path.basename(filename)
    inst_id = instance.institution.id if instance.institution_id else 'unknown'
    return f'fdr/{inst_id}/{safe_name}'


class FDRSubmission(models.Model):
    """A Fixed Deposit Receipt / security deposit submission."""

    class Status(models.TextChoices):
        DRAFT       = 'Draft',               'Draft'
        SUBMITTED   = 'Submitted',           'Submitted'
        UNDER_REVIEW = 'Under Review',       'Under Review'
        CORRECTION  = 'Correction Required', 'Correction Required'
        APPROVED    = 'Approved',            'Approved'
        REJECTED    = 'Rejected',            'Rejected'

    # Who submitted
    institution     = models.ForeignKey(
        Institution, on_delete=models.PROTECT,
        related_name='submissions'
    )
    submitted_by    = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='submitted_fdrs'
    )

    # FDR financial details
    fdr_number      = models.CharField(max_length=100, unique=True)
    bank_name       = models.CharField(max_length=255, blank=True)
    amount          = models.DecimalField(
        max_digits=14, decimal_places=2,
        validators=[MinValueValidator(1)],
        help_text="Amount in INR"
    )
    issue_date      = models.DateField(null=True, blank=True)
    maturity_date   = models.DateField()

    # Document
    receipt_file    = models.FileField(
        upload_to=fdr_upload_path, null=True, blank=True,
        help_text="Scanned FDR receipt (PDF/image)"
    )
    receipt_filename = models.CharField(max_length=255, blank=True)

    # Status
    status          = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.SUBMITTED,
    )
    notes           = models.TextField(blank=True, help_text="Optional notes for the institution")

    # Timestamps
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.fdr_number} — {self.institution.name}'

    class Meta:
        ordering = ['-created_at']

    # ── Valid status transitions ──────────────────────────────────────────────
    # Institutions may: Draft → Submitted
    # Officials may:    Submitted/Under Review → Approved | Rejected | Correction Required
    #                   Correction Required    → Under Review (after institution re-submits)
    INSTITUTION_TRANSITIONS = {
        Status.DRAFT: [Status.SUBMITTED],
        Status.CORRECTION: [Status.SUBMITTED],
    }
    OFFICIAL_TRANSITIONS = {
        Status.SUBMITTED:    [Status.UNDER_REVIEW, Status.APPROVED, Status.REJECTED, Status.CORRECTION],
        Status.UNDER_REVIEW: [Status.APPROVED, Status.REJECTED, Status.CORRECTION],
        Status.CORRECTION:   [Status.UNDER_REVIEW, Status.APPROVED, Status.REJECTED],
    }


class ReviewNote(models.Model):
    """Audit trail: every official action on a submission."""
    submission  = models.ForeignKey(
        FDRSubmission, on_delete=models.CASCADE,
        related_name='review_notes'
    )
    reviewed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True,
        related_name='review_notes'
    )
    from_status = models.CharField(max_length=30)
    to_status   = models.CharField(max_length=30)
    comment     = models.TextField(blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.submission.fdr_number}: {self.from_status} → {self.to_status}'

    class Meta:
        ordering = ['-created_at']
