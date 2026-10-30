"""Pipeline completo: ingestão -> validação -> transformação -> métricas -> exportação.

Uso:
    python -m combustiveis            # roda tudo e grava data/processed e data/precos.json
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd

from . import config, ingestao, metricas, transformacao, validacao

log = logging.getLogger("combustiveis")


@dataclass
class Dados:
    painel: pd.DataFrame  # formato longo, com preco e preco_real
    brasil: pd.DataFrame  # média nacional nominal (mes x produto)
    brasil_real: pd.DataFrame  # média nacional real
    relatorio: validacao.Relatorio


def carregar() -> Dados:
    anp = ingestao.ler_anp()
    rel = validacao.validar_anp(anp)
    for aviso in rel.avisos:
        log.warning(aviso)
    ipca = ingestao.ler_ipca()
    painel = transformacao.deflacionar(anp, ipca)
    return Dados(
        painel=painel,
        brasil=transformacao.media_nacional(painel, "preco"),
        brasil_real=transformacao.media_nacional(painel, "preco_real"),
        relatorio=rel,
    )


def _lista(serie: pd.Series, meses: pd.PeriodIndex, casas: int = 3) -> list:
    s = serie.reindex(meses)
    return [None if pd.isna(v) else round(float(v), casas) for v in s]


def calcular_resumo(d: Dados) -> dict:
    """Números citados no README e no dashboard."""
    b, br = d.brasil, d.brasil_real
    razao = transformacao.razao_etanol_gasolina(d.painel)
    ultimo = d.painel["mes"].max()
    gas_ultimo = transformacao.tabela_larga(d.painel, "gasolina").loc[ultimo]
    its = {p: metricas.serie_interrompida(br[p]) for p in ("gasolina", "etanol", "diesel")}
    return {
        "periodo": [str(d.painel["mes"].min()), str(ultimo)],
        "registros": int(len(d.painel)),
        "variacao_nominal": {p: metricas.variacao(b[p]) for p in b.columns},
        "variacao_real": {p: metricas.variacao(br[p]) for p in br.columns},
        "ipca_acumulado": float(transformacao.indice_ipca(ingestao.ler_ipca(), ultimo).iloc[0] ** -1 - 1),
        "pico_real": {p: [str(br[p].idxmax()), float(br[p].max())] for p in br.columns},
        "volatilidade_regime": metricas.volatilidade_por_regime(b[["gasolina", "etanol", "diesel"]])
        .drop(columns=["inicio", "fim"])
        .to_dict(orient="index"),
        "sazonalidade_etanol": metricas.sazonalidade(b["etanol"])["efeito_pct"].to_dict(),
        "its_icms": {
            p: {"mudanca_nivel_pct": r.mudanca_nivel, "ic95": r.ic95, "p_valor": r.p_valor, "n": r.n}
            for p, r in its.items()
        },
        "its_icms_robustez": {
            p: metricas.robustez_its(br[p])["mudanca_nivel_pct"].to_dict()
            for p in ("gasolina", "etanol", "diesel")
        },
        "paridade_etanol": metricas.participacao_paridade(razao).to_dict(),
        "paridade_hoje": sorted(razao.loc[ultimo][razao.loc[ultimo] <= config.LIMITE_PARIDADE_ETANOL].index),
        "dispersao_gasolina_atual": {
            "amplitude": float(gas_ultimo.max() - gas_ultimo.min()),
            "min": [gas_ultimo.idxmin(), float(gas_ultimo.min())],
            "max": [gas_ultimo.idxmax(), float(gas_ultimo.max())],
        },
    }


def montar_dashboard(d: Dados, resumo: dict) -> dict:
    meses = pd.period_range(d.painel["mes"].min(), d.painel["mes"].max(), freq="M")
    produtos = list(config.PRODUTOS.values())
    ufs = sorted(d.painel["uf"].unique())
    regioes = d.painel.drop_duplicates("uf").set_index("uf")["regiao"].to_dict()

    series = {}
    for col in ("preco", "preco_real"):
        series[col] = {
            p: {uf: _lista(transformacao.tabela_larga(d.painel, p, col)[uf], meses) for uf in ufs}
            for p in produtos
        }

    gas = transformacao.tabela_larga(d.painel, "gasolina")
    saz = {
        p: metricas.sazonalidade(d.brasil[p])
        .reset_index()
        .rename(columns={"mes": "m"})
        .round(3)
        .to_dict(orient="records")
        for p in ("gasolina", "etanol")
    }

    return {
        "fonte": "ANP (Levantamento de Preços de Combustíveis) e BCB (IPCA, SGS 433)",
        "baseReal": str(meses.max()),
        "limiteEtanol": config.LIMITE_PARIDADE_ETANOL,
        "meses": [str(m) for m in meses],
        "estados": {uf: {"nome": config.NOMES_UF[uf], "regiao": regioes[uf]} for uf in ufs},
        "eventos": [{"mes": m, "rotulo": r} for m, r in config.EVENTOS],
        "regimes": [{"nome": n, "inicio": i, "fim": f} for n, i, f in config.REGIMES_PRECO],
        "brasil": {p: _lista(d.brasil[p], meses) for p in produtos},
        "brasilReal": {p: _lista(d.brasil_real[p], meses) for p in produtos},
        "series": series["preco"],
        "seriesReal": series["preco_real"],
        "volatilidadeMovel": {
            p: _lista(metricas.volatilidade_movel(d.brasil[p]), meses, 4)
            for p in ("gasolina", "etanol", "diesel")
        },
        "dispersao": _lista(metricas.dispersao_regional(gas), meses, 4),
        "sazonalidade": saz,
        "icms": _dados_its(d),
        "resumo": resumo,
    }


def _dados_its(d: Dados) -> dict:
    """Série observada, ajuste e contrafactual da regressão segmentada, para o gráfico."""
    t0 = pd.Period(config.MES_INTERVENCAO_ICMS, "M")
    out = {"intervencao": str(t0)}
    for p in ("gasolina", "etanol", "diesel"):
        r = metricas.serie_interrompida(d.brasil_real[p])
        s = d.brasil_real[p].dropna().loc[t0 - 12 : t0 + 11]
        X, b = r.modelo.model.exog, r.modelo.params
        out[p] = {
            "meses": [str(m) for m in s.index],
            "observado": [round(float(v), 3) for v in s.values],
            "ajuste": [round(float(v), 3) for v in np.exp(r.modelo.fittedvalues)],
            "contrafactual": [round(float(v), 3) for v in np.exp(X[:, 0] * b[0] + X[:, 1] * b[1])],
        }
    return out


def _json_padrao(o):
    if isinstance(o, (np.floating, np.integer)):
        return o.item()
    if isinstance(o, pd.Period):
        return str(o)
    raise TypeError(type(o))


def executar() -> dict:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    d = carregar()
    log.info("Painel: %d registros, %s a %s", len(d.painel), d.painel["mes"].min(), d.painel["mes"].max())

    config.DIR_PROCESSADO.mkdir(parents=True, exist_ok=True)
    (
        d.painel.assign(mes=d.painel["mes"].astype(str)).to_csv(
            config.DIR_PROCESSADO / "painel_precos.csv", index=False, float_format="%.4f"
        )
    )

    resumo = calcular_resumo(d)
    (config.DIR_PROCESSADO / "resumo.json").write_text(
        json.dumps(resumo, ensure_ascii=False, indent=2, default=_json_padrao), encoding="utf-8"
    )

    dash = montar_dashboard(d, resumo)
    config.ARQ_DASHBOARD.write_text(
        json.dumps(dash, ensure_ascii=False, separators=(",", ":"), default=_json_padrao), encoding="utf-8"
    )
    log.info("Arquivos gravados em data/processed e data/precos.json")
    return resumo


if __name__ == "__main__":
    executar()
