"""
FDREase — seed_data management command.
Populates official and 5 consistent fictional institution demo accounts with FDR submissions.
Run with: python manage.py seed_data
"""
from decimal import Decimal
from datetime import date, timedelta
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from rest_framework.authtoken.models import Token
from fdr.models import Institution, FDRSubmission, ReviewNote

SAMPLE_PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n150\n%%EOF\n"


class Command(BaseCommand):
    help = "Seed database with official and fictional institution demo accounts and FDR records."

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Seeding FDREase database with consistent fictional demo data..."))

        # 1. Official Admin
        official_user, _ = User.objects.get_or_create(
            username="official_admin",
            defaults={
                "email": "official@aicte.gov.in",
                "is_staff": True,
                "is_superuser": True,
            }
        )
        official_user.set_password("OfficialPassword123!")
        official_user.is_staff = True
        official_user.is_superuser = True
        official_user.save()
        Token.objects.get_or_create(user=official_user)
        self.stdout.write(self.style.SUCCESS("✓ Official user ready: official_admin / OfficialPassword123! (AICTE Official)"))

        # Map of fictional institutions to ensure safe in-place migration without duplicates
        # Legacy usernames mapping: mit_pune -> xyz_institute, vit_vellore -> northstar_institute
        if User.objects.filter(username="mit_pune").exists() and not User.objects.filter(username="xyz_institute").exists():
            u = User.objects.get(username="mit_pune")
            u.username = "xyz_institute"
            u.email = "contact@xyz.edu"
            u.save()
        if Institution.objects.filter(name="MIT World Peace University, Pune").exists():
            inst = Institution.objects.get(name="MIT World Peace University, Pune")
            inst.name = "XYZ Institute"
            inst.code = "XYZ-INST-01"
            inst.contact_email = "contact@xyz.edu"
            inst.save()

        if User.objects.filter(username="vit_vellore").exists() and not User.objects.filter(username="northstar_institute").exists():
            u = User.objects.get(username="vit_vellore")
            u.username = "northstar_institute"
            u.email = "contact@northstar.edu"
            u.save()
        if Institution.objects.filter(name="Vellore Institute of Technology").exists():
            inst = Institution.objects.get(name="Vellore Institute of Technology")
            inst.name = "Northstar Institute of Technology"
            inst.code = "NORTHSTAR-02"
            inst.contact_email = "contact@northstar.edu"
            inst.save()

        fictional_institutions = [
            {
                "username": "xyz_institute",
                "name": "XYZ Institute",
                "code": "XYZ-INST-01",
                "city": "Pune",
                "state": "Maharashtra",
                "email": "contact@xyz.edu",
            },
            {
                "username": "northstar_institute",
                "name": "Northstar Institute of Technology",
                "code": "NORTHSTAR-02",
                "city": "Vellore",
                "state": "Tamil Nadu",
                "email": "contact@northstar.edu",
            },
            {
                "username": "crescent_valley",
                "name": "Crescent Valley University",
                "code": "CRESCENT-03",
                "city": "Hyderabad",
                "state": "Telangana",
                "email": "contact@crescent.edu",
            },
            {
                "username": "westbridge_institute",
                "name": "Westbridge Institute of Science",
                "code": "WESTBRIDGE-04",
                "city": "Bengaluru",
                "state": "Karnataka",
                "email": "contact@westbridge.edu",
            },
            {
                "username": "pinecrest_university",
                "name": "Pinecrest Technical University",
                "code": "PINECREST-05",
                "city": "Chandigarh",
                "state": "Punjab",
                "email": "contact@pinecrest.edu",
            },
        ]

        inst_map = {}
        user_map = {}

        for item in fictional_institutions:
            u, _ = User.objects.get_or_create(
                username=item["username"],
                defaults={"email": item["email"]}
            )
            u.set_password("InstitutionPass123!")
            u.email = item["email"]
            u.save()
            Token.objects.get_or_create(user=u)
            user_map[item["username"]] = u

            inst, _ = Institution.objects.get_or_create(
                name=item["name"],
                defaults={
                    "code": item["code"],
                    "city": item["city"],
                    "state": item["state"],
                    "contact_email": item["email"],
                    "user": u,
                }
            )
            if inst.user != u or inst.code != item["code"]:
                inst.user = u
                inst.code = item["code"]
                inst.city = item["city"]
                inst.state = item["state"]
                inst.contact_email = item["email"]
                inst.save()
            inst_map[item["username"]] = inst
            self.stdout.write(self.style.SUCCESS(f"✓ Fictional institution ready: {item['name']} ({item['username']})"))

        # Seed sample submissions for fictional institutions
        today = date.today()
        sample_submissions = [
            {
                "institution": inst_map["xyz_institute"],
                "submitted_by": user_map["xyz_institute"],
                "fdr_number": "FDR-2025-001",
                "bank_name": "State Bank of India",
                "amount": Decimal("2500000.00"),
                "maturity_date": today + timedelta(days=365),
                "receipt_filename": "xyz_fdr_receipt.pdf",
                "status": FDRSubmission.Status.APPROVED,
                "notes": "Approved for 2025-2026 academic year.",
            },
            {
                "institution": inst_map["xyz_institute"],
                "submitted_by": user_map["xyz_institute"],
                "fdr_number": "FDR-2025-003",
                "bank_name": "Punjab National Bank",
                "amount": Decimal("3200000.00"),
                "maturity_date": today + timedelta(days=240),
                "receipt_filename": "xyz_fdr_branch.pdf",
                "status": FDRSubmission.Status.UNDER_REVIEW,
                "notes": "Under physical verification by AICTE regional office.",
            },
            {
                "institution": inst_map["northstar_institute"],
                "submitted_by": user_map["northstar_institute"],
                "fdr_number": "FDR-2025-002",
                "bank_name": "HDFC Bank",
                "amount": Decimal("1800000.00"),
                "maturity_date": today + timedelta(days=300),
                "receipt_filename": "northstar_deposit.pdf",
                "status": FDRSubmission.Status.SUBMITTED,
                "notes": "New course intake deposit.",
            },
            {
                "institution": inst_map["northstar_institute"],
                "submitted_by": user_map["northstar_institute"],
                "fdr_number": "FDR-2025-004",
                "bank_name": "Bank of Baroda",
                "amount": Decimal("1500000.00"),
                "maturity_date": today + timedelta(days=180),
                "receipt_filename": "northstar_fdr_scan.jpg",
                "status": FDRSubmission.Status.CORRECTION,
                "notes": "Bank seal is faint; please upload high-res scan.",
            },
            {
                "institution": inst_map["crescent_valley"],
                "submitted_by": user_map["crescent_valley"],
                "fdr_number": "FDR-2025-005",
                "bank_name": "Canara Bank",
                "amount": Decimal("2000000.00"),
                "maturity_date": today + timedelta(days=210),
                "receipt_filename": "crescent_fdr.pdf",
                "status": FDRSubmission.Status.SUBMITTED,
                "notes": "New polytechnic wing security deposit.",
            },
            {
                "institution": inst_map["westbridge_institute"],
                "submitted_by": user_map["westbridge_institute"],
                "fdr_number": "FDR-2025-006",
                "bank_name": "ICICI Bank",
                "amount": Decimal("5000000.00"),
                "maturity_date": today + timedelta(days=120),
                "receipt_filename": "westbridge_deposit.pdf",
                "status": FDRSubmission.Status.REJECTED,
                "notes": "Joint FDR not drawn in favour of Member Secretary, AICTE.",
            },
            {
                "institution": inst_map["pinecrest_university"],
                "submitted_by": user_map["pinecrest_university"],
                "fdr_number": "FDR-2025-007",
                "bank_name": "Union Bank of India",
                "amount": Decimal("2800000.00"),
                "maturity_date": today + timedelta(days=400),
                "receipt_filename": "pinecrest_fdr.pdf",
                "status": FDRSubmission.Status.APPROVED,
                "notes": "Approved for 2026-2027 academic intake.",
            },
        ]

        created_count = 0
        for item in sample_submissions:
            fdr_num = item["fdr_number"]
            sub = FDRSubmission.objects.filter(fdr_number=fdr_num).first()
            if not sub:
                sub = FDRSubmission.objects.create(**item)
                created_count += 1
            else:
                # Update existing submission fields to ensure fictional naming & association
                sub.institution = item["institution"]
                sub.submitted_by = item["submitted_by"]
                sub.bank_name = item["bank_name"]
                sub.amount = item["amount"]
                sub.maturity_date = item["maturity_date"]
                sub.receipt_filename = item["receipt_filename"]
                sub.status = item["status"]
                sub.notes = item["notes"]
                sub.save()

            if not sub.receipt_file and item.get("receipt_filename"):
                sub.receipt_file.save(
                    item["receipt_filename"],
                    ContentFile(SAMPLE_PDF),
                    save=True
                )

            # Ensure review notes match
            if sub.status == FDRSubmission.Status.APPROVED and not sub.review_notes.filter(to_status=FDRSubmission.Status.APPROVED).exists():
                ReviewNote.objects.create(
                    submission=sub,
                    reviewed_by=official_user,
                    from_status=FDRSubmission.Status.SUBMITTED,
                    to_status=FDRSubmission.Status.APPROVED,
                    comment="Verified AICTE joint FDR format and amount.",
                )
            elif sub.status == FDRSubmission.Status.CORRECTION and not sub.review_notes.filter(to_status=FDRSubmission.Status.CORRECTION).exists():
                ReviewNote.objects.create(
                    submission=sub,
                    reviewed_by=official_user,
                    from_status=FDRSubmission.Status.SUBMITTED,
                    to_status=FDRSubmission.Status.CORRECTION,
                    comment=sub.notes,
                )
            elif sub.status == FDRSubmission.Status.REJECTED and not sub.review_notes.filter(to_status=FDRSubmission.Status.REJECTED).exists():
                ReviewNote.objects.create(
                    submission=sub,
                    reviewed_by=official_user,
                    from_status=FDRSubmission.Status.SUBMITTED,
                    to_status=FDRSubmission.Status.REJECTED,
                    comment=sub.notes,
                )

        # Clean up any leftover temporary scratch test records like FDR-AUDIT-* or FDR-2025-999 if present
        FDRSubmission.objects.filter(fdr_number__startswith="FDR-AUDIT-").delete()
        FDRSubmission.objects.filter(fdr_number="FDR-2025-999").delete()

        self.stdout.write(self.style.SUCCESS(f"✓ Total submissions now in DB: {FDRSubmission.objects.count()}"))
        self.stdout.write(self.style.SUCCESS("All fictional seed data initialized successfully!"))
