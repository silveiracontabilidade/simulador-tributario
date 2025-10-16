#!/usr/bin/env python
"""
Script utilitário para validar a conexão com o banco Firebird utilizado pelo SCI.

Executa tentativas usando pyodbc (com diferentes formatos de string de conexão)
e, caso disponível, a biblioteca fdb como alternativa. Os parâmetros podem ser
ajustados via variáveis de ambiente:

  FB_HOST, FB_PORT, FB_DATABASE, FB_USER, FB_PASSWORD

Uso:
  python backend/scripts/test_firebird_connection.py
"""

from __future__ import annotations

import os
import sys
import textwrap
from typing import Iterable, Optional


HOST = os.environ.get("FB_HOST", "srvsci.silveira.local")
PORT = int(os.environ.get("FB_PORT", "3050"))
DB_PATH = os.environ.get("FB_DATABASE", "E:/SCI/banco/VSCI.SDB")
USER = os.environ.get("FB_USER", "INTEGRACOES")
PASSWORD = os.environ.get("FB_PASSWORD", "%I*I3ul8")
DSN_OVERRIDE = os.environ.get("FB_DSN")

ODBC_DRIVER_CANDIDATES = [
    "Firebird/InterBase(r) driver",
    "Firebird",
    "Firebird/InterBase(r)",
    "FB",
]

try:
    import pyodbc  # type: ignore
except Exception as exc:  # pragma: no cover
    pyodbc = None  # type: ignore
    pyodbc_issue: Optional[Exception] = exc
else:  # pragma: no cover
    pyodbc_issue = None

try:
    import fdb  # type: ignore
except Exception as exc:  # pragma: no cover
    fdb = None  # type: ignore
    fdb_issue: Optional[Exception] = exc
else:  # pragma: no cover
    fdb_issue = None


def print_header(title: str) -> None:
    border = "=" * len(title)
    print(f"\n{title}\n{border}")


def available_odbc_drivers() -> Iterable[str]:
    seen = set()
    for driver in ODBC_DRIVER_CANDIDATES:
        if driver not in seen:
            seen.add(driver)
            yield driver
    if pyodbc is not None:
        for driver in pyodbc.drivers():
            if driver not in seen:
                seen.add(driver)
                yield driver


def try_pyodbc() -> None:
    if pyodbc is None:
        print_header("pyodbc indisponível")
        print(
            "Não foi possível importar pyodbc. "
            "Instale o pacote Python e verifique se as bibliotecas nativas "
            "(unixODBC/libodbc + driver ODBC do Firebird) estão presentes."
        )
        if pyodbc_issue:
            print(f"Detalhes do erro: {pyodbc_issue}")
        return

    errors = []
    print_header("Testando com pyodbc")
    print(f"Host      : {HOST}")
    print(f"Porta     : {PORT}")
    print(f"Database  : {DB_PATH}")
    print(f"Usuário   : {USER}")

    templates = [
        "DRIVER={driver};DBNAME={host}:{db};UID={user};PWD={password};CHARSET=UTF8;",
        "DRIVER={driver};DBNAME={host}/{port}:{db};UID={user};PWD={password};CHARSET=UTF8;",
        "DRIVER={driver};DATABASE={host}:{db};UID={user};PWD={password};CHARSET=UTF8;",
        "DRIVER={driver};DATABASE={host}/{port}:{db};UID={user};PWD={password};CHARSET=UTF8;",
    ]

    for driver in available_odbc_drivers():
        print(f"\n-- Driver: {driver}")
        for template in templates:
            conn_str = template.format(
                driver=driver,
                host=HOST,
                port=PORT,
                db=DB_PATH,
                user=USER,
                password=PASSWORD,
            )
            print(f"Tentando: {conn_str}")
            try:
                conn = pyodbc.connect(conn_str, timeout=10)
            except Exception as exc:  # pragma: no cover
                print(f"  ❌ Falhou: {exc}")
                errors.append((conn_str, exc))
                continue
            else:  # pragma: no cover
                print("  ✅ Conexão estabelecida com sucesso!")
                conn.close()
                return

    print("\nNenhuma tentativa com pyodbc obteve sucesso.")
    if errors:
        print("Último erro reportado:")
        conn_str, exc = errors[-1]
        print(f"  Conexão: {conn_str}")
        print(f"  Erro   : {exc}")


def try_fdb() -> None:
    if fdb is None:
        print_header("fdb indisponível")
        print(
            "A biblioteca 'fdb' não está instalada. "
            "Se desejar testá-la, instale com 'pip install fdb'."
        )
        if fdb_issue:
            print(f"Detalhes do erro: {fdb_issue}")
        return

    print_header("Testando com fdb (driver nativo Firebird)")
    dsn_variants = []
    if DSN_OVERRIDE:
        dsn_variants.append(DSN_OVERRIDE)
    win_style_path = DB_PATH.replace("/", "\\")
    dsn_variants.extend([
        f"{HOST}:{DB_PATH}",
        f"{HOST}:{win_style_path}",
        f"{HOST}/{PORT}:{DB_PATH}",
        f"{HOST}/{PORT}:{win_style_path}",
    ])

    for dsn in dsn_variants:
        print(f"Tentando: {dsn}")
        try:
            conn = fdb.connect(
                dsn=dsn,
                user=USER,
                password=PASSWORD,
                charset="UTF8",
            )
        except Exception as exc:  # pragma: no cover
            print(f"  ❌ Falhou: {exc}")
            continue
        else:  # pragma: no cover
            print("  ✅ Conexão estabelecida com sucesso!")
            try:
                conn.cursor().execute("select current_date from rdb$database")
                print("     • current_date OK")
            except Exception as exc:  # pragma: no cover
                print(f"     • Falhou current_date: {exc}")
            conn.close()
            conn.close()
            return

    print("Nenhuma tentativa com fdb obteve sucesso.")


def main() -> int:
    print_header("Parâmetros de conexão")
    print(
        textwrap.dedent(
            f"""\
            Host..............: {HOST}
            Porta.............: {PORT}
            Caminho base......: {DB_PATH}
            Usuário...........: {USER}
            Biblioteca pyodbc.: {'OK' if pyodbc else 'indisponível'}
            Biblioteca fdb....: {'OK' if fdb else 'indisponível'}
            """
        )
    )

    try_pyodbc()
    try_fdb()
    return 0


if __name__ == "__main__":
    sys.exit(main())
