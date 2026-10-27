"""
FDREase — Backend tests.
Run with: python manage.py test fdr
"""
from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token

from .models import Institution, FDRSubmission, ReviewNote


def make_institution_user(username='inst_user', institution_name='Test College'):
    user = User.objects.create_user(username=username, password='testpass123')
    inst = Institution.objects.create(name=institution_name, user=user)
    token, _ = Token.objects.get_or_create(user=user)
    return user, inst, token


def make_official_user(username='official1'):
    user = User.objects.create_user(username=username, password='testpass123', is_staff=True)
    token, _ = Token.objects.get_or_create(user=user)
    return user, token


def future_date(days=365):
    return (date.today() + timedelta(days=days)).isoformat()


# ─── Model Tests ──────────────────────────────────────────────────────────────

class InstitutionModelTest(TestCase):
    def test_create_institution(self):
        user = User.objects.create_user(username='u1', password='p')
        inst = Institution.objects.create(name='ABC College', user=user)
        self.assertEqual(str(inst), 'ABC College')
        self.assertEqual(user.institution, inst)


class FDRSubmissionModelTest(TestCase):
    def setUp(self):
        self.user, self.inst, _ = make_institution_user()

    def test_create_submission(self):
        sub = FDRSubmission.objects.create(
            institution=self.inst,
            fdr_number='FDR-TEST-001',
            amount=Decimal('100000'),
            maturity_date=date.today() + timedelta(days=365),
        )
        self.assertEqual(sub.status, FDRSubmission.Status.SUBMITTED)
        self.assertIn('FDR-TEST-001', str(sub))

    def test_status_transitions_defined(self):
        self.assertIn(FDRSubmission.Status.SUBMITTED, FDRSubmission.OFFICIAL_TRANSITIONS)


# ─── Auth API Tests ───────────────────────────────────────────────────────────

class AuthAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_register(self):
        r = self.client.post('/api/auth/register/', {
            'username': 'newuser', 'email': 'a@b.com',
            'password': 'securepass1', 'institution_name': 'New College',
        }, format='json')
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.assertIn('token', r.data)
        self.assertEqual(r.data['role'], 'institution')

    def test_login_institution(self):
        make_institution_user('logintest', 'Login College')
        r = self.client.post('/api/auth/login/', {
            'username': 'logintest', 'password': 'testpass123'
        }, format='json')
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertIn('token', r.data)
        self.assertEqual(r.data['role'], 'institution')

    def test_login_official(self):
        make_official_user('offlogin')
        r = self.client.post('/api/auth/login/', {
            'username': 'offlogin', 'password': 'testpass123'
        }, format='json')
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['role'], 'official')

    def test_login_bad_credentials(self):
        r = self.client.post('/api/auth/login/', {
            'username': 'nobody', 'password': 'wrong'
        }, format='json')
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_user_info(self):
        _, _, token = make_institution_user('meuser', 'Me College')
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        r = self.client.get('/api/auth/me/')
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['role'], 'institution')


# ─── Submission API Tests ─────────────────────────────────────────────────────

class SubmissionAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.inst, self.token = make_institution_user()
        self.official, self.off_token = make_official_user()

    def auth_as_institution(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

    def auth_as_official(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.off_token.key}')

    def _create_submission(self, fdr_number='FDR-T-001', amount='250000.00', maturity_date=None, file=True):
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.auth_as_institution()
        data = {
            'fdr_number': fdr_number,
            'amount': amount,
            'maturity_date': maturity_date or future_date(),
        }
        if file:
            data['receipt_file'] = SimpleUploadedFile('test_receipt.pdf', b'%PDF-1.4 test data', content_type='application/pdf')
        return self.client.post('/api/submissions/', data, format='multipart')

    def test_create_submission(self):
        r = self._create_submission()
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.assertEqual(FDRSubmission.objects.count(), 1)

    def test_create_submission_missing_document_rejected(self):
        r = self._create_submission(file=False)
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('receipt_file', str(r.data))

    def test_duplicate_fdr_number_rejected(self):
        r1 = self._create_submission(fdr_number='FDR-DUP-01')
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        r2 = self._create_submission(fdr_number='FDR-DUP-01')
        self.assertEqual(r2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already exists', str(r2.data))

    def test_negative_or_zero_amount_rejected(self):
        r_neg = self._create_submission(fdr_number='FDR-NEG', amount='-500')
        self.assertEqual(r_neg.status_code, status.HTTP_400_BAD_REQUEST)
        r_zero = self._create_submission(fdr_number='FDR-ZERO', amount='0')
        self.assertEqual(r_zero.status_code, status.HTTP_400_BAD_REQUEST)

    def test_past_maturity_date_rejected(self):
        past = (date.today() - timedelta(days=10)).isoformat()
        r = self._create_submission(fdr_number='FDR-PAST', maturity_date=past)
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('past or expired', str(r.data))

    def test_institution_sees_own_submissions_only(self):
        self._create_submission()
        # Create a second institution with a submission
        user2, inst2, tok2 = make_institution_user('inst2', 'Other College')
        FDRSubmission.objects.create(
            institution=inst2, fdr_number='FDR-T-002',
            amount=100000, maturity_date=date.today() + timedelta(days=365)
        )
        self.auth_as_institution()
        r = self.client.get('/api/submissions/')
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        # Should see only own submission
        results = r.data.get('results', r.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['fdr_number'], 'FDR-T-001')

    def test_official_sees_all_submissions(self):
        self._create_submission()
        self.auth_as_official()
        r = self.client.get('/api/submissions/')
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        results = r.data.get('results', r.data)
        self.assertEqual(len(results), 1)

    def test_unauthenticated_rejected(self):
        self.client.credentials()
        r = self.client.get('/api/submissions/')
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_invalid_submission_missing_required(self):
        self.auth_as_institution()
        r = self.client.post('/api/submissions/', {'fdr_number': 'FDR-BAD'}, format='multipart')
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_official_cannot_create_submission(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.auth_as_official()
        r = self.client.post('/api/submissions/', {
            'fdr_number': 'FDR-OFF-001', 'amount': '100000',
            'maturity_date': future_date(),
            'receipt_file': SimpleUploadedFile('test.pdf', b'%PDF-1.4 test', content_type='application/pdf'),
        }, format='multipart')
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)


# ─── Review Action Tests ──────────────────────────────────────────────────────

class ReviewActionTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.inst, self.token = make_institution_user()
        self.official, self.off_token = make_official_user()
        self.sub = FDRSubmission.objects.create(
            institution=self.inst,
            fdr_number='FDR-R-001',
            amount=Decimal('500000'),
            maturity_date=date.today() + timedelta(days=365),
            receipt_filename='xyz_fdr_receipt.pdf',
        )

    def auth_as_official(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.off_token.key}')

    def auth_as_institution(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

    def test_approve_with_document_succeeds(self):
        self.auth_as_official()
        r = self.client.post(f'/api/submissions/{self.sub.id}/review/', {
            'action': 'approve', 'comment': 'All good'
        }, format='json')
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.status, 'Approved')
        self.assertEqual(ReviewNote.objects.count(), 1)

    def test_approve_without_document_blocked(self):
        sub_no_doc = FDRSubmission.objects.create(
            institution=self.inst,
            fdr_number='FDR-NO-DOC',
            amount=Decimal('500000'),
            maturity_date=date.today() + timedelta(days=365),
            receipt_filename='',
            receipt_file=None,
        )
        self.auth_as_official()
        r = self.client.post(f'/api/submissions/{sub_no_doc.id}/review/', {
            'action': 'approve', 'comment': 'Trying without doc'
        }, format='json')
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("receipt_file", str(r.data))

    def test_correction_requires_reason(self):
        self.auth_as_official()
        r = self.client.post(f'/api/submissions/{self.sub.id}/review/', {
            'action': 'correction', 'comment': ''
        }, format='json')
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("comment", str(r.data))

        # With comment -> succeeds
        r2 = self.client.post(f'/api/submissions/{self.sub.id}/review/', {
            'action': 'correction', 'comment': 'Bank seal is illegible'
        }, format='json')
        self.assertEqual(r2.status_code, status.HTTP_200_OK)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.status, 'Correction Required')

    def test_reject_requires_reason(self):
        self.auth_as_official()
        r = self.client.post(f'/api/submissions/{self.sub.id}/review/', {
            'action': 'reject', 'comment': ''
        }, format='json')
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("comment", str(r.data))

        # With comment -> succeeds
        r2 = self.client.post(f'/api/submissions/{self.sub.id}/review/', {
            'action': 'reject', 'comment': 'Maturity date violates policy'
        }, format='json')
        self.assertEqual(r2.status_code, status.HTTP_200_OK)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.status, 'Rejected')

    def test_institution_cannot_review(self):
        self.auth_as_institution()
        r = self.client.post(f'/api/submissions/{self.sub.id}/review/', {
            'action': 'approve'
        }, format='json')
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_invalid_transition(self):
        self.sub.status = 'Approved'
        self.sub.save()
        self.auth_as_official()
        r = self.client.post(f'/api/submissions/{self.sub.id}/review/', {
            'action': 'approve', 'comment': 'Already approved'
        }, format='json')
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)


# ─── Stats Tests ──────────────────────────────────────────────────────────────

class StatsTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.inst, self.token = make_institution_user()
        FDRSubmission.objects.create(
            institution=self.inst, fdr_number='S1',
            amount=100000, maturity_date=date.today() + timedelta(days=365),
            status='Approved'
        )
        FDRSubmission.objects.create(
            institution=self.inst, fdr_number='S2',
            amount=200000, maturity_date=date.today() + timedelta(days=365),
            status='Submitted'
        )

    def test_stats_for_institution(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')
        r = self.client.get('/api/stats/')
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['total'], 2)
        self.assertEqual(r.data['approved'], 1)
        self.assertEqual(r.data['pending'], 1)
