from rest_framework import serializers
from .models import (
    Empresa, Simulacao, Resultado,
    CnaeImpedimento, CnaeAnexo, AnexoSimples, FaixaSimples,
    BasePresumido, AliquotaFixa, AliquotaFederal
)

# ------------------------
# EMPRESAS / SIMULAÇÕES
# ------------------------
class EmpresaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Empresa
        fields = "__all__"
        extra_kwargs = {
            "municipio": {"allow_blank": True, "required": False},
            "uf": {"allow_blank": True, "required": False},
        }


class ResultadoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resultado
        fields = "__all__"


class EmpresaMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Empresa
        fields = ("id", "razao_social", "cnpj")

class SimulacaoSerializer(serializers.ModelSerializer):
    empresa = EmpresaMiniSerializer(read_only=True)
    empresa_id = serializers.PrimaryKeyRelatedField(
        queryset=Empresa.objects.all(),
        source="empresa",
        write_only=True
    )
    resultados = ResultadoSerializer(many=True, read_only=True)

    class Meta:
        model = Simulacao
        fields = "__all__"


# ------------------------
# TABELAS AUXILIARES
# ------------------------
class CnaeImpedimentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CnaeImpedimento
        fields = "__all__"


class CnaeAnexoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CnaeAnexo
        fields = "__all__"


class AnexoSimplesSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnexoSimples
        fields = "__all__"


class FaixaSimplesSerializer(serializers.ModelSerializer):
    class Meta:
        model = FaixaSimples
        fields = "__all__"


class BasePresumidoSerializer(serializers.ModelSerializer):
    class Meta:
        model = BasePresumido
        fields = "__all__"


class AliquotaFixaSerializer(serializers.ModelSerializer):
    class Meta:
        model = AliquotaFixa
        fields = "__all__"


class AliquotaFederalSerializer(serializers.ModelSerializer):
    class Meta:
        model = AliquotaFederal
        fields = "__all__"


class BalanceteDeParaItemSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    parametro = serializers.CharField()
    contas = serializers.ListField(
        child=serializers.CharField(), allow_empty=True, required=False, default=list
    )
    matchField = serializers.CharField(required=False, allow_blank=True, default="bdcodtpla")
    matchType = serializers.ChoiceField(
        choices=("exact", "prefix", "regex"), required=False, default="exact"
    )
    campo = serializers.CharField(required=False, allow_blank=True, default="bdsaldo_atual")
    reducer = serializers.CharField(required=False, allow_blank=True, default="sum")
    filterKey = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    customKey = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    ativo = serializers.BooleanField(required=False, default=True)
    descricao = serializers.CharField(required=False, allow_blank=True, allow_null=True)
