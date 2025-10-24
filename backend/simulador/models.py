from django.db import models

# ------------------------
# Empresa
# ------------------------
class Empresa(models.Model):
    REGIME_CHOICES = [
        ("Simples", "Simples Nacional"),
        ("Presumido", "Lucro Presumido"),
        ("Real", "Lucro Real"),
        ("Outras", "Outras"),
    ]

    razao_social = models.CharField(max_length=255)
    cnpj = models.CharField(max_length=18, unique=True)
    cnae_principal = models.CharField(max_length=10)
    municipio = models.CharField(max_length=100)
    uf = models.CharField(max_length=2)
    regime_tributario = models.CharField(
        max_length=20,
        choices=REGIME_CHOICES,
        default="Outras",
    )

    def __str__(self):
        return f"{self.razao_social} ({self.cnpj})"


# ------------------------
# Simulação
# ------------------------
class Simulacao(models.Model):
    REGIME_CHOICES = [
        ("Simples", "Simples Nacional"),
        ("Presumido", "Lucro Presumido"),
        ("Real", "Lucro Real"),
        ("Outras", "Outras"),
    ]

    empresa = models.ForeignKey(Empresa, on_delete=models.CASCADE, related_name="simulacoes")
    data = models.DateField(auto_now_add=True)

    # Parâmetros
    receita_total = models.DecimalField(max_digits=15, decimal_places=2)
    receita_mercadorias = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    receita_servicos = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    receita_exportacao = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    # Deduções e outras receitas (quando disponíveis)
    receita_deducoes = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    outras_receitas = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    folha_total = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    inss_patronal = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    desoneracao_folha = models.BooleanField(default=False)
    # Alíquota única de INSS (INSS + RAT + Terceiros)
    aliquota_inss_total = models.DecimalField(max_digits=6, decimal_places=4, default=0)

    aliquota_iss = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    aliquota_icms = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    regime_atual = models.CharField(max_length=20, choices=REGIME_CHOICES)
    
    # >>> NOVOS PARÂMETROS (foco: Lucro Real) <<<
    custo_mercadorias = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    custo_servicos = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    despesas_operacionais = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    outras_despesas = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    pro_labore = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    despesas_nao_dedutiveis = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    investimentos = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    depreciacao = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    creditos_pis = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    creditos_cofins = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    adicoes_fiscais = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    exclusoes_fiscais = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    lucro_contabil = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    receita_12_meses = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    rat_percentual = models.DecimalField(max_digits=6, decimal_places=4, default=0)
    fap_percentual = models.DecimalField(max_digits=6, decimal_places=4, default=1)
    terceiros_percentual = models.DecimalField(max_digits=6, decimal_places=4, default=0)
    usa_cprb = models.BooleanField(default=False)
    cprb_percentual = models.DecimalField(max_digits=6, decimal_places=4, default=0)

    # Percentuais de presunção informados pelo usuário (substitui CNAE)
    presumido_irpj_merc = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    presumido_csll_merc = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    presumido_irpj_serv = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    presumido_csll_serv = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    anexo_manual = models.ForeignKey(
        "AnexoSimples",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="simulacoes",
    )

    def __str__(self):
        return f"Simulação {self.id} - {self.empresa}"


# ------------------------
# Resultados da simulação
# ------------------------
class Resultado(models.Model):
    REGIME_CHOICES = [
        ("Simples", "Simples Nacional"),
        ("Presumido", "Lucro Presumido"),
        ("Real", "Lucro Real"),
    ]

    simulacao = models.ForeignKey(Simulacao, on_delete=models.CASCADE, related_name="resultados")
    regime = models.CharField(max_length=20, choices=REGIME_CHOICES)
    imposto = models.CharField(max_length=50)
    valor = models.DecimalField(max_digits=15, decimal_places=2)

    class Meta:
        unique_together = ("simulacao", "regime", "imposto")

    def __str__(self):
        return f"{self.simulacao} - {self.regime} - {self.imposto}: {self.valor}"


# ------------------------
# Tabelas auxiliares
# ------------------------

class CnaeImpedimento(models.Model):
    cnae = models.CharField(max_length=10, unique=True)
    descricao = models.CharField(max_length=255)

    def __str__(self):
        return f"{self.cnae} - {self.descricao}"


