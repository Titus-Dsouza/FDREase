"""FDREase — fdr app URL patterns."""
from django.urls import path
from . import views

urlpatterns = [
    # Auth
    path('auth/register/', views.RegisterView.as_view(),  name='auth-register'),
    path('auth/login/',    views.LoginView.as_view(),     name='auth-login'),
    path('auth/logout/',   views.LogoutView.as_view(),    name='auth-logout'),
    path('auth/me/',       views.MeView.as_view(),        name='auth-me'),

    # Institutions
    path('institutions/',  views.InstitutionListView.as_view(), name='institution-list'),

    # Submissions
    path('submissions/',              views.FDRSubmissionListCreateView.as_view(), name='submission-list-create'),
    path('submissions/<int:pk>/',     views.FDRSubmissionDetailView.as_view(),     name='submission-detail'),
    path('submissions/<int:pk>/review/', views.ReviewActionView.as_view(),         name='submission-review'),

    # Health
    path('health/', views.HealthCheckView.as_view(), name='health-check'),

    # Stats
    path('stats/', views.StatsView.as_view(), name='stats'),
]
