from functools import lru_cache
from typing import Optional

from django.db import connections

def _somente_digitos(valor: str) -> str:
    return "".join(ch for ch in str(valor or "") if ch.isdigit())


def _has_secondary_db() -> bool:
    return "dp" in connections.databases


@lru_cache(maxsize=1024)
def _tributacao_por_cnpj_digits(cnpj_digits: str) -> Optional[str]:
    if not _has_secondary_db() or not cnpj_digits:
        return None

    query = """
        SELECT Tributacao
        FROM geral_planilha_gerencial
        WHERE
            REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(CNPJ, ''), '.', ''), '-', ''), '/', ''), ' ', '') = %s
            OR REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(CNPJ_Original, ''), '.', ''), '-', ''), '/', ''), ' ', '') = %s
        LIMIT 1
    """
    try:
        with connections["dp"].cursor() as cursor:
            cursor.execute(query, [cnpj_digits, cnpj_digits])
            row = cursor.fetchone()
        return row[0] if row else None
    except Exception:
        # Falha na conexão/consulta do banco secundário não deve quebrar a API.
        return None


def obter_tributacao_por_cnpj(cnpj: str) -> Optional[str]:
    """
    Retorna o texto da coluna 'Tributacao' da planilha gerencial para o CNPJ informado.
    """
    digits = _somente_digitos(cnpj)
    if not digits:
        return None
    return _tributacao_por_cnpj_digits(digits)


def normalizar_regime(tributacao: Optional[str]) -> str:
    """
    Converte o texto da planilha para o regime utilizado nas simulações (Simples, Presumido, Real).
    """
    if not tributacao:
        return "Outras"

    valor = tributacao.strip().lower()
    valor_compacto = valor.replace(" ", "")

    if valor in {"sn", "simples", "simples nacional"}:
        return "Simples"
    if valor in {"lp", "lucro presumido"}:
        return "Presumido"
    if valor in {"lr", "lucro real"}:
        return "Real"

    if "simples" in valor or valor_compacto.startswith("sn"):
        return "Simples"
    if "presum" in valor or valor_compacto.startswith("lp"):
        return "Presumido"
    if "real" in valor or valor_compacto.startswith("lr"):
        return "Real"

    return "Outras"


def obter_regime_por_cnpj(cnpj: str) -> dict[str, Optional[str]]:
    """
    Retorna um dicionário com o texto original da planilha e o regime normalizado.
    """
    tributacao = obter_tributacao_por_cnpj(cnpj)
    return {
        "planilha_tributacao": tributacao,
        "planilha_regime": normalizar_regime(tributacao),
    }
