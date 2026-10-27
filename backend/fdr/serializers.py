"""
FDREase — DRF serializers.
"""
import os
from decimal import Decimal
from django.conf import settings
from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Institution, FDRSubmission, ReviewNote


# ─── Helpers ─────────────────────────────────────────────────────────────────

ALLOWED_EXTENSIONS = getattr(settings, 'ALLOWED_UPLOAD_EXTENSIONS', ['.pdf', '.jpg', '.jpeg', '.png'])
MAX_UPLOAD_MB      = getattr(settings, 'MAX_UPLOAD_SIZE_MB', 10)


def validate_receipt_file(file):
    """Shared file validator: extension + size."""
    if file:
        ext = os.path.splitext(file.name)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise serializers.ValidationError(
                f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
            )
        if file.size > MAX_UPLOAD_MB * 1024 * 1024:
            raise serializers.ValidationError(
                f"File too large. Maximum size is {MAX_UPLOAD_MB} MB."
            )
    return file


# ─── Institution ──────────────────────────────────────────────────────────────

class InstitutionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Institution
        fields = ['id', 'name', 'code', 'city', 'state', 'contact_email', 'created_at']
        read_only_fields = ['id', 'created_at']


# ─── Review Note ──────────────────────────────────────────────────────────────

class ReviewNoteSerializer(serializers.ModelSerializer):
    reviewed_by_username = serializers.CharField(
        source='reviewed_by.username', read_only=True, default=''
    )

    class Meta:
        model = ReviewNote
        fields = ['id', 'from_status', 'to_status', 'comment', 'reviewed_by_username', 'created_at']
        read_only_fields = ['id', 'from_status', 'to_status', 'reviewed_by_username', 'created_at']


# ─── FDR Submission — list / detail ──────────────────────────────────────────

class FDRSubmissionSerializer(serializers.ModelSerializer):
    institution_name = serializers.CharField(source='institution.name', read_only=True)
    receipt_file_url = serializers.SerializerMethodField()
    review_notes     = ReviewNoteSerializer(many=True, read_only=True)

    class Meta:
        model = FDRSubmission
        fields = [
            'id', 'institution', 'institution_name',
            'fdr_number', 'bank_name', 'amount', 'issue_date', 'maturity_date',
            'receipt_file_url', 'receipt_filename',
            'status', 'notes',
            'created_at', 'updated_at',
            'review_notes',
        ]
        read_only_fields = ['id', 'institution_name', 'receipt_file_url', 'created_at', 'updated_at', 'review_notes']

    def get_receipt_file_url(self, obj):
        if obj.receipt_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.receipt_file.url)
        return None


# ─── FDR Submission — create / update by institution ─────────────────────────

class FDRSubmissionCreateSerializer(serializers.ModelSerializer):
    receipt_file = serializers.FileField(required=False, allow_null=True)

    class Meta:
        model = FDRSubmission
        fields = [
            'id', 'fdr_number', 'bank_name', 'amount', 'issue_date', 'maturity_date',
            'receipt_file', 'notes', 'status',
        ]
        read_only_fields = ['id', 'status']

    def validate_receipt_file(self, value):
        return validate_receipt_file(value)

    def validate_fdr_number(self, value):
        val = (value or '').strip()
        if not val:
            raise serializers.ValidationError("FDR number is required and cannot be empty.")
        # Check duplicate within the same institution
        request = self.context.get('request')
        inst = None
        if request and hasattr(request.user, 'institution'):
            inst = request.user.institution

        qs = FDRSubmission.objects.filter(fdr_number__iexact=val)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if inst:
            qs = qs.filter(institution=inst)
        if qs.exists():
            raise serializers.ValidationError(f"An FDR submission with number '{val}' already exists for this institution.")
        return val

    def validate_amount(self, value):
        if value is None or value <= Decimal('0'):
            raise serializers.ValidationError("Amount is required and must be greater than zero.")
        return value

    def validate_maturity_date(self, value):
        from datetime import date
        if value is None or value < date.today():
            raise serializers.ValidationError("Maturity date is required and cannot be in the past or expired.")
        return value

    def validate(self, data):
        # On creation (self.instance is None), an FDR receipt file is mandatory
        if self.instance is None and not data.get('receipt_file'):
            raise serializers.ValidationError({
                "receipt_file": "An FDR receipt document (PDF, JPG, or PNG) is mandatory."
            })
        return data

    def create(self, validated_data):
        receipt = validated_data.pop('receipt_file', None)
        submission = FDRSubmission(**validated_data)
        if receipt:
            submission.receipt_filename = receipt.name
            submission.receipt_file = receipt
        submission.save()
        return submission


# ─── Official review action ───────────────────────────────────────────────────

class ReviewActionSerializer(serializers.Serializer):
    action  = serializers.ChoiceField(choices=['approve', 'reject', 'correction', 'review'])
    comment = serializers.CharField(required=False, allow_blank=True, default='')

    ACTION_STATUS_MAP = {
        'approve':    FDRSubmission.Status.APPROVED,
        'reject':     FDRSubmission.Status.REJECTED,
        'correction': FDRSubmission.Status.CORRECTION,
        'review':     FDRSubmission.Status.UNDER_REVIEW,
    }

    def validate(self, data):
        submission = self.context['submission']
        action = data['action']
        target_status = self.ACTION_STATUS_MAP[action]
        allowed = FDRSubmission.OFFICIAL_TRANSITIONS.get(submission.status, [])
        if target_status not in allowed:
            raise serializers.ValidationError(
                f"Cannot move from '{submission.status}' to '{target_status}'."
            )

        # 1. Document is mandatory for Approval
        if action == 'approve':
            if not submission.receipt_file and not submission.receipt_filename:
                raise serializers.ValidationError({
                    "receipt_file": "Cannot approve submission: An FDR receipt document is mandatory and has not been uploaded."
                })

        # 2. Reason is mandatory when requesting corrections
        if action == 'correction':
            comment = data.get('comment', '').strip()
            if not comment:
                raise serializers.ValidationError({
                    "comment": "A reason for correction is required when returning a submission to the institution."
                })

        # 3. Reason is mandatory when rejecting
        if action == 'reject':
            comment = data.get('comment', '').strip()
            if not comment:
                raise serializers.ValidationError({
                    "comment": "A rejection reason is required when rejecting a submission."
                })

        data['target_status'] = target_status
        return data


# ─── Auth ─────────────────────────────────────────────────────────────────────

class UserRegistrationSerializer(serializers.ModelSerializer):
    """For institution self-registration (development)."""
    password          = serializers.CharField(write_only=True, min_length=8)
    institution_name  = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'institution_name']

    def create(self, validated_data):
        institution_name = validated_data.pop('institution_name')
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        Institution.objects.create(name=institution_name, user=user)
        return user
