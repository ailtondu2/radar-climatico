# Radar Climático

Painel web para comparar temperaturas máximas e mínimas previstas em municípios brasileiros.

## Funcionalidades

- Todos os estados e municípios do Brasil via API de Localidades do IBGE
- Busca de cidade por nome
- Seleção simultânea de até cinco cidades, inclusive de estados diferentes
- Identificação visual de cada cidade por cor
- Linhas contínuas para máximas e tracejadas para mínimas
- Períodos de 3, 7, 10, 14 e 16 dias
- Previsão diária consultada no Open-Meteo
- Resumo consolidado do pico de máxima, menor mínima e amplitude média
- Interface responsiva com modo claro e escuro

## Fontes de dados

- [API de Localidades do IBGE](https://servicodados.ibge.gov.br/api/docs/localidades)
- [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)
- [Open-Meteo Forecast API](https://open-meteo.com/en/docs)

## Executar localmente

Como o projeto usa apenas HTML, CSS e JavaScript, basta iniciar um servidor estático:

```bash
python -m http.server 8080
```

Depois acesse `http://localhost:8080`.

> Evite abrir o arquivo diretamente pelo explorador, pois alguns navegadores restringem consultas externas em páginas `file://`.

## Estrutura

- `index.html` — interface
- `styles.css` — identidade visual e responsividade
- `app.js` — integração com IBGE e Open-Meteo, seleção múltipla e gráfico comparativo