import numpy as np
import pandas as pd
import pytest


@pytest.fixture
def painel_pequeno() -> pd.DataFrame:
    """Painel sintético com 2 UFs, 2 produtos e 3 meses."""
    meses = pd.period_range("2024-01", "2024-03", freq="M")
    linhas = []
    for mes in meses:
        for uf, regiao, postos in [("SP", "Sudeste", 300), ("AC", "Norte", 100)]:
            base = 6.0 if uf == "SP" else 7.0
            linhas.append(
                {
                    "mes": mes,
                    "produto": "gasolina",
                    "regiao": regiao,
                    "uf": uf,
                    "postos": postos,
                    "preco": base,
                    "preco_min": base - 0.5,
                    "preco_max": base + 0.5,
                }
            )
            linhas.append(
                {
                    "mes": mes,
                    "produto": "etanol",
                    "regiao": regiao,
                    "uf": uf,
                    "postos": postos,
                    "preco": base * 0.65 if uf == "SP" else base * 0.8,
                    "preco_min": 3.0,
                    "preco_max": 7.0,
                }
            )
    return pd.DataFrame(linhas)


@pytest.fixture
def serie_mensal():
    def _fazer(valores, inicio="2015-01"):
        idx = pd.period_range(inicio, periods=len(valores), freq="M")
        return pd.Series(np.asarray(valores, dtype=float), index=idx)

    return _fazer
