from django.urls import path
from .views import TVConfigView, TVMidiaView, TVMidiaDetailView, TVPublicView

urlpatterns = [
    path('config/',          TVConfigView.as_view(),      name='tv_config'),
    path('midia/',           TVMidiaView.as_view(),        name='tv_midia_list'),
    path('midia/<int:pk>/',  TVMidiaDetailView.as_view(),  name='tv_midia_detail'),
    path('public/<str:token>/', TVPublicView.as_view(),    name='tv_public'),
]
