import os
import contextlib
from datetime import datetime, date
from decimal import Decimal
from typing import Any, Dict, List, Optional, Sequence

try:  # pragma: no cover - depende de binários externos
    import fdb  # type: ignore
except ImportError as exc:  # pragma: no cover
    fdb = None  # type: ignore
    _fdb_import_error: Optional[ImportError] = exc
else:  # pragma: no cover
    _fdb_import_error = None


FIREBIRD_HOST = os.environ.get("FB_HOST", "srvsci.silveira.local")
FIREBIRD_PORT = int(os.environ.get("FB_PORT", "3050"))
FIREBIRD_DATABASE = os.environ.get("FB_DATABASE", "E:/SCI/banco/VSCI.SDB")
FIREBIRD_USER = os.environ.get("FB_USER", "INTEGRACOES")
FIREBIRD_PASSWORD = os.environ.get("FB_PASSWORD", "%I*I3ul8")
FIREBIRD_DSN = os.environ.get("FB_DSN")


class BalanceteError(Exception):
    """Erro de integração com o balancete do SCI."""


@contextlib.contextmanager
def firebird_connection():
    """Abre conexão com o Firebird usando a biblioteca fdb."""
    if fdb is None:  # pragma: no cover - ambiente externo
        detalhe = (
            "Biblioteca 'fdb' indisponível. Instale com 'pip install fdb' "
            "e certifique-se de que libfbclient.so esteja presente."
        )
        if _fdb_import_error:
            detalhe += f" Detalhes: {_fdb_import_error}"
        raise RuntimeError(detalhe)

    try:
        if FIREBIRD_DSN:
            dsn = FIREBIRD_DSN
        else:
            database_path = FIREBIRD_DATABASE.replace("/", "\\")
            dsn = f"{FIREBIRD_HOST}/{FIREBIRD_PORT}:{database_path}"
        conn = fdb.connect(
            dsn=dsn,
            user=FIREBIRD_USER,
            password=FIREBIRD_PASSWORD,
            charset="UTF8",
        )
    except Exception as exc:  # pragma: no cover - erro externo
        raise BalanceteError("Falha ao conectar ao banco Firebird") from exc

    try:
        yield conn
    finally:
        conn.close()


def _normalize_date(value: str) -> str:
    """Converte data em diversos formatos para DD.MM.YYYY."""
    formats = ("%Y.%m.%d", "%Y-%m-%d", "%d/%m/%Y", "%d.%m.%Y")
    for fmt in formats:
        try:
            return datetime.strptime(value, fmt).strftime("%d.%m.%Y")
        except ValueError:
            continue
    raise BalanceteError(f"Formato de data inválido: {value}")


