"""Transformações: deflação pelo IPCA, médias nacionais e tabelas largas."""

from __future__ import annotations

import pandas as pd


def indice_ipca(variacao_pct: pd.Series, base: pd.Period | None = None) -> pd.Series:
    """Número-índice do IPCA a partir da variação mensal (%), com base = 1 em ``base``.

    O índice de um mês incorpora a inflação daquele mês, então dividir um preço
    nominal do mês t por ``indice[t]`` o expressa em reais do mês-base.
    """
    indice = (1 + variacao_pct / 100).cumprod()
    base = base or indice.index.max()
    return indice / indice.loc[base]


def deflacionar(
    df: pd.DataFrame, variacao_ipca: pd.Series, base: pd.Period | None = None, coluna: str = "preco"
) -> pd.DataFrame:
    """Acrescenta ``preco_real``: preço em reais constantes do mês-base."""
    base = base or df["mes"].max()
    idx = indice_ipca(variacao_ipca, base)
    faltando = set(df["mes"].unique()) - set(idx.index)
    if faltando:
        raise ValueError(f"IPCA ausente para {sorted(map(str, faltando))[:5]}")
    out = df.copy()
    out["preco_real"] = out[coluna] / out["mes"].map(idx)
    return out


def media_nacional(df: pd.DataFrame, coluna: str = "preco") -> pd.DataFrame:
    """Média Brasil por mês e produto, ponderada pelo número de postos pesquisados."""
    tmp = df.assign(_peso=df[coluna] * df["postos"])
    g = tmp.groupby(["produto", "mes"])[["_peso", "postos"]].sum()
    return (g["_peso"] / g["postos"]).unstack("produto")


def tabela_larga(df: pd.DataFrame, produto: str, coluna: str = "preco") -> pd.DataFrame:
    """Matriz mes x uf para um produto, com todos os meses do período no índice."""
    sub = df[df["produto"] == produto]
    tab = sub.pivot(index="mes", columns="uf", values=coluna)
    meses = pd.period_range(df["mes"].min(), df["mes"].max(), freq="M")
    return tab.reindex(meses).sort_index(axis=1)


def razao_etanol_gasolina(df: pd.DataFrame) -> pd.DataFrame:
    """Razão preço etanol / preço gasolina por mês e UF."""
    return tabela_larga(df, "etanol") / tabela_larga(df, "gasolina")
