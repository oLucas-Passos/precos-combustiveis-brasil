import pandas as pd
import pytest

from combustiveis import transformacao as tr


def test_indice_ipca_tem_base_igual_a_um(serie_mensal):
    ipca = serie_mensal([1.0, 1.0, 1.0])
    idx = tr.indice_ipca(ipca)
    assert idx.iloc[-1] == pytest.approx(1.0)
    assert idx.iloc[0] == pytest.approx(1 / 1.01**2)


def test_deflacionar_expressa_precos_em_reais_do_mes_base(serie_mensal):
    ipca = serie_mensal([0.0, 10.0], inicio="2024-01")
    df = pd.DataFrame({"mes": pd.PeriodIndex(["2024-01", "2024-02"], freq="M"), "preco": [10.0, 11.0]})
    out = tr.deflacionar(df, ipca)
    # 10 reais em jan valem 11 reais de fev após 10% de inflação.
    assert out["preco_real"].tolist() == pytest.approx([11.0, 11.0])


def test_deflacionar_falha_sem_ipca_para_o_mes(serie_mensal):
    ipca = serie_mensal([0.5], inicio="2024-01")
    df = pd.DataFrame({"mes": pd.PeriodIndex(["2024-01", "2024-02"], freq="M"), "preco": [1.0, 1.0]})
    with pytest.raises(ValueError, match="IPCA ausente"):
        tr.deflacionar(df, ipca, base=pd.Period("2024-01", "M"))


def test_media_nacional_pondera_pelo_numero_de_postos(painel_pequeno):
    media = tr.media_nacional(painel_pequeno)
    # (6 * 300 + 7 * 100) / 400
    assert media["gasolina"].iloc[0] == pytest.approx(6.25)


def test_tabela_larga_reindexa_meses_faltantes(painel_pequeno):
    sem_fev = painel_pequeno[painel_pequeno["mes"] != pd.Period("2024-02", "M")]
    tab = tr.tabela_larga(sem_fev, "gasolina")
    assert len(tab) == 3
    assert tab.loc[pd.Period("2024-02", "M")].isna().all()


def test_razao_etanol_gasolina(painel_pequeno):
    razao = tr.razao_etanol_gasolina(painel_pequeno)
    assert razao["SP"].iloc[0] == pytest.approx(0.65)
    assert razao["AC"].iloc[0] == pytest.approx(0.80)
