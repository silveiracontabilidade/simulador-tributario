from decimal import Decimal

from rest_framework import serializers

from .models import (
    Empresa, Simulacao, Resultado,
    CnaeImpedimento, CnaeAnexo, AnexoSimples, FaixaSimples,
    BasePresumido, AliquotaFixa, AliquotaFederal,
    SimulacaoAnexoMercadoria, SimulacaoAnexoServico,
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


class SimulacaoAnexoMercadoriaSerializer(serializers.ModelSerializer):
    anexo_label = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = SimulacaoAnexoMercadoria
        fields = ("id", "anexo", "valor", "anexo_label")
        extra_kwargs = {
            "anexo": {"required": True},
            "valor": {"required": True},
        }

    def get_anexo_label(self, obj):
        if not obj.anexo:
            return "-"
        atividade = f" - {obj.anexo.atividade}" if obj.anexo.atividade else ""
        return f"Anexo {obj.anexo.numero}{atividade}"


class SimulacaoAnexoServicoSerializer(serializers.ModelSerializer):
    anexo_label = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = SimulacaoAnexoServico
        fields = ("id", "anexo", "valor", "anexo_label")
        extra_kwargs = {
            "anexo": {"required": True},
            "valor": {"required": True},
        }

    def get_anexo_label(self, obj):
        if not obj.anexo:
            return "-"
        atividade = f" - {obj.anexo.atividade}" if obj.anexo.atividade else ""
        return f"Anexo {obj.anexo.numero}{atividade}"


class SimulacaoSerializer(serializers.ModelSerializer):
    empresa = EmpresaMiniSerializer(read_only=True)
    empresa_id = serializers.PrimaryKeyRelatedField(
        queryset=Empresa.objects.all(),
        source="empresa",
        write_only=True
    )
    resultados = ResultadoSerializer(many=True, read_only=True)
    anexos_mercadoria = SimulacaoAnexoMercadoriaSerializer(many=True, required=False)
    anexos_servico = SimulacaoAnexoServicoSerializer(many=True, required=False)

    class Meta:
        model = Simulacao
        fields = "__all__"

    def validate(self, attrs):
        attrs = super().validate(attrs)
        receita_12 = attrs.get("receita_12_meses")
        if receita_12 is None and self.instance:
            receita_12 = self.instance.receita_12_meses
        receita_12 = Decimal(receita_12 or 0)
        if receita_12 <= 0:
            raise serializers.ValidationError({"receita_12_meses": "Informe a receita acumulada dos últimos 12 meses."})

        receita_merc = attrs.get("receita_mercadorias")
        if receita_merc is None and self.instance:
            receita_merc = self.instance.receita_mercadorias
        receita_merc = Decimal(receita_merc or 0)

        receita_serv = attrs.get("receita_servicos")
        if receita_serv is None and self.instance:
            receita_serv = self.instance.receita_servicos
        receita_serv = Decimal(receita_serv or 0)

        anexos_merc = attrs.get("anexos_mercadoria", None)
        anexos_serv = attrs.get("anexos_servico", None)

        if self.instance and anexos_merc is None:
            anexos_merc = [
                {"anexo": item.anexo, "valor": item.valor}
                for item in self.instance.anexos_mercadoria.all()
            ]
        if self.instance and anexos_serv is None:
            anexos_serv = [
                {"anexo": item.anexo, "valor": item.valor}
                for item in self.instance.anexos_servico.all()
            ]

        if anexos_merc is None:
            anexos_merc = []
        if anexos_serv is None:
            anexos_serv = []

        def soma(lista):
            total = Decimal("0")
            for item in lista:
                valor = item.get("valor") if isinstance(item, dict) else getattr(item, "valor", 0)
                total += Decimal(valor or 0)
            return total

        if receita_merc > 0 and not anexos_merc:
            raise serializers.ValidationError({
                "anexos_mercadoria": "Informe pelo menos um anexo para a receita de mercadorias."
            })
        if receita_serv > 0 and not anexos_serv:
            raise serializers.ValidationError({
                "anexos_servico": "Informe pelo menos um anexo para a receita de serviços."
            })

        if anexos_merc:
            total = soma(anexos_merc)
            if abs(total - receita_merc) > Decimal("0.01"):
                raise serializers.ValidationError({
                    "anexos_mercadoria": "A soma dos valores por anexo deve igualar a Receita de Mercadorias."
                })
            if any(
                not (item["anexo"] if isinstance(item, dict) else getattr(item, "anexo", None))
                for item in anexos_merc
            ):
                raise serializers.ValidationError({
                    "anexos_mercadoria": "Selecione o anexo para cada linha de mercadorias."
                })
        if anexos_serv:
            total = soma(anexos_serv)
            if abs(total - receita_serv) > Decimal("0.01"):
                raise serializers.ValidationError({
                    "anexos_servico": "A soma dos valores por anexo deve igualar a Receita de Serviços."
                })
            if any(
                not (item["anexo"] if isinstance(item, dict) else getattr(item, "anexo", None))
                for item in anexos_serv
            ):
                raise serializers.ValidationError({
                    "anexos_servico": "Selecione o anexo para cada linha de serviços."
                })

        # Regras específicas: percentuais de presunção informados pelo usuário
        def get_dec(nome, padrao=0):
            val = attrs.get(nome)
            if val is None and self.instance is not None:
                val = getattr(self.instance, nome, padrao)
            try:
                return Decimal(val if val not in (None, "") else padrao)
            except Exception:
                return Decimal(padrao)

        if receita_merc > 0:
            irpj_merc = get_dec("presumido_irpj_merc")
            csll_merc = get_dec("presumido_csll_merc")
            if irpj_merc <= 0 or csll_merc <= 0:
                raise serializers.ValidationError({
                    "presumido_irpj_merc": "Informe os percentuais de presunção para IRPJ/CSLL (mercadorias).",
                    "presumido_csll_merc": "Informe os percentuais de presunção para IRPJ/CSLL (mercadorias).",
                })

        if receita_serv > 0:
            irpj_serv = get_dec("presumido_irpj_serv")
            csll_serv = get_dec("presumido_csll_serv")
            if irpj_serv <= 0 or csll_serv <= 0:
                raise serializers.ValidationError({
                    "presumido_irpj_serv": "Informe os percentuais de presunção para IRPJ/CSLL (serviços).",
                    "presumido_csll_serv": "Informe os percentuais de presunção para IRPJ/CSLL (serviços).",
                })

        # INSS: exigir alíquota única ou valor informado quando houver folha
        folha = get_dec("folha_total")
        if folha > 0:
            inss_informado = get_dec("inss_patronal")
            aliq_inss_total = get_dec("aliquota_inss_total")
            if inss_informado <= 0 and aliq_inss_total <= 0:
                raise serializers.ValidationError({
                    "aliquota_inss_total": "Informe a alíquota única de INSS (ou o valor de INSS patronal informado)."
                })

        # PIS/COFINS: obrigatórios para o cálculo (trazidos da tabela, mas editáveis)
        def get_num(nome, padrao=0):
            val = attrs.get(nome)
            if val is None and self.instance is not None:
                val = getattr(self.instance, nome, padrao)
            try:
                return Decimal(val if val not in (None, "") else padrao)
            except Exception:
                return Decimal(padrao)

        pis = get_num("aliquota_pis")
        cofins = get_num("aliquota_cofins")
        if pis <= 0 or cofins <= 0:
            raise serializers.ValidationError({
                "aliquota_pis": "Informe a alíquota de PIS.",
                "aliquota_cofins": "Informe a alíquota de COFINS.",
            })

        return attrs

    def _salvar_rateios(self, instance, mercadorias, servicos):
        SimulacaoAnexoMercadoria.objects.filter(simulacao=instance).delete()
        for item in mercadorias:
            SimulacaoAnexoMercadoria.objects.create(
                simulacao=instance,
                anexo=item["anexo"],
                valor=item["valor"],
            )

        SimulacaoAnexoServico.objects.filter(simulacao=instance).delete()
        for item in servicos:
            SimulacaoAnexoServico.objects.create(
                simulacao=instance,
                anexo=item["anexo"],
                valor=item["valor"],
            )

    def create(self, validated_data):
        anexos_mercadoria = validated_data.pop("anexos_mercadoria", [])
        anexos_servico = validated_data.pop("anexos_servico", [])

        instance = super().create(validated_data)
        self._salvar_rateios(instance, anexos_mercadoria, anexos_servico)
        return instance

    def update(self, instance, validated_data):
        anexos_mercadoria = validated_data.pop("anexos_mercadoria", None)
        anexos_servico = validated_data.pop("anexos_servico", None)

        instance = super().update(instance, validated_data)
        if anexos_mercadoria is not None or anexos_servico is not None:
            self._salvar_rateios(
                instance,
                anexos_mercadoria or [],
                anexos_servico or [],
            )
        return instance


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
