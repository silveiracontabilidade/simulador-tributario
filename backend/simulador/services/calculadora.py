from decimal import Decimal, ROUND_HALF_UP
from dataclasses import dataclass
from typing import Dict

from django.db import transaction
from simulador.models import (
    Simulacao, Resultado,
    CnaeImpedimento, FaixaSimples,
    BasePresumido, AliquotaFixa, AliquotaFederal
)

D = Decimal  # atalho


def _q(v) -> Decimal:
    """Converte para Decimal com 2 casas, arredondamento contábil."""
    if isinstance(v, Decimal):
        return v.quantize(D("0.01"), rounding=ROUND_HALF_UP)
    return D(str(v)).quantize(D("0.01"), rounding=ROUND_HALF_UP)


@dataclass
class TotaisRegime:
    itens: Dict[str, Decimal]
    total: Decimal


class CalculadoraTributaria:
    """
    Calcula Simples, Presumido e Real para uma Simulacao e persiste em Resultado.
    Parametrizações via tabelas auxiliares (Faixas, BasePresumido, Aliquotas, etc.).
    """

    def __init__(self, simulacao: Simulacao, meses_no_periodo: int = 1):
        self.s = simulacao
        self.empresa = simulacao.empresa
        self.meses = max(1, int(meses_no_periodo))

        # atalhos (já em Decimal)
        self.receita_total = _q(self.s.receita_total)
        self.receita_mercadorias = _q(self.s.receita_mercadorias)
        self.receita_servicos = _q(self.s.receita_servicos)
        self.receita_exportacao = _q(self.s.receita_exportacao)
        self.folha_total = _q(self.s.folha_total)
        self.inss_patronal_informado = _q(self.s.inss_patronal)
        self.aliq_inss_total = _q(self.s.aliquota_inss_total or 0)
        self.desoneracao = bool(self.s.desoneracao_folha)
        self.aliq_iss = _q(self.s.aliquota_iss)
        self.aliq_icms = _q(self.s.aliquota_icms)
        # PIS/COFINS informados pelo usuário (ou carregados via UI)
        self.aliq_pis = _q(getattr(self.s, 'aliquota_pis', 0) or 0)
        self.aliq_cofins = _q(getattr(self.s, 'aliquota_cofins', 0) or 0)

        # novos parâmetros
        self.custo_mercadorias = _q(self.s.custo_mercadorias)
        self.custo_servicos = _q(self.s.custo_servicos)
        self.despesas_operacionais = _q(self.s.despesas_operacionais)
        self.creditos_pis = _q(self.s.creditos_pis)
        self.creditos_cofins = _q(self.s.creditos_cofins)
        self.adicoes_fiscais = _q(self.s.adicoes_fiscais)
        self.exclusoes_fiscais = _q(self.s.exclusoes_fiscais)
        self.despesas_nao_dedutiveis = _q(getattr(self.s, "despesas_nao_dedutiveis", 0) or 0)
        self.outras_despesas = _q(getattr(self.s, "outras_despesas", 0) or 0)
        self.lucro_contabil = _q(self.s.lucro_contabil or 0)
        self.receita_12_meses = _q(self.s.receita_12_meses or 0)
        self.rateios_mercadoria = list(
            self.s.anexos_mercadoria.select_related("anexo").all()
        )
        self.rateios_servico = list(
            self.s.anexos_servico.select_related("anexo").all()
        )
        # Percentuais antigos não são mais utilizados para INSS (RAT/FAP/Terceiros/CPRB)
        self.rat_percentual = _q(getattr(self.s, "rat_percentual", 0) or 0)
        self.fap_percentual = _q(getattr(self.s, "fap_percentual", 1) or 1)
        self.terceiros_percentual = _q(getattr(self.s, "terceiros_percentual", 0) or 0)
        self.usa_cprb = bool(getattr(self.s, "usa_cprb", False))
        self.cprb_percentual = _q(getattr(self.s, "cprb_percentual", 0) or 0)

        # Percentuais de presunção informados pelo usuário
        self.pres_irpj_merc = _q(getattr(self.s, "presumido_irpj_merc", 0) or 0)
        self.pres_csll_merc = _q(getattr(self.s, "presumido_csll_merc", 0) or 0)
        self.pres_irpj_serv = _q(getattr(self.s, "presumido_irpj_serv", 0) or 0)
        self.pres_csll_serv = _q(getattr(self.s, "presumido_csll_serv", 0) or 0)

        self.receita_domestica = _q(self.receita_total - self.receita_exportacao)
        self.fator_r = _q(0 if self.receita_total == 0 else self.folha_total / self.receita_total)

    # --------------------------
    # PÚBLICO
    # --------------------------
    @transaction.atomic
    def processar(self):
        """Processa os 3 regimes e salva na tabela Resultado."""
        if self.receita_12_meses <= 0:
            raise ValueError("Receita dos últimos 12 meses não informada para a simulação.")

        Resultado.objects.filter(simulacao=self.s).delete()

        simples = self._calcular_simples()
        presumido = self._calcular_presumido()
        real = self._calcular_real()

        self._registrar("Simples", "TOTAL", simples.total)
        self._registrar("Presumido", "TOTAL", presumido.total)
        self._registrar("Real", "TOTAL", real.total)

        return {
            "simples": self._totais_para_dict(simples),
            "presumido": self._totais_para_dict(presumido),
            "real": self._totais_para_dict(real),
        }

    # --------------------------
    # SIMPLES
    # --------------------------
    def _calcular_simples(self) -> TotaisRegime:
        itens = {}

        cnae = (self.empresa.cnae_principal or "").strip()
        if cnae and CnaeImpedimento.objects.filter(cnae=cnae).exists():
            itens["DAS"] = D("0.00")
            return TotaisRegime(itens=itens, total=_q(0))

        RBT12 = self.receita_12_meses if self.receita_12_meses > 0 else self.receita_total

        das_merc = D("0.00")
        if self.receita_mercadorias > 0:
            if not self.rateios_mercadoria:
                raise ValueError("Distribua a receita de mercadorias por anexo do Simples.")
            total_rateio = sum(_q(item.valor) for item in self.rateios_mercadoria)
            if abs(total_rateio - self.receita_mercadorias) > D("0.01"):
                raise ValueError("A soma dos anexos de mercadorias difere da receita informada.")
            for item in self.rateios_mercadoria:
                if not item.anexo:
                    raise ValueError("Anexo inválido na distribuição de mercadorias.")
                das_merc += self._simples_parcela(RBT12, _q(item.valor), anexo_num=item.anexo.numero)

        das_serv = D("0.00")
        if self.receita_servicos > 0:
            if not self.rateios_servico:
                raise ValueError("Distribua a receita de serviços por anexo do Simples.")
            total_rateio = sum(_q(item.valor) for item in self.rateios_servico)
            if abs(total_rateio - self.receita_servicos) > D("0.01"):
                raise ValueError("A soma dos anexos de serviços difere da receita informada.")
            for item in self.rateios_servico:
                if not item.anexo:
                    raise ValueError("Anexo inválido na distribuição de serviços.")
                das_serv += self._simples_parcela(RBT12, _q(item.valor), anexo_num=item.anexo.numero)

        total = _q(das_merc + das_serv)
        itens["DAS"] = _q(total)
        self._registrar("Simples", "DAS", total)
        return TotaisRegime(itens=itens, total=_q(total))

    def _simples_parcela(self, RBT12: Decimal, receita_parcela: Decimal, *, anexo_num: int) -> Decimal:
        faixa = FaixaSimples.objects.filter(
            anexo__numero=anexo_num,
            receita_de__lte=RBT12,
            receita_ate__gte=RBT12
        ).first()
        if not faixa:
            return D("0.00")
        aliq_nom = _q(faixa.aliquota)
        deducao = _q(faixa.deducao)
        aliq_efetiva = (RBT12 * (aliq_nom / 100) - deducao) / (RBT12 if RBT12 > 0 else 1)
        valor = receita_parcela * aliq_efetiva
        return _q(valor)

    # --------------------------
    # PRESUMIDO
    # --------------------------
    def _calcular_presumido(self) -> TotaisRegime:
        itens = {}

        # Percentuais de presunção informados pelo usuário (sem fallback automático)
        fator_irpj_merc = self.pres_irpj_merc
        fator_csll_merc = self.pres_csll_merc
        fator_irpj_serv = self.pres_irpj_serv
        fator_csll_serv = self.pres_csll_serv

        base_irpj = self.receita_mercadorias * (fator_irpj_merc / 100) + self.receita_servicos * (fator_irpj_serv / 100)
        base_csll = self.receita_mercadorias * (fator_csll_merc / 100) + self.receita_servicos * (fator_csll_serv / 100)

        base_irpj = _q(base_irpj)
        base_csll = _q(base_csll)

        # IRPJ e CSLL
        excedente = base_irpj - _q(20000 * self.meses)
        irpj = base_irpj * D("0.15") + (excedente * D("0.10") if excedente > 0 else D("0.00"))
        csll = base_csll * D("0.09")

        # PIS/COFINS (valores informados; espera-se que venham da base federal via UI)
        pis = self.receita_domestica * (self.aliq_pis / 100)
        cofins = self.receita_domestica * (self.aliq_cofins / 100)

        # ISS e ICMS
        iss = self.receita_servicos * (self.aliq_iss / 100)
        receita_merc_dom = _q(max(D("0.00"), self.receita_mercadorias - self.receita_exportacao))
        icms = receita_merc_dom * (self.aliq_icms / 100)
        inss = self._calcular_inss_patronal()

        itens.update({
            "IRPJ": _q(irpj),
            "CSLL": _q(csll),
            "PIS": _q(pis),
            "COFINS": _q(cofins),
            "ISS": _q(iss),
            "ICMS": _q(icms),
            "INSS": _q(inss),
        })
        total = _q(sum(itens.values()))
        for k, v in itens.items():
            self._registrar("Presumido", k, v)
        return TotaisRegime(itens=itens, total=total)

    # --------------------------
    # REAL
    # --------------------------
    def _calcular_real(self) -> TotaisRegime:
        itens = {}

        # Lucro real: usa lucro contábil se informado, senão calcula
        lucro_base = self.lucro_contabil or (
            self.receita_total
            - self.custo_mercadorias
            - self.custo_servicos
            - self.despesas_operacionais
            - self.outras_despesas
        )

        # aplica adições e exclusões
        lucro_base = lucro_base + self.adicoes_fiscais + self.despesas_nao_dedutiveis - self.exclusoes_fiscais
        lucro_pos = _q(max(D("0.00"), lucro_base))

        # Aliquotas fixas / federais
        irpj_aliq = self._aliquota_fixa("IRPJ", default="15.00")
        csll_aliq = self._aliquota_fixa("CSLL", default="9.00")
        # PIS/COFINS não cumulativos: usamos os valores informados
        pis_aliq = self.aliq_pis
        cofins_aliq = self.aliq_cofins

        # IRPJ
        excedente = lucro_pos - _q(20000 * self.meses)
        irpj = lucro_pos * (irpj_aliq / 100) + (excedente * D("0.10") if excedente > 0 else D("0.00"))
        csll = lucro_pos * (csll_aliq / 100)

        # PIS/COFINS não cumulativos com créditos
        pis = self.receita_domestica * (pis_aliq / 100) - self.creditos_pis
        cofins = self.receita_domestica * (cofins_aliq / 100) - self.creditos_cofins

        # INSS patronal
        inss = self._calcular_inss_patronal()

        # ISS e ICMS
        iss = self.receita_servicos * (self.aliq_iss / 100)
        receita_merc_dom = _q(max(D("0.00"), self.receita_mercadorias - self.receita_exportacao))
        icms = receita_merc_dom * (self.aliq_icms / 100)

        itens.update({
            "IRPJ": _q(irpj),
            "CSLL": _q(csll),
            "PIS": _q(pis),
            "COFINS": _q(cofins),
            "INSS": _q(inss),
            "ISS": _q(iss),
            "ICMS": _q(icms),
        })
        total = _q(sum(itens.values()))
        for k, v in itens.items():
            self._registrar("Real", k, v)
        return TotaisRegime(itens=itens, total=total)

    # --------------------------
    # HELPERS
    # --------------------------
    def _calcular_inss_patronal(self) -> Decimal:
        # Valor informado tem precedência
        if self.inss_patronal_informado > 0:
            return _q(self.inss_patronal_informado)

        # Alíquota única informada (INSS + RAT + Terceiros)
        if self.aliq_inss_total > 0:
            return _q(self.folha_total * (self.aliq_inss_total / 100))

        # Sem fallback automático: se não houver parâmetro, retorna zero
        return D("0.00")

    def _aliquota_fixa(self, imposto: str, *, default: str) -> Decimal:
        try:
            return _q(AliquotaFixa.objects.get(imposto=imposto).aliquota)
        except AliquotaFixa.DoesNotExist:
            return _q(default)

    def _aliquota_federal(self, imposto: str, base: str, *, default: str) -> Decimal:
        try:
            return _q(AliquotaFederal.objects.get(imposto=imposto, base_calculo__iexact=base).aliquota)
        except AliquotaFederal.DoesNotExist:
            return _q(default)

    def _fator_base_presumido(self, atividade: str, campo: str, default: str) -> Decimal:
        try:
            row = BasePresumido.objects.filter(atividade__icontains=atividade).first()
            return _q(getattr(row, campo))
        except Exception:
            return _q(default)

    def _registrar(self, regime: str, imposto: str, valor: Decimal):
        Resultado.objects.update_or_create(
            simulacao=self.s,
            regime=regime,
            imposto=imposto,
            defaults={"valor": _q(valor)}
        )

    @staticmethod
    def _totais_para_dict(t: TotaisRegime) -> Dict[str, str]:
        return {
            **{k: f"{v:.2f}" for k, v in t.itens.items()},
            "TOTAL": f"{t.total:.2f}",
        }
