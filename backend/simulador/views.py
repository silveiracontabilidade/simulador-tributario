from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import NotFound
from django.db.models import Sum

from .models import (
    Empresa, Simulacao, Resultado,
    CnaeImpedimento, CnaeAnexo, AnexoSimples, FaixaSimples,
    BasePresumido, AliquotaFixa, AliquotaFederal
)
from .serializers import (
    EmpresaSerializer, SimulacaoSerializer, ResultadoSerializer,
    CnaeImpedimentoSerializer, CnaeAnexoSerializer, AnexoSimplesSerializer, FaixaSimplesSerializer,
    BasePresumidoSerializer, AliquotaFixaSerializer, AliquotaFederalSerializer,
    BalanceteDeParaItemSerializer,
)
from .services.calculadora import CalculadoraTributaria, _q
from .services.firebird_balancete import obter_balancete, BalanceteError
from .services.depara_storage import (
    list_entries as listar_depara,
    create_entry as criar_depara,
    get_entry as obter_depara,
    update_entry as atualizar_depara,
    delete_entry as remover_depara,
)


# ------------------------
# EMPRESA
# ------------------------
class EmpresaViewSet(viewsets.ModelViewSet):
    queryset = Empresa.objects.all()
    serializer_class = EmpresaSerializer

    @action(detail=False, methods=["get"], url_path="buscar-por-cnpj")
    def buscar_por_cnpj(self, request):
        raw_cnpj = request.query_params.get("cnpj")
        if not raw_cnpj:
            return Response({"detail": "Parâmetro 'cnpj' é obrigatório."}, status=status.HTTP_400_BAD_REQUEST)

        digits = "".join(ch for ch in str(raw_cnpj) if ch.isdigit())
        if not digits:
            return Response({"detail": "CNPJ inválido."}, status=status.HTTP_400_BAD_REQUEST)

        empresa = None
        for item in Empresa.objects.all():
            cnpj_item = "".join(ch for ch in str(item.cnpj or "") if ch.isdigit())
            if cnpj_item == digits:
                empresa = item
                break

        if not empresa:
            return Response({"detail": "Empresa não encontrada."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(empresa)
        return Response(serializer.data)


# ------------------------
# SIMULAÇÃO
# ------------------------
class SimulacaoViewSet(viewsets.ModelViewSet):
    queryset = Simulacao.objects.all().order_by("-id")
    serializer_class = SimulacaoSerializer

    @action(detail=True, methods=["post"])
    def processar(self, request, pk=None):
        sim = self.get_object()
        meses = int(request.query_params.get("meses", "1"))
        calc = CalculadoraTributaria(sim, meses_no_periodo=meses)
        resultado = calc.processar()
        return Response({"ok": True, "resultado": resultado})

    @action(detail=True, methods=["get"])
    def comparativo(self, request, pk=None):
        sim = self.get_object()
        # Totais por regime
        totais = (
            Resultado.objects
            .filter(simulacao=sim)
            .values("regime")
            .annotate(total=Sum("valor"))
        )
        by_regime = {t["regime"]: _q(t["total"]) for t in totais}

        receita = _q(sim.receita_total) if sim.receita_total else _q(0)
        carga = {}
        for regime, total in by_regime.items():
            carga[regime] = f"{(_q(0) if receita == 0 else (total / receita * 100)).quantize(_q(0.01)):.2f}"

        # detalhamento por regime
        detalhado = {}
        for regime in ["Simples", "Presumido", "Real"]:
            linhas = Resultado.objects.filter(simulacao=sim, regime=regime).values("imposto", "valor")
            detalhado[regime] = {l["imposto"]: f"{_q(l['valor']):.2f}" for l in linhas}

        # vencedor
        regime_vencedor = None
        if by_regime:
            regime_vencedor = min(by_regime.keys(), key=lambda r: by_regime[r])

        return Response({
            "simulacao_id": sim.id,
            "receita_total": f"{receita:.2f}",
            "totais": {k: f"{v:.2f}" for k, v in by_regime.items()},
            "carga_percent": carga,
            "vencedor": regime_vencedor,
            "detalhado": detalhado,
        })


# ------------------------
# RESULTADO
# ------------------------
class ResultadoViewSet(viewsets.ModelViewSet):
    queryset = Resultado.objects.all()
    serializer_class = ResultadoSerializer


# ------------------------
# TABELAS AUXILIARES
# ------------------------
class CnaeImpedimentoViewSet(viewsets.ModelViewSet):
    queryset = CnaeImpedimento.objects.all()
    serializer_class = CnaeImpedimentoSerializer


class CnaeAnexoViewSet(viewsets.ModelViewSet):
    queryset = CnaeAnexo.objects.all()
    serializer_class = CnaeAnexoSerializer


class AnexoSimplesViewSet(viewsets.ModelViewSet):
    queryset = AnexoSimples.objects.all()
    serializer_class = AnexoSimplesSerializer


class FaixaSimplesViewSet(viewsets.ModelViewSet):
    queryset = FaixaSimples.objects.all()
    serializer_class = FaixaSimplesSerializer


class BasePresumidoViewSet(viewsets.ModelViewSet):
    queryset = BasePresumido.objects.all()
    serializer_class = BasePresumidoSerializer


class AliquotaFixaViewSet(viewsets.ModelViewSet):
    queryset = AliquotaFixa.objects.all()
    serializer_class = AliquotaFixaSerializer


class AliquotaFederalViewSet(viewsets.ModelViewSet):
    queryset = AliquotaFederal.objects.all()
    serializer_class = AliquotaFederalSerializer


class BalanceteDeParaViewSet(viewsets.ViewSet):
    """
    CRUD baseado em arquivo JSON para o DE-PARA do balancete.
    """

    def list(self, request):
        return Response(listar_depara())

    def create(self, request):
        serializer = BalanceteDeParaItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        novo = criar_depara(serializer.validated_data)
        return Response(novo, status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        item = obter_depara(pk)
        if not item:
            raise NotFound("Item de DE-PARA não encontrado.")
        return Response(item)

    def update(self, request, pk=None):
        existente = obter_depara(pk)
        if not existente:
            raise NotFound("Item de DE-PARA não encontrado.")
        serializer = BalanceteDeParaItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        atualizado = atualizar_depara(pk, serializer.validated_data)
        return Response(atualizado)

    def destroy(self, request, pk=None):
        sucesso = remover_depara(pk)
        if not sucesso:
            raise NotFound("Item de DE-PARA não encontrado.")
        return Response(status=status.HTTP_204_NO_CONTENT)


class BalanceteAPIView(APIView):
    """
    Retorna o balancete do SCI em formato JSON.
    """

    def get(self, request):
        empresa = request.query_params.get("empresa")
        data_inicio = request.query_params.get("data_inicio")
        data_fim = request.query_params.get("data_fim")
        competencia = request.query_params.get("comp_ref")

        missing = [
            nome for nome, valor in [
                ("empresa", empresa),
                ("data_inicio", data_inicio),
                ("data_fim", data_fim),
                ("comp_ref", competencia),
            ] if not valor
        ]
        if missing:
            return Response(
                {"detail": f"Parâmetros obrigatórios ausentes: {', '.join(missing)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            empresa_int = int(empresa)
        except (TypeError, ValueError):
            return Response(
                {"detail": "O parâmetro 'empresa' deve ser numérico."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            resultado = obter_balancete(
                empresa=empresa_int,
                data_inicio=data_inicio,
                data_fim=data_fim,
                competencia_ref=competencia,
            )
        except BalanceteError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(resultado)
