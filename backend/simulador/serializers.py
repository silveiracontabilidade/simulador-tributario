from rest_framework import serializers

from .models import (
    Empresa, Simulacao, Resultado,
    CnaeImpedimento, CnaeAnexo, AnexoSimples, FaixaSimples,
    BasePresumido, AliquotaFixa, AliquotaFederal
)
from .services.planilha_gerencial import obter_regime_por_cnpj

# ------------------------
# EMPRESAS / SIMULAÇÕES
# ------------------------
class EmpresaSerializer(serializers.ModelSerializer):
    planilha_tributacao = serializers.SerializerMethodField()
    planilha_regime = serializers.SerializerMethodField()

    class Meta:
        model = Empresa
        fields = (
            "id",
            "razao_social",
            "cnpj",
            "cnae_principal",
            "municipio",
            "uf",
            "regime_tributario",
            "planilha_tributacao",
            "planilha_regime",
        )
        extra_kwargs = {
            "municipio": {"allow_blank": True, "required": False},
            "uf": {"allow_blank": True, "required": False},
            "regime_tributario": {"required": False},
        }

    @staticmethod
    def _planilha_info(obj):
        cache_key = "_planilha_cache"
        if not hasattr(obj, cache_key):
            setattr(obj, cache_key, obter_regime_por_cnpj(obj.cnpj))
        return getattr(obj, cache_key)

    def get_planilha_tributacao(self, obj):
        return self._planilha_info(obj)["planilha_tributacao"]

    def get_planilha_regime(self, obj):
        return self._planilha_info(obj)["planilha_regime"]

    def _sincronizar_regime(self, instance, regime_solicitado):
        if regime_solicitado and regime_solicitado != "Outras":
            return instance
        info = obter_regime_por_cnpj(instance.cnpj)
        regime = info["planilha_regime"] or "Outras"
        if regime != instance.regime_tributario:
            instance.regime_tributario = regime
            instance.save(update_fields=["regime_tributario"])
        setattr(instance, "_planilha_cache", info)
        return instance

    def create(self, validated_data):
        regime_solicitado = validated_data.get("regime_tributario")
        instance = super().create(validated_data)
        return self._sincronizar_regime(instance, regime_solicitado)

    def update(self, instance, validated_data):
        regime_solicitado = validated_data.get("regime_tributario", instance.regime_tributario)
        instance = super().update(instance, validated_data)
        return self._sincronizar_regime(instance, regime_solicitado)


class ResultadoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resultado
        fields = "__all__"


class EmpresaMiniSerializer(serializers.ModelSerializer):
    planilha_regime = serializers.SerializerMethodField()

    class Meta:
        model = Empresa
        fields = ("id", "razao_social", "cnpj", "regime_tributario", "planilha_regime")

    def get_planilha_regime(self, obj):
        return EmpresaSerializer._planilha_info(obj)["planilha_regime"]

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


class SimulacaoSerializer(serializers.ModelSerializer):
    empresa = EmpresaMiniSerializer(read_only=True)
    empresa_id = serializers.PrimaryKeyRelatedField(
        queryset=Empresa.objects.all(),
        source="empresa",
        write_only=True
    )
    resultados = ResultadoSerializer(many=True, read_only=True)
    anexo_manual = serializers.PrimaryKeyRelatedField(
        queryset=AnexoSimples.objects.all(),
        allow_null=True,
        required=False
    )
    anexo_manual_detalhe = AnexoSimplesSerializer(source="anexo_manual", read_only=True)

    class Meta:
        model = Simulacao
        fields = "__all__"


# ------------------------
# TABELAS AUXILIARES
# ------------------------


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
