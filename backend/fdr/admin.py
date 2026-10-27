"""FDREase — Django admin registrations."""
from django.contrib import admin
from .models import Institution, FDRSubmission, ReviewNote


@admin.register(Institution)
class InstitutionAdmin(admin.ModelAdmin):
    list_display  = ['name', 'code', 'city', 'state', 'contact_email', 'created_at']
    search_fields = ['name', 'code', 'city']
    list_filter   = ['state']


@admin.register(FDRSubmission)
class FDRSubmissionAdmin(admin.ModelAdmin):
    list_display  = ['fdr_number', 'institution', 'amount', 'maturity_date', 'status', 'created_at']
    list_filter   = ['status']
    search_fields = ['fdr_number', 'institution__name']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(ReviewNote)
class ReviewNoteAdmin(admin.ModelAdmin):
    list_display  = ['submission', 'reviewed_by', 'from_status', 'to_status', 'created_at']
    readonly_fields = ['created_at']
