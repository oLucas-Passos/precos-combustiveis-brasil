import pandas as pd
import pytest

from combustiveis.validacao import ErroValidacao, validar_anp


def test_painel_valido_passa(painel_pequeno):
    rel = validar_anp(painel_pequeno)
    assert rel.ok
    assert rel.avisos == []


def test_detecta_duplicatas(painel_pequeno):
    df = pd.concat([painel_pequeno, painel_pequeno.iloc[[0]]])
    with pytest.raises(ErroValidacao, match="duplicados"):
        validar_anp(df)


def test_detecta_preco_fora_da_faixa(painel_pequeno):
    df = painel_pequeno.copy()
    df.loc[0, ["preco", "preco_max"]] = 99.0
    with pytest.raises(ErroValidacao, match="fora de"):
        validar_anp(df)


def test_detecta_uf_nao_mapeada(painel_pequeno):
    df = painel_pequeno.copy()
    df.loc[0, "uf"] = None
    with pytest.raises(ErroValidacao, match="não mapeado"):
        validar_anp(df)


def test_detecta_media_fora_do_intervalo_min_max(painel_pequeno):
    df = painel_pequeno.copy()
    df.loc[0, "preco_min"] = 6.5
    with pytest.raises(ErroValidacao, match="mín, máx"):
        validar_anp(df)


def test_mes_sem_pesquisa_gera_aviso_e_nao_erro(painel_pequeno):
    df = painel_pequeno[painel_pequeno["mes"] != pd.Period("2024-02", "M")]
    rel = validar_anp(df)
    assert rel.ok
    assert any("2024-02" in a for a in rel.avisos)


def test_colunas_ausentes(painel_pequeno):
    with pytest.raises(ErroValidacao, match="Colunas ausentes"):
        validar_anp(painel_pequeno.drop(columns="postos"))
