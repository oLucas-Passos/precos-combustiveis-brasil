.PHONY: instalar dados testes lint notebook servir tudo

instalar:
	pip install -e ".[dev,notebook]"

dados:            ## ingestão, validação, métricas e exportação para o dashboard
	python -m combustiveis

testes:
	pytest --cov=combustiveis --cov-report=term-missing

lint:
	ruff check src tests

notebook:         ## reexecuta o notebook e salva os resultados
	jupyter nbconvert --to notebook --execute --inplace notebooks/analise.ipynb

servir:           ## abre o dashboard em http://localhost:8000
	python -m http.server 8000

tudo: lint testes dados notebook
