"""Leitura das fontes brutas (ANP e Banco Central) para DataFrames padronizados."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from . import config


def ler_anp(caminho: Path = config.ARQ_ANP) -> pd.DataFrame:
    """Lê a planilha mensal por estado da ANP e devolve formato longo e tipado.

    Colunas: mes (Period[M]), produto, regiao, uf, postos, preco, desvio,
    preco_min, preco_max. Mantém apenas os produtos de ``config.PRODUTOS``.
    """
    bruto = pd.read_excel(caminho, skiprows=config.ANP_LINHAS_CABECALHO)
    faltando = set(config.COLUNAS_ANP) - set(bruto.columns)
    if faltando:
        raise ValueError(f"Layout da planilha mudou; colunas ausentes: {sorted(faltando)}")

    df = bruto.rename(columns=config.COLUNAS_ANP)[list(config.COLUNAS_ANP.values())]
    df = df[df["produto"].isin(config.PRODUTOS)].copy()

    df["produto"] = df["produto"].map(config.PRODUTOS)
    df["uf"] = df["estado"].str.strip().map(config.SIGLAS)
    df["regiao"] = df["regiao"].str.strip().str.title()
    df["mes"] = pd.to_datetime(df["mes"]).dt.to_period("M")
    for col in ["postos", "preco", "desvio", "preco_min", "preco_max"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    return (
        df.drop(columns="estado")
        .dropna(subset=["preco"])
        .sort_values(["produto", "uf", "mes"])
        .reset_index(drop=True)
    )


def ler_serie_bcb(caminho: Path, coluna: str) -> pd.Series:
    """Lê uma série mensal do SGS/BCB salva como CSV (mes, valor)."""
    df = pd.read_csv(caminho)
    serie = pd.Series(df[coluna].astype(float).values, index=pd.PeriodIndex(df["mes"], freq="M"), name=coluna)
    if serie.index.has_duplicates:
        raise ValueError(f"Meses duplicados em {caminho.name}")
    return serie.sort_index()


def ler_ipca() -> pd.Series:
    """Variação mensal do IPCA em % (SGS 433)."""
    return ler_serie_bcb(config.ARQ_IPCA, "ipca_variacao_mensal_pct")
