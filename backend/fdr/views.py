"""
FDREase — API views.
"""
from django.contrib.auth.models import User
from rest_framework import generics, status, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from rest_framework.permissions import IsAuthenticated, AllowAny

from .models import Institution, FDRSubmission, ReviewNote
from .serializers import (
    InstitutionSerializer,
    FDRSubmissionSerializer,
    FDRSubmissionCreateSerializer,
    ReviewActionSerializer,
    UserRegistrationSerializer,
)
from .permissions import IsInstitutionUser, IsOfficialUser, IsInstitutionOrOfficial


# ─── Auth ─────────────────────────────────────────────────────────────────────

class RegisterView(generics.CreateAPIView):
    """
    POST /api/auth/register/
    Register a new institution user. Returns an auth token.
    Open endpoint (no authentication required to register).
    """
    serializer_class = UserRegistrationSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {'token': token.key, 'username': user.username, 'role': 'institution'},
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    """
    POST /api/auth/login/
    Body: { "username": "...", "password": "..." }
    Returns token + role.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        from django.contrib.auth import authenticate
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '')
        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response({'error': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)
        token, _ = Token.objects.get_or_create(user=user)
        role = 'official' if (user.is_staff or user.is_superuser) else 'institution'
        institution_info = None
        if hasattr(user, 'institution'):
            institution_info = {
                'id': user.institution.id,
                'name': user.institution.name,
                'code': user.institution.code,
            }
        return Response({
            'token': token.key,
            'username': user.username,
            'role': role,
            'institution': institution_info,
        })


class LogoutView(APIView):
    """DELETE /api/auth/logout/ — invalidates the user's token."""
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        request.user.auth_token.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """GET /api/auth/me/ — returns current user info."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        role = 'official' if (user.is_staff or user.is_superuser) else 'institution'
        institution = None
        if hasattr(user, 'institution'):
            institution = {'id': user.institution.id, 'name': user.institution.name}
        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'role': role,
            'institution': institution,
        })


# ─── Institutions ─────────────────────────────────────────────────────────────

class InstitutionListView(generics.ListAPIView):
    """GET /api/institutions/ — list all institutions (officials only)."""
    serializer_class = InstitutionSerializer
    permission_classes = [IsOfficialUser]
    queryset = Institution.objects.all()


# ─── FDR Submissions ──────────────────────────────────────────────────────────

class FDRSubmissionListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/submissions/ — list submissions
         Institutions see only their own; officials see all.
    POST /api/submissions/ — create a new submission (institution users only).
    """
    permission_classes = [IsInstitutionOrOfficial]
    filter_backends = [filters.SearchFilter]
    search_fields = ['fdr_number', 'institution__name', 'status']

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return FDRSubmissionCreateSerializer
        return FDRSubmissionSerializer

    def get_queryset(self):
        user = self.request.user
        qs = FDRSubmission.objects.select_related('institution', 'submitted_by').prefetch_related('review_notes')
        # Status filter from query param
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        # Institutions see only their own submissions
        if not (user.is_staff or user.is_superuser):
            if hasattr(user, 'institution'):
                return qs.filter(institution=user.institution)
            return qs.none()
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        if not hasattr(user, 'institution'):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only institution accounts can submit FDRs.")
        serializer.save(
            institution=user.institution,
            submitted_by=user,
            status=FDRSubmission.Status.SUBMITTED,
        )


class FDRSubmissionDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/submissions/<id>/ — retrieve a submission.
    PATCH /api/submissions/<id>/ — institution can update notes/file before official review.
    """
    permission_classes = [IsInstitutionOrOfficial]

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return FDRSubmissionCreateSerializer
        return FDRSubmissionSerializer

    def get_queryset(self):
        user = self.request.user
        qs = FDRSubmission.objects.select_related('institution').prefetch_related('review_notes')
        if not (user.is_staff or user.is_superuser):
            if hasattr(user, 'institution'):
                return qs.filter(institution=user.institution)
            return qs.none()
        return qs


    def perform_update(self, serializer):
        instance = self.get_object()
        receipt = self.request.FILES.get('receipt_file')
        receipt_filename = receipt.name if receipt else instance.receipt_filename

        if instance.status == FDRSubmission.Status.CORRECTION:
            updated = serializer.save(
                status=FDRSubmission.Status.SUBMITTED,
                receipt_filename=receipt_filename,
            )
            ReviewNote.objects.create(
                submission=updated,
                reviewed_by=self.request.user,
                from_status=FDRSubmission.Status.CORRECTION,
                to_status=FDRSubmission.Status.SUBMITTED,
                comment="Institution resubmitted corrected FDR and document for official review.",
            )
        else:
            if receipt:
                serializer.save(receipt_filename=receipt_filename)
            else:
                serializer.save()

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(FDRSubmissionSerializer(instance, context={'request': request}).data)


class ReviewActionView(APIView):
    """
    POST /api/submissions/<id>/review/
    Body: { "action": "approve"|"reject"|"correction"|"review", "comment": "..." }
    Officials only. Validates allowed status transitions.
    """
    permission_classes = [IsOfficialUser]

    def post(self, request, pk):
        try:
            submission = FDRSubmission.objects.get(pk=pk)
        except FDRSubmission.DoesNotExist:
            return Response({'error': 'Submission not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = ReviewActionSerializer(
            data=request.data,
            context={'submission': submission}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        prev_status = submission.status
        target_status = serializer.validated_data['target_status']
        comment = serializer.validated_data.get('comment', '')

        # Record audit note
        ReviewNote.objects.create(
            submission=submission,
            reviewed_by=request.user,
            from_status=prev_status,
            to_status=target_status,
            comment=comment,
        )
        submission.status = target_status
        if comment:
            submission.notes = comment
        submission.save()

        return Response(
            FDRSubmissionSerializer(submission, context={'request': request}).data,
            status=status.HTTP_200_OK,
        )


class StatsView(APIView):
    """
    GET /api/stats/ — aggregate counts for dashboard overview.
    Institutions see stats for their own submissions only.
    Officials see stats for all submissions.
    """
    permission_classes = [IsInstitutionOrOfficial]

    def get(self, request):
        user = request.user
        qs = FDRSubmission.objects.all()
        if not (user.is_staff or user.is_superuser):
            if hasattr(user, 'institution'):
                qs = qs.filter(institution=user.institution)
            else:
                qs = qs.none()

        from django.db.models import Count
        status_counts = {
            item['status']: item['count']
            for item in qs.values('status').annotate(count=Count('id'))
        }
        total = qs.count()
        approved = status_counts.get('Approved', 0)
        pending = status_counts.get('Submitted', 0) + status_counts.get('Under Review', 0)
        corrections = status_counts.get('Correction Required', 0)
        rejected = status_counts.get('Rejected', 0)

        return Response({
            'total': total,
            'approved': approved,
            'pending': pending,
            'corrections': corrections,
            'rejected': rejected,
        })


class HealthCheckView(APIView):
    """
    GET /api/health/
    Public health check that directly tests PostgreSQL database connectivity.
    """
    permission_classes = []

    def get(self, request):
        from django.db import connection
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                cursor.fetchone()
            total_records = FDRSubmission.objects.count()
            return Response({
                'healthy': True,
                'status': 'healthy',
                'database': 'connected',
                'engine': 'postgresql',
                'submissions_count': total_records,
            }, status=status.HTTP_200_OK)
        except Exception as exc:
            return Response({
                'status': 'unhealthy',
                'database': 'disconnected',
                'error': str(exc),
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