def _convert(value: Any) -> Any:
    """Normaliza tipos para JSON serializável."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore")
    return value


def _query_single_value(cursor, sql: str, params: Sequence[Any]) -> Optional[Any]:
    cursor.execute(sql, params)
    row = cursor.fetchone()
    return row[0] if row else None


def _fetch_plan_code(cursor, empresa: int) -> str:
    sql = """
        SELECT BDCODPLAPADRAO
        FROM TEMPRESAS_REF B
        INNER JOIN (
            SELECT MAX(BDREFEMP) AS MXREF
            FROM TEMPRESAS_REF
            WHERE BDCODEMP = ?
        ) A ON A.MXREF = B.BDREFEMP
        WHERE BDCODEMP = ?
        GROUP BY BDREFEMP, BDCODPLAPADRAO
    """
    cursor.execute(sql, (empresa, empresa))
    row = cursor.fetchone()
    if not row:
        raise BalanceteError("Plano de contas não encontrado para a empresa informada.")
    return str(row[0])


def _fetch_empresa_info(cursor, empresa: int) -> Dict[str, Any]:
    """
    Busca os dados básicos da empresa no SCI utilizando TEMPRESAS, TEMPRESAS_REF e TCIDADE.
    """
    sql = """
        SELECT
            A.BDCODEMP,
            B.BDNOMEMP,
            A.BDCNPJEMP,
            B.BDCODCNAE,
            B.BDCODCID,
            CID.BDNOMCID
        FROM TEMPRESAS A
        INNER JOIN (
            SELECT
                TR.BDCODEMP,
                TR.BDREFEMP,
                TR.BDCODCNAE,
                TR.BDNOMEMP,
                TR.BDCODCID
            FROM TEMPRESAS_REF TR
            INNER JOIN (
                SELECT BDCODEMP, MAX(BDREFEMP) AS MXREF
                FROM TEMPRESAS_REF
                GROUP BY BDCODEMP
            ) C
                ON TR.BDCODEMP = C.BDCODEMP
               AND TR.BDREFEMP = C.MXREF
        ) B
            ON A.BDCODEMP = B.BDCODEMP
        INNER JOIN TCIDADE CID ON B.BDCODCID = CID.BDCODCID
        WHERE A.BDCODEMP = ?
    """

    cursor.execute(sql, (empresa,))
    row = cursor.fetchone()
    if not row:
        return {}

    codigo, nome, cnpj, cnae, cod_cidade, nome_cidade = row
    return {
        "codigo": int(codigo) if codigo is not None else None,
        "razao_social": _convert(nome),
        "cnpj": str(_convert(cnpj) or "").strip(),
        "cnae": str(_convert(cnae) or "").strip(),
        "cod_cidade": _convert(cod_cidade),
        "municipio": _convert(nome_cidade),
    }


def _fetch_limits(cursor, plano: str) -> Dict[str, int]:
    min_sql = """
        SELECT FIRST 1 BDCODTPLA
        FROM PLANOS_TPLA
        WHERE BDCODPLAPADRAO = ?
        ORDER BY BDCTALON
    """
    max_sql = """
        SELECT FIRST 1 BDCODTPLA
        FROM PLANOS_TPLA
        WHERE BDCODPLAPADRAO = ?
        ORDER BY BDCTALON DESC
    """
    min_cta = _query_single_value(cursor, min_sql, (plano,))
    max_cta = _query_single_value(cursor, max_sql, (plano,))
    if min_cta is None or max_cta is None:
        raise BalanceteError("Não foi possível determinar o intervalo de contas do plano informado.")
    return {
        "inicio": _normalize_account(min_cta),
        "fim": _normalize_account(max_cta),
    }


def _normalize_account(code: Any) -> int:
    """Remove caracteres não numéricos e retorna inteiro (default 0)."""
    if code is None:
        return 0
    digits = "".join(ch for ch in str(code) if ch.isdigit())
    return int(digits) if digits else 0


def _rows_to_dicts(cursor) -> List[Dict[str, Any]]:
    columns = [col[0].lower() for col in cursor.description]
    results: List[Dict[str, Any]] = []
    for row in cursor.fetchall():
        results.append({
            columns[idx]: _convert(value)
            for idx, value in enumerate(row)
        })
    return results


def obter_balancete(
    empresa: int,
    data_inicio: str,
    data_fim: str,
    competencia_ref: str,
) -> Dict[str, Any]:
    """
    Consulta o balancete via stored procedure VSUC_SP_RETORNA_BALANCETE e retorna JSON.
    """
    data_inicio_fmt = _normalize_date(data_inicio)
    data_fim_fmt = _normalize_date(data_fim)
    competencia_ref = str(competencia_ref)

    with firebird_connection() as conn:
        cursor = conn.cursor()

        plano = _fetch_plan_code(cursor, empresa)
        limites = _fetch_limits(cursor, plano)
        empresa_info = _fetch_empresa_info(cursor, empresa)

        sql = """
            SELECT *
            FROM VSUC_SP_RETORNA_BALANCETE(
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        """
        conta_inicial = limites["inicio"] or 0
        conta_final = limites["fim"] or 0
        params = [
            int(empresa),
            data_inicio_fmt,
            data_fim_fmt,
            1,
            conta_inicial,
            conta_final,
            0,
            "",
            competencia_ref,
            0,
            1,
            1,
            1,
            1,
            1,
            1,
            "1,2,3,4,5,6,7,8,9,10,11,12",
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            2,
            1,
        ]

        try:
            cursor.execute(sql, params)
        except Exception as exc:  # pragma: no cover - erro externo
            raise BalanceteError("Falha ao executar a stored procedure do balancete.") from exc

        data = _rows_to_dicts(cursor)
        return {
            "empresa": empresa,
            "empresa_detalhes": empresa_info,
            "plano_contas": plano,
            "intervalo_contas": limites,
            "periodo": {
                "inicio": data_inicio_fmt,
                "fim": data_fim_fmt,
                "referencia": competencia_ref,
            },
            "total_registros": len(data),
            "dados": data,
        }
