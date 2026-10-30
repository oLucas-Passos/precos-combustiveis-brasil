import numpy as np
import pandas as pd
import pytest

from combustiveis import metricas as m


def test_volatilidade_de_serie_constante_e_zero(serie_mensal):
    assert m.volatilidade_anualizada(serie_mensal([5.0] * 24)) == pytest.approx(0.0)


def test_volatilidade_anualizada_escala_por_raiz_de_12(serie_mensal):
    rng = np.random.default_rng(0)
    r = rng.normal(0, 0.02, 2000)
    s = serie_mensal(np.exp(np.cumsum(r)))
    assert m.volatilidade_anualizada(s) == pytest.approx(0.02 * np.sqrt(12), rel=0.05)


def test_sazonalidade_recupera_padrao_injetado(serie_mensal):
    meses = np.tile(np.arange(12), 10)
    efeito = 0.05 * np.sin(2 * np.pi * meses / 12)
    s = serie_mensal(np.exp(np.log(5) + 0.002 * np.arange(120) + efeito), inicio="2010-01")
    saz = m.sazonalidade(s)
    esperado = 100 * 0.05 * np.sin(2 * np.pi * np.arange(12) / 12)
    assert np.allclose(saz["efeito_pct"].values, esperado, atol=0.6)


def test_serie_interrompida_estima_quebra_de_nivel(serie_mensal):
    rng = np.random.default_rng(1)
    n = 48
    t = np.arange(n)
    queda = np.where(t >= 24, np.log(0.8), 0.0)  # queda de 20% em 2022-07
    s = serie_mensal(np.exp(np.log(6) + 0.005 * t + queda + rng.normal(0, 0.005, n)), inicio="2020-07")
    r = m.serie_interrompida(s, intervencao="2022-07", janela_meses=24)
    assert r.mudanca_nivel == pytest.approx(-20, abs=1.5)
    assert r.ic95[0] < r.mudanca_nivel < r.ic95[1]
    assert r.p_valor < 0.001


def test_serie_interrompida_sem_efeito_nao_e_significativa(serie_mensal):
    rng = np.random.default_rng(2)
    t = np.arange(48)
    s = serie_mensal(np.exp(np.log(6) + 0.004 * t + rng.normal(0, 0.01, 48)), inicio="2020-07")
    r = m.serie_interrompida(s, intervencao="2022-07", janela_meses=24)
    assert r.ic95[0] < 0 < r.ic95[1]


def test_dispersao_regional():
    tab = pd.DataFrame({"A": [5.0, 5.0], "B": [5.0, 7.0]})
    cv = m.dispersao_regional(tab)
    assert cv.iloc[0] == pytest.approx(0.0)
    assert cv.iloc[1] == pytest.approx(np.std([5, 7], ddof=1) / 6)


def test_participacao_paridade_ignora_meses_sem_dado():
    razao = pd.DataFrame({"SP": [0.6, 0.65, 0.75, np.nan], "CE": [0.8, 0.8, 0.8, 0.8]})
    share = m.participacao_paridade(razao, limite=0.7)
    assert share["SP"] == pytest.approx(2 / 3)
    assert share["CE"] == 0


def test_variacao(serie_mensal):
    s = serie_mensal([2.0, 3.0, 4.0])
    assert m.variacao(s) == pytest.approx(1.0)
    assert m.variacao(s, inicio="2015-02") == pytest.approx(1 / 3)
