"""Constantes do projeto: caminhos, mapeamentos e marcos regulatórios."""

from __future__ import annotations

from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DIR_RAW = RAIZ / "data" / "raw"
DIR_PROCESSADO = RAIZ / "data" / "processed"
DIR_FIGURAS = RAIZ / "docs" / "figuras"

ARQ_ANP = DIR_RAW / "mensal-estados-desde-jan2013.xlsx"
ARQ_IPCA = DIR_RAW / "ipca_bcb_433.csv"
ARQ_DASHBOARD = RAIZ / "data" / "precos.json"

# Linhas de cabeçalho e observações antes da tabela na planilha da ANP.
ANP_LINHAS_CABECALHO = 16

COLUNAS_ANP = {
    "MÊS": "mes",
    "PRODUTO": "produto",
    "REGIÃO": "regiao",
    "ESTADO": "estado",
    "NÚMERO DE POSTOS PESQUISADOS": "postos",
    "PREÇO MÉDIO REVENDA": "preco",
    "DESVIO PADRÃO REVENDA": "desvio",
    "PREÇO MÍNIMO REVENDA": "preco_min",
    "PREÇO MÁXIMO REVENDA": "preco_max",
}

PRODUTOS = {
    "GASOLINA COMUM": "gasolina",
    "ETANOL HIDRATADO": "etanol",
    "OLEO DIESEL S10": "diesel",
    "GLP": "glp",
}

UNIDADES = {"gasolina": "R$/l", "etanol": "R$/l", "diesel": "R$/l", "glp": "R$/13kg"}

SIGLAS = {
    "ACRE": "AC",
    "ALAGOAS": "AL",
    "AMAPA": "AP",
    "AMAZONAS": "AM",
    "BAHIA": "BA",
    "CEARA": "CE",
    "DISTRITO FEDERAL": "DF",
    "ESPIRITO SANTO": "ES",
    "GOIAS": "GO",
    "MARANHAO": "MA",
    "MATO GROSSO": "MT",
    "MATO GROSSO DO SUL": "MS",
    "MINAS GERAIS": "MG",
    "PARA": "PA",
    "PARAIBA": "PB",
    "PARANA": "PR",
    "PERNAMBUCO": "PE",
    "PIAUI": "PI",
    "RIO DE JANEIRO": "RJ",
    "RIO GRANDE DO NORTE": "RN",
    "RIO GRANDE DO SUL": "RS",
    "RONDONIA": "RO",
    "RORAIMA": "RR",
    "SANTA CATARINA": "SC",
    "SAO PAULO": "SP",
    "SERGIPE": "SE",
    "TOCANTINS": "TO",
}

NOMES_UF = {
    "AC": "Acre",
    "AL": "Alagoas",
    "AP": "Amapá",
    "AM": "Amazonas",
    "BA": "Bahia",
    "CE": "Ceará",
    "DF": "Distrito Federal",
    "ES": "Espírito Santo",
    "GO": "Goiás",
    "MA": "Maranhão",
    "MT": "Mato Grosso",
    "MS": "Mato Grosso do Sul",
    "MG": "Minas Gerais",
    "PA": "Pará",
    "PB": "Paraíba",
    "PR": "Paraná",
    "PE": "Pernambuco",
    "PI": "Piauí",
    "RJ": "Rio de Janeiro",
    "RN": "Rio Grande do Norte",
    "RS": "Rio Grande do Sul",
    "RO": "Rondônia",
    "RR": "Roraima",
    "SC": "Santa Catarina",
    "SP": "São Paulo",
    "SE": "Sergipe",
    "TO": "Tocantins",
}

# Relação de paridade etanol/gasolina (rendimento energético aproximado).
LIMITE_PARIDADE_ETANOL = 0.70

# Regimes de política de preços da Petrobras, usados para comparar volatilidade.
REGIMES_PRECO = [
    ("Preço administrado", "2013-01", "2016-09"),
    ("Paridade de importação (PPI)", "2016-10", "2023-04"),
    ("Nova política comercial", "2023-05", None),
]

# Eventos marcados nas séries.
EVENTOS = [
    ("2016-10", "Petrobras adota paridade de importação"),
    ("2018-05", "Greve dos caminhoneiros"),
    ("2020-03", "Início da pandemia"),
    ("2022-03", "Guerra na Ucrânia"),
    ("2022-07", "Teto do ICMS (LC 194/2022)"),
    ("2023-05", "Fim da paridade de importação"),
]

MES_INTERVENCAO_ICMS = "2022-07"
