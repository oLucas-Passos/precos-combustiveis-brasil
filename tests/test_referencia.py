import numpy as np
import pandas as pd
import pytest

from combustiveis import referencia as ref
from combustiveis.metricas import serie_interrompida


def test_estatisticas_produto(serie_mensal):
    nominal = serie_mensal(np.linspace(2.0, 4.0, 25), inicio="2020-01")
    real = serie_mensal(np.full(25, 3.0), inicio="2020-01")
    e = ref.estatisticas_produto(nominal, real)
    assert e["atual"] == pytest.approx(4.0)
    assert e["var_total_nominal"] == pytest.approx(1.0)
    assert e["var_total_real"] == pytest.approx(0.0)
    assert e["cagr_nominal"] == pytest.approx(2**0.5 - 1)  # dobra em 2 anos
    assert e["var_12m"] == pytest.approx(4.0 / 3.0 - 1)
    assert e["var_60m"] is None
    assert e["max_nominal"] == ["2022-01", pytest.approx(4.0)]


def test_ipca_anual_acumula_variacoes(serie_mensal):
    ipca = serie_mensal([1.0] * 12 + [0.5] * 3, inicio="2023-01")
    anual = ref.ipca_anual(ipca)
    assert anual[2023] == pytest.approx(1.01**12 - 1)
    assert anual[2024] == pytest.approx(1.005**3 - 1)


def test_tabela_anual_variacao_real_zero_quando_preco_acompanha_ipca(serie_mensal):
    ipca = serie_mensal([1.0] * 24, inicio="2023-01")
    indice = (1 + ipca / 100).cumprod()
    brasil = pd.DataFrame({"gasolina": 5 * indice})
    tab = ref.tabela_anual(brasil, ipca)
    assert tab.loc[2024, "gasolina_var_real"] == pytest.approx(0.0, abs=1e-12)
    assert tab.loc[2024, "gasolina_var"] == pytest.approx(1.01**12 - 1)
    assert tab.loc[2023, "meses"] == 12


def test_medias_regionais_ponderadas(painel_pequeno):
    sp = painel_pequeno[painel_pequeno["uf"] == "SP"]
    df = pd.concat([painel_pequeno, sp.assign(uf="RJ", postos=100, preco=8.0)])
    reg = ref.medias_regionais(df)
    # Sudeste: SP (6,00 x 300) e RJ (8,00 x 100) -> 6,50
    assert reg["gasolina"]["Sudeste"].iloc[0] == pytest.approx(6.5)
    assert reg["gasolina"]["Norte"].iloc[0] == pytest.approx(7.0)


def test_tabela_ufs(painel_pequeno):
    df = painel_pequeno.assign(desvio=0.2, preco_real=painel_pequeno["preco"])
    tab = ref.tabela_ufs(df)
    sp = tab["gasolina"]["SP"]
    assert sp["preco"] == 6.0 and sp["postos"] == 300
    assert sp["etanol_max"] == pytest.approx(4.2)
    assert tab["etanol"]["SP"]["razao"] == pytest.approx(0.65)
    assert sp["var_12m"] is None  # só 3 meses de dados


def test_coeficientes_its(serie_mensal):
    rng = np.random.default_rng(3)
    t = np.arange(48)
    s = serie_mensal(
        np.exp(1.8 + 0.01 * t + np.where(t >= 24, -0.2, 0) + rng.normal(0, 0.004, 48)), inicio="2020-07"
    )
    c = ref.coeficientes_its(serie_interrompida(s, intervencao="2022-07", janela_meses=24))
    assert c["coeficientes"]["degrau"]["coef"] == pytest.approx(-0.2, abs=0.02)
    assert c["tendencia_pre_pct_mes"] == pytest.approx(1.0, abs=0.1)
    assert 0 < c["durbin_watson"] < 4
    assert c["n"] == 48


def test_efeito_ponderacao_zero_com_amostra_constante(painel_pequeno):
    r = ref.efeito_ponderacao(painel_pequeno)
    assert r["max_diferenca"] == pytest.approx(0.0, abs=1e-12)
