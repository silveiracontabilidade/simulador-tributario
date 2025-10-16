from django.urls import path, include
from rest_framework.routers import DefaultRouter
from simulador.views import (
    EmpresaViewSet,
    SimulacaoViewSet,
    ResultadoViewSet,
    CnaeImpedimentoViewSet,
    CnaeAnexoViewSet,
    AnexoSimplesViewSet,
    FaixaSimplesViewSet,
    BasePresumidoViewSet,
    AliquotaFixaViewSet,
    AliquotaFederalViewSet,
    BalanceteAPIView,
    BalanceteDeParaViewSet,
)

router = DefaultRouter()
# principais
router.register(r"empresas", EmpresaViewSet)
router.register(r"simulacoes", SimulacaoViewSet)
router.register(r"resultados", ResultadoViewSet)

# tabelas auxiliares
router.register(r"cnae-impedimentos", CnaeImpedimentoViewSet)
router.register(r"cnae-anexos", CnaeAnexoViewSet)
router.register(r"anexos-simples", AnexoSimplesViewSet)
router.register(r"faixas-simples", FaixaSimplesViewSet)
router.register(r"base-presumido", BasePresumidoViewSet)
router.register(r"aliquotas-fixas", AliquotaFixaViewSet)
router.register(r"aliquotas-federais", AliquotaFederalViewSet)
router.register(r"balancete-depara", BalanceteDeParaViewSet, basename="balancete-depara")

urlpatterns = [
    path("api/", include(router.urls)),
    path("api/balancete/", BalanceteAPIView.as_view(), name="balancete"),
]