class AnexoSimples(models.Model):
    numero = models.IntegerField()  # Ex: 1, 2, 3, 4, 5
    atividade = models.CharField(max_length=255)  # Comércio, Indústria, Serviços

    def __str__(self):
        return f"Anexo {self.numero} - {self.atividade}"


class SimulacaoAnexoMercadoria(models.Model):
    simulacao = models.ForeignKey(
        Simulacao,
        on_delete=models.CASCADE,
        related_name="anexos_mercadoria",
        db_constraint=False,
    )
    anexo = models.ForeignKey(
        AnexoSimples,
        on_delete=models.PROTECT,
        related_name="rateios_mercadoria",
        db_constraint=False,
    )
    valor = models.DecimalField(max_digits=15, decimal_places=2)

    def __str__(self):
        return f"{self.simulacao} - Mercadoria - {self.anexo} ({self.valor})"


class SimulacaoAnexoServico(models.Model):
    simulacao = models.ForeignKey(
        Simulacao,
        on_delete=models.CASCADE,
        related_name="anexos_servico",
        db_constraint=False,
    )
    anexo = models.ForeignKey(
        AnexoSimples,
        on_delete=models.PROTECT,
        related_name="rateios_servico",
        db_constraint=False,
    )
    valor = models.DecimalField(max_digits=15, decimal_places=2)

    def __str__(self):
        return f"{self.simulacao} - Serviço - {self.anexo} ({self.valor})"


class FaixaSimples(models.Model):
    anexo = models.ForeignKey(AnexoSimples, on_delete=models.CASCADE, related_name="faixas")
    receita_de = models.DecimalField(max_digits=15, decimal_places=2)
    receita_ate = models.DecimalField(max_digits=15, decimal_places=2)
    aliquota = models.DecimalField(max_digits=5, decimal_places=2)  # %
    deducao = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    def __str__(self):
        return f"Anexo {self.anexo.numero} - {self.aliquota}%"


class CnaeAnexo(models.Model):
    cnae = models.CharField(max_length=10)
    anexo = models.ForeignKey(AnexoSimples, on_delete=models.CASCADE)

    def __str__(self):
        return f"{self.cnae} → Anexo {self.anexo.numero}"


class BasePresumido(models.Model):
    atividade = models.CharField(max_length=100)  # comércio, serviços, indústria
    fator_irpj = models.DecimalField(max_digits=5, decimal_places=2)  # %
    fator_csll = models.DecimalField(max_digits=5, decimal_places=2)  # %

    def __str__(self):
        return f"{self.atividade} (IRPJ {self.fator_irpj}%, CSLL {self.fator_csll}%)"


class AliquotaFixa(models.Model):
    imposto = models.CharField(max_length=50)  # ISS, ICMS, INSS, PIS, COFINS
    aliquota = models.DecimalField(max_digits=5, decimal_places=2)  # %

    def __str__(self):
        return f"{self.imposto}: {self.aliquota}%"


class AliquotaFederal(models.Model):
    IMPOSTO_CHOICES = [
        ("PIS", "PIS"),
        ("COFINS", "COFINS"),
        ("IRPJ", "IRPJ"),
        ("CSLL", "CSLL"),
        ("INSS", "INSS Patronal"),
    ]

    imposto = models.CharField(max_length=20, choices=IMPOSTO_CHOICES)
    aliquota = models.DecimalField(max_digits=5, decimal_places=2)
    base_calculo = models.CharField(
        max_length=50,
        help_text="Ex: Receita, Lucro, Folha, etc."
    )

    def __str__(self):
        return f"{self.imposto} ({self.aliquota}%)"


# ------------------------
# Base DP (Planilha Gerencial)
# ------------------------
class PlanilhaGerencial(models.Model):
    cod_folha = models.CharField(max_length=10, db_column="Cod_folha", primary_key=True)
    cnpj = models.CharField(max_length=50, db_column="CNPJ", null=True, blank=True)
    cnpj_original = models.CharField(max_length=50, db_column="CNPJ_Original", null=True, blank=True)
    tributacao = models.CharField(max_length=100, db_column="Tributacao", null=True, blank=True)

    class Meta:
        managed = False
        db_table = "geral_planilha_gerencial"
