from decimal import Decimal, ROUND_HALF_UP
from dataclasses import dataclass
from typing import Optional, Dict

from django.db import transaction
from simulador.models import (
    Simulacao, Resultado,
    CnaeImpedimento, CnaeAnexo, FaixaSimples,
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
        self.desoneracao = bool(self.s.desoneracao_folha)
        self.aliq_iss = _q(self.s.aliquota_iss)
        self.aliq_icms = _q(self.s.aliquota_icms)

        # novos parâmetros
        self.custo_mercadorias = _q(self.s.custo_mercadorias)
        self.custo_servicos = _q(self.s.custo_servicos)
        self.despesas_operacionais = _q(self.s.despesas_operacionais)
        self.creditos_pis = _q(self.s.creditos_pis)
        self.creditos_cofins = _q(self.s.creditos_cofins)
        self.adicoes_fiscais = _q(self.s.adicoes_fiscais)
        self.exclusoes_fiscais = _q(self.s.exclusoes_fiscais)
        self.lucro_contabil = _q(self.s.lucro_contabil or 0)
        anexo_manual = getattr(self.s, "anexo_manual", None)
        self.anexo_manual_numero = anexo_manual.numero if anexo_manual else None

        self.receita_domestica = _q(self.receita_total - self.receita_exportacao)
        self.fator_r = _q(0 if self.receita_total == 0 else self.folha_total / self.receita_total)

    # --------------------------
    # PÚBLICO
    # --------------------------
    @transaction.atomic
    def processar(self):
        """Processa os 3 regimes e salva na tabela Resultado."""
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

        RBT12 = self.receita_total if self.meses >= 12 else self.receita_total

        das_merc = D("0.00")
        if self.receita_mercadorias > 0:
            das_merc = self._simples_parcela(RBT12, self.receita_mercadorias, anexo_num=1)

        das_serv = D("0.00")
        if self.receita_servicos > 0:
            anexo_serv: Optional[int] = self.anexo_manual_numero
            if not anexo_serv and cnae:
                link = CnaeAnexo.objects.filter(cnae=cnae).first()
                if link:
                    anexo_serv = link.anexo.numero
            if not anexo_serv:
                anexo_serv = 3 if self.fator_r >= D("0.28") else 5
            das_serv = self._simples_parcela(RBT12, self.receita_servicos, anexo_num=anexo_serv)

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

        # Busca fatores na tabela BasePresumido
        fator_irpj_merc = self._fator_base_presumido("mercadorias", "fator_irpj", default="8.00")
        fator_csll_merc = self._fator_base_presumido("mercadorias", "fator_csll", default="12.00")
        fator_irpj_serv = self._fator_base_presumido("servicos", "fator_irpj", default="32.00")
        fator_csll_serv = self._fator_base_presumido("servicos", "fator_csll", default="32.00")

        base_irpj = self.receita_mercadorias * (fator_irpj_merc / 100) + self.receita_servicos * (fator_irpj_serv / 100)
        base_csll = self.receita_mercadorias * (fator_csll_merc / 100) + self.receita_servicos * (fator_csll_serv / 100)

        base_irpj = _q(base_irpj)
        base_csll = _q(base_csll)

        # IRPJ e CSLL
        excedente = base_irpj - _q(20000 * self.meses)
        irpj = base_irpj * D("0.15") + (excedente * D("0.10") if excedente > 0 else D("0.00"))
        csll = base_csll * D("0.09")

        # PIS/COFINS cumulativos via AliquotaFederal
        pis_aliq = self._aliquota_federal("PIS", "Cumulativo", default="0.65")
        cofins_aliq = self._aliquota_federal("COFINS", "Cumulativo", default="3.00")
        pis = self.receita_domestica * (pis_aliq / 100)
        cofins = self.receita_domestica * (cofins_aliq / 100)

        # ISS e ICMS
        iss = self.receita_servicos * (self.aliq_iss / 100)
        receita_merc_dom = _q(max(D("0.00"), self.receita_mercadorias - self.receita_exportacao))
        icms = receita_merc_dom * (self.aliq_icms / 100)

        itens.update({
            "IRPJ": _q(irpj),
            "CSLL": _q(csll),
            "PIS": _q(pis),
            "COFINS": _q(cofins),
            "ISS": _q(iss),
            "ICMS": _q(icms),
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
        )

        # aplica adições e exclusões
        lucro_base = lucro_base + self.adicoes_fiscais - self.exclusoes_fiscais
        lucro_pos = _q(max(D("0.00"), lucro_base))

        # Aliquotas fixas / federais
        irpj_aliq = self._aliquota_fixa("IRPJ", default="15.00")
        csll_aliq = self._aliquota_fixa("CSLL", default="9.00")
        pis_aliq = self._aliquota_federal("PIS", "Nao Cumulativo", default="1.65")
        cofins_aliq = self._aliquota_federal("COFINS", "Nao Cumulativo", default="7.60")
        inss_aliq = self._aliquota_fixa("INSS", default="20.00")

        # IRPJ
        excedente = lucro_pos - _q(20000 * self.meses)
        irpj = lucro_pos * (irpj_aliq / 100) + (excedente * D("0.10") if excedente > 0 else D("0.00"))
        csll = lucro_pos * (csll_aliq / 100)

        # PIS/COFINS não cumulativos com créditos
        pis = self.receita_domestica * (pis_aliq / 100) - self.creditos_pis
        cofins = self.receita_domestica * (cofins_aliq / 100) - self.creditos_cofins

        # INSS patronal
        if self.desoneracao:
            inss = D("0.00")  # CPRB em versão futura
        else:
            inss = self.inss_patronal_informado if self.inss_patronal_informado > 0 else _q(
                self.folha_total * (inss_aliq / 100)
            )

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
