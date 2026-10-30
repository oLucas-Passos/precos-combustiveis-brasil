"""Checagens de qualidade aplicadas aos dados antes da análise.

Cada regra devolve uma lista de problemas; ``validar_anp`` levanta erro se houver
algum problema bloqueante e devolve um relatório com os avisos.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from . import config

# Faixas plausíveis de preço (R$) por unidade; fora disso é erro de dado.
FAIXAS_PRECO = {"gasolina": (1.0, 15.0), "etanol": (0.8, 12.0), "diesel": (1.0, 15.0), "glp": (20.0, 250.0)}


class ErroValidacao(ValueError):
    """Dados violam uma regra bloqueante."""


@dataclass
class Relatorio:
    erros: list[str] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.erros


def _colunas(df: pd.DataFrame) -> list[str]:
    exigidas = {"mes", "produto", "regiao", "uf", "postos", "preco"}
    faltando = exigidas - set(df.columns)
    return [f"Colunas ausentes: {sorted(faltando)}"] if faltando else []


def _ufs(df: pd.DataFrame) -> list[str]:
    erros = []
    if df["uf"].isna().any():
        erros.append(f"{int(df['uf'].isna().sum())} linhas com estado não mapeado")
    desconhecidas = set(df["uf"].dropna()) - set(config.NOMES_UF)
    if desconhecidas:
        erros.append(f"UFs desconhecidas: {sorted(desconhecidas)}")
    return erros


def _chave_unica(df: pd.DataFrame) -> list[str]:
    dup = df.duplicated(["mes", "produto", "uf"]).sum()
    return [f"{dup} registros duplicados para (mes, produto, uf)"] if dup else []


def _faixas(df: pd.DataFrame) -> list[str]:
    erros = []
    for produto, (lo, hi) in FAIXAS_PRECO.items():
        sub = df[df["produto"] == produto]
        fora = sub[(sub["preco"] < lo) | (sub["preco"] > hi)]
        if len(fora):
            erros.append(f"{len(fora)} preços de {produto} fora de [{lo}, {hi}]")
    return erros


def _min_max(df: pd.DataFrame) -> list[str]:
    if not {"preco_min", "preco_max"} <= set(df.columns):
        return []
    sub = df.dropna(subset=["preco_min", "preco_max"])
    tol = 0.011  # arredondamento da própria ANP
    ruins = sub[(sub["preco"] < sub["preco_min"] - tol) | (sub["preco"] > sub["preco_max"] + tol)]
    return [f"{len(ruins)} médias fora do intervalo [mín, máx]"] if len(ruins) else []


def _cobertura(df: pd.DataFrame) -> list[str]:
    """Avisos (não bloqueantes) sobre meses sem pesquisa."""
    avisos = []
    meses = pd.period_range(df["mes"].min(), df["mes"].max(), freq="M")
    for produto, sub in df.groupby("produto"):
        ausentes = meses.difference(pd.PeriodIndex(sub["mes"].unique()))
        if len(ausentes):
            avisos.append(f"{produto}: sem dados em {', '.join(map(str, ausentes))}")
    return avisos


def validar_anp(df: pd.DataFrame) -> Relatorio:
    rel = Relatorio()
    rel.erros += _colunas(df)
    if rel.erros:
        raise ErroValidacao("; ".join(rel.erros))
    for regra in (_ufs, _chave_unica, _faixas, _min_max):
        rel.erros += regra(df)
    rel.avisos += _cobertura(df)
    if rel.erros:
        raise ErroValidacao("; ".join(rel.erros))
    return rel
