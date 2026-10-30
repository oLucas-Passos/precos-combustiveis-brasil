"""Tabelas de referência publicadas no site: estatísticas, série anual, regiões e UFs."""

from __future__ import annotations

import numpy as np
import pandas as pd
from statsmodels.stats.stattools import durbin_watson

from . import config, metricas, transformacao


def estatisticas_produto(nominal: pd.Series, real: pd.Series) -> dict:
    """Resumo de uma série nacional mensal (nominal e real)."""
    n = nominal.dropna()
    r = real.dropna()
    ultimo = n.index.max()

    def var(meses: int) -> float | None:
        alvo = ultimo - meses
        return float(n.iloc[-1] / n.loc[alvo] - 1) if alvo in n.index else None

    anos = (n.index[-1] - n.index[0]).n / 12
    return {
        "atual": float(n.iloc[-1]),
        "media_12m": float(n.iloc[-12:].mean()),
        "var_1m": var(1),
        "var_12m": var(12),
        "var_60m": var(60),
        "var_total_nominal": float(n.iloc[-1] / n.iloc[0] - 1),
        "var_total_real": float(r.iloc[-1] / r.iloc[0] - 1),
        "cagr_nominal": float((n.iloc[-1] / n.iloc[0]) ** (1 / anos) - 1),
        "cagr_real": float((r.iloc[-1] / r.iloc[0]) ** (1 / anos) - 1),
        "min_nominal": [str(n.idxmin()), float(n.min())],
        "max_nominal": [str(n.idxmax()), float(n.max())],
        "min_real": [str(r.idxmin()), float(r.min())],
        "max_real": [str(r.idxmax()), float(r.max())],
        "volatilidade_anual": metricas.volatilidade_anualizada(n),
        "meses": int(len(n)),
    }


def ipca_anual(variacao_pct: pd.Series) -> pd.Series:
    """IPCA acumulado em cada ano civil (jan a dez, ou até o último mês disponível)."""
    fator = (1 + variacao_pct / 100).groupby(variacao_pct.index.year).prod()
    return fator - 1


def tabela_anual(brasil: pd.DataFrame, variacao_ipca: pd.Series) -> pd.DataFrame:
    """Média anual por produto, variação nominal e real sobre o ano anterior.

    A variação real usa o IPCA médio do ano (média do número-índice), para
    comparar médias anuais com médias anuais.
    """
    medias = brasil.groupby(brasil.index.year).mean()
    meses = brasil.notna().groupby(brasil.index.year).sum().max(axis=1)
    indice = (1 + variacao_ipca / 100).cumprod()
    indice_medio = indice.groupby(indice.index.year).mean().reindex(medias.index)
    out = medias.copy()
    for p in brasil.columns:
        out[f"{p}_var"] = medias[p].pct_change()
        out[f"{p}_var_real"] = (medias[p] / indice_medio).pct_change()
    out["ipca_ano"] = ipca_anual(variacao_ipca).reindex(medias.index)
    out["meses"] = meses
    return out


def medias_regionais(painel: pd.DataFrame, coluna: str = "preco") -> dict[str, pd.DataFrame]:
    """Média por região (ponderada por postos) para cada produto: mes x região."""
    tmp = painel.assign(_peso=painel[coluna] * painel["postos"])
    g = tmp.groupby(["produto", "regiao", "mes"])[["_peso", "postos"]].sum()
    media = (g["_peso"] / g["postos"]).rename("media").reset_index()
    return {
        p: sub.pivot(index="mes", columns="regiao", values="media") for p, sub in media.groupby("produto")
    }


def tabela_ufs(painel: pd.DataFrame) -> dict:
    """Dados do último mês por produto e UF, com variações e indicadores de dispersão."""
    ultimo = painel["mes"].max()
    razao = transformacao.razao_etanol_gasolina(painel)
    paridade = metricas.participacao_paridade(razao)
    out = {}
    for p in config.PRODUTOS.values():
        tab = transformacao.tabela_larga(painel, p)
        tab_real = transformacao.tabela_larga(painel, p, "preco_real")
        atual = painel[(painel["produto"] == p) & (painel["mes"] == ultimo)].set_index("uf")
        linhas = {}
        for uf, linha in atual.iterrows():
            serie = tab[uf].dropna()
            real = tab_real[uf].dropna()
            ant = ultimo - 12
            item = {
                "preco": float(linha["preco"]),
                "desvio": None if pd.isna(linha["desvio"]) else float(linha["desvio"]),
                "min": None if pd.isna(linha["preco_min"]) else float(linha["preco_min"]),
                "max": None if pd.isna(linha["preco_max"]) else float(linha["preco_max"]),
                "postos": int(linha["postos"]),
                "var_12m": float(serie.iloc[-1] / serie.loc[ant] - 1) if ant in serie.index else None,
                "var_real_total": float(real.iloc[-1] / real.iloc[0] - 1),
            }
            if p == "gasolina":
                item["etanol_max"] = round(float(linha["preco"]) * config.LIMITE_PARIDADE_ETANOL, 3)
            if p == "etanol":
                item["razao"] = float(razao.loc[ultimo, uf])
                item["paridade_historica"] = float(paridade[uf])
            linhas[uf] = item
        out[p] = linhas
    return out


def cobertura(painel: pd.DataFrame) -> pd.DataFrame:
    """Total de postos pesquisados por mês e produto (tamanho da amostra)."""
    return painel.pivot_table(index="mes", columns="produto", values="postos", aggfunc="sum")


def coeficientes_its(resultado: metricas.ResultadoITS) -> dict:
    """Tabela completa da regressão segmentada para publicação."""
    m = resultado.modelo
    nomes = ["constante", "tendencia", "degrau", "mudanca_tendencia"]
    return {
        "coeficientes": {
            nome: {"coef": float(m.params[i]), "erro_padrao": float(m.bse[i]), "p_valor": float(m.pvalues[i])}
            for i, nome in enumerate(nomes)
        },
        "r2": float(m.rsquared),
        "r2_ajustado": float(m.rsquared_adj),
        "durbin_watson": float(durbin_watson(m.resid)),
        "n": int(m.nobs),
        "tendencia_pre_pct_mes": float(np.expm1(m.params[1]) * 100),
        "tendencia_pos_pct_mes": float(np.expm1(m.params[1] + m.params[3]) * 100),
    }


def efeito_ponderacao(painel: pd.DataFrame, produto: str = "gasolina") -> dict:
    """Compara a média nacional com pesos mensais (postos do mês) e com pesos fixos.

    Os pesos fixos são a participação média de cada UF no total de postos do
    período. A diferença mostra quanto as mudanças na amostra da ANP afetam a média.
    """
    sub = painel[painel["produto"] == produto]
    pesos = sub.groupby("uf")["postos"].mean()
    pesos = pesos / pesos.sum()
    tab = transformacao.tabela_larga(painel, produto)
    fixo = (tab * pesos).sum(axis=1) / tab.notna().mul(pesos).sum(axis=1)
    variavel = transformacao.media_nacional(painel)[produto]
    dif = (variavel - fixo).dropna()
    return {
        "max_diferenca": float(dif.abs().max()),
        "mes_max": str(dif.abs().idxmax()),
        "diferenca_media": float(dif.abs().mean()),
        "var_total_pesos_fixos": float(fixo.dropna().iloc[-1] / fixo.dropna().iloc[0] - 1),
    }
