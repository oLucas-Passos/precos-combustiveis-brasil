"""Métricas estatísticas usadas no notebook, no README e no dashboard."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
import statsmodels.api as sm

from . import config


def retornos_log(serie: pd.Series) -> pd.Series:
    """Variação mensal em log (aprox. % ao mês). Ignora meses sem dado."""
    return np.log(serie).diff().dropna()


def volatilidade_anualizada(serie: pd.Series) -> float:
    """Desvio padrão dos retornos log mensais, anualizado (x raiz de 12)."""
    return float(retornos_log(serie).std() * np.sqrt(12))


def volatilidade_por_regime(precos: pd.DataFrame) -> pd.DataFrame:
    """Volatilidade anualizada de cada coluna em cada regime de preços da Petrobras."""
    linhas = []
    for nome, ini, fim in config.REGIMES_PRECO:
        fatia = precos.loc[pd.Period(ini, "M") : (pd.Period(fim, "M") if fim else None)]
        linha = {"regime": nome, "inicio": ini, "fim": fim or str(precos.index.max()), "meses": len(fatia)}
        linha.update({c: volatilidade_anualizada(fatia[c].dropna()) for c in precos.columns})
        linhas.append(linha)
    return pd.DataFrame(linhas).set_index("regime")


def volatilidade_movel(serie: pd.Series, janela: int = 12) -> pd.Series:
    return retornos_log(serie).rolling(janela).std() * np.sqrt(12)


def sazonalidade(serie: pd.Series, janela: int = 12) -> pd.DataFrame:
    """Efeito médio de cada mês do ano, em % sobre a tendência.

    A tendência é uma média móvel centrada 2x12 do log do preço. O desvio do
    log em relação a ela é agrupado por mês do calendário, com erro padrão.
    """
    log = np.log(serie.dropna())
    tendencia = log.rolling(janela, center=True).mean().rolling(2, center=True).mean()
    desvio = (log - tendencia).dropna() * 100
    g = desvio.groupby(desvio.index.month)
    return pd.DataFrame({"efeito_pct": g.mean(), "erro_padrao": g.sem(), "n": g.size()})


def dispersao_regional(tabela: pd.DataFrame) -> pd.Series:
    """Coeficiente de variação entre UFs (desvio / média) em cada mês."""
    return (tabela.std(axis=1) / tabela.mean(axis=1)).rename("cv_entre_ufs")


def participacao_paridade(razao: pd.DataFrame, limite: float = config.LIMITE_PARIDADE_ETANOL) -> pd.Series:
    """Fração dos meses em que o etanol custou até ``limite`` da gasolina, por UF."""
    return (razao <= limite).where(razao.notna()).mean().sort_values(ascending=False)


@dataclass
class ResultadoITS:
    mudanca_nivel: float
    ic95: tuple[float, float]
    p_valor: float
    mudanca_tendencia: float
    p_valor_tendencia: float
    n: int
    modelo: object


def serie_interrompida(
    serie: pd.Series,
    intervencao: str = config.MES_INTERVENCAO_ICMS,
    janela_meses: int = 12,
    hac_lags: int = 3,
) -> ResultadoITS:
    """Regressão segmentada (interrupted time series) em log do preço.

    log(p_t) = b0 + b1 t + b2 D_t + b3 (t - t0) D_t + e_t, com D_t = 1 a partir da
    intervenção. b2 é a mudança imediata de nível (convertida para %); b3, a
    mudança de inclinação. Erros padrão HAC (Newey-West) por causa da
    autocorrelação. Usa ``janela_meses`` antes e depois da intervenção.
    """
    t0 = pd.Period(intervencao, "M")
    s = np.log(serie.dropna()).loc[t0 - janela_meses : t0 + janela_meses - 1]
    t = np.arange(len(s), dtype=float)
    d = (s.index >= t0).astype(float)
    k = t[np.argmax(d)]
    X = sm.add_constant(np.column_stack([t, d, (t - k) * d]))
    modelo = sm.OLS(s.values, X).fit(cov_type="HAC", cov_kwds={"maxlags": hac_lags})
    b2, se2 = modelo.params[2], modelo.bse[2]
    pct = lambda b: float(np.expm1(b) * 100)
    return ResultadoITS(
        mudanca_nivel=pct(b2),
        ic95=(pct(b2 - 1.96 * se2), pct(b2 + 1.96 * se2)),
        p_valor=float(modelo.pvalues[2]),
        mudanca_tendencia=pct(modelo.params[3]),
        p_valor_tendencia=float(modelo.pvalues[3]),
        n=len(s),
        modelo=modelo,
    )


def robustez_its(serie: pd.Series, janelas: tuple[int, ...] = (6, 9, 12, 18, 24)) -> pd.DataFrame:
    """Reestima a regressão segmentada com janelas diferentes (análise de sensibilidade)."""
    linhas = []
    for j in janelas:
        r = serie_interrompida(serie, janela_meses=j)
        linhas.append(
            {
                "janela_meses": j,
                "mudanca_nivel_pct": r.mudanca_nivel,
                "ic95_inf": r.ic95[0],
                "ic95_sup": r.ic95[1],
                "p_valor": r.p_valor,
                "n": r.n,
            }
        )
    return pd.DataFrame(linhas).set_index("janela_meses")


def variacao(serie: pd.Series, inicio: str | None = None, fim: str | None = None) -> float:
    s = serie.dropna()
    a = s.loc[pd.Period(inicio, "M")] if inicio else s.iloc[0]
    b = s.loc[pd.Period(fim, "M")] if fim else s.iloc[-1]
    return float(b / a - 1)
