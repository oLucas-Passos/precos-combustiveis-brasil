"""Testes de integração com os dados reais (pulados se a planilha não estiver presente)."""

import pytest

from combustiveis import config, pipeline

pytestmark = pytest.mark.skipif(not config.ARQ_ANP.exists(), reason="planilha da ANP ausente")


@pytest.fixture(scope="module")
def dados():
    return pipeline.carregar()


def test_painel_cobre_27_ufs_e_4_produtos(dados):
    assert dados.painel["uf"].nunique() == 27
    assert set(dados.painel["produto"]) == set(config.PRODUTOS.values())


def test_periodo_comeca_em_2013(dados):
    assert str(dados.painel["mes"].min()) == "2013-01"


def test_preco_real_igual_ao_nominal_no_mes_base(dados):
    ultimo = dados.painel[dados.painel["mes"] == dados.painel["mes"].max()]
    assert (ultimo["preco_real"] - ultimo["preco"]).abs().max() < 1e-9


def test_media_nacional_fica_entre_min_e_max_das_ufs(dados):
    from combustiveis.transformacao import tabela_larga

    tab = tabela_larga(dados.painel, "gasolina").dropna(how="all")
    media = dados.brasil["gasolina"].reindex(tab.index)
    assert ((media >= tab.min(axis=1) - 1e-9) & (media <= tab.max(axis=1) + 1e-9)).all()


def test_dashboard_tem_series_alinhadas(dados):
    resumo = pipeline.calcular_resumo(dados)
    dash = pipeline.montar_dashboard(dados, resumo)
    n = len(dash["meses"])
    for produto, por_uf in dash["series"].items():
        assert all(len(v) == n for v in por_uf.values()), produto
    assert len(dash["brasilReal"]["gasolina"]) == n
