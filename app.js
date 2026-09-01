const IBGE_STATES = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome';
const IBGE_CITIES = uf => `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`;
const GEOCODING = name => `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=20&language=pt&format=json&countryCode=BR`;
const FORECAST = (lat, lon, days) => `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=${days}`;
const MAX_CITIES = 5;

const els = {
  state: document.querySelector('#stateSelect'), citySearch: document.querySelector('#citySearch'),
  city: document.querySelector('#citySelect'), period: document.querySelector('#periodSelect'),
  selectedCities: document.querySelector('#selectedCities'), cityLegend: document.querySelector('#cityLegend'),
  feedback: document.querySelector('#feedback'), summary: document.querySelector('#summary'),
  chartSection: document.querySelector('#chartSection'), chart: document.querySelector('#temperatureChart'),
  chartWrap: document.querySelector('#chartWrap'), tooltip: document.querySelector('#tooltip'),
  location: document.querySelector('#locationLabel'), updated: document.querySelector('#updatedAt'),
  peakMax: document.querySelector('#peakMax'), peakMaxDate: document.querySelector('#peakMaxDate'),
  lowestMin: document.querySelector('#lowestMin'), lowestMinDate: document.querySelector('#lowestMinDate'),
  avgRange: document.querySelector('#avgRange')
};

let states = [], cities = [], selected = [];
const visible = { max: true, min: true };
const formatDate = iso => new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'2-digit' }).format(new Date(iso + 'T12:00:00'));
const formatLong = iso => new Intl.DateTimeFormat('pt-BR', { weekday:'short', day:'2-digit', month:'short' }).format(new Date(iso + 'T12:00:00'));
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha na consulta (${response.status})`);
  return response.json();
}

function feedback(message, error = false) {
  els.feedback.textContent = message;
  els.feedback.classList.toggle('error', error);
}

async function loadStates() {
  try {
    states = await json(IBGE_STATES);
    els.state.innerHTML = '<option value="">Selecione um estado</option>' +
      states.map(s => `<option value="${s.sigla}">${s.nome}</option>`).join('');
    els.state.disabled = false;
    els.state.value = 'SP';
    await loadCities('SP', 'Itu');
  } catch {
    feedback('Não foi possível carregar os estados. Verifique sua conexão e tente novamente.', true);
  }
}

async function loadCities(uf, preferred) {
  if (!uf) return;
  els.citySearch.disabled = true; els.city.disabled = true;
  feedback('Carregando municípios…');
  try {
    cities = await json(IBGE_CITIES(uf));
    els.citySearch.value = '';
    els.citySearch.disabled = false; els.city.disabled = false;
    renderCities(cities);
    feedback(selected.length ? 'Busque outra cidade para adicionar ao comparativo.' : 'Adicione até cinco cidades para comparar.');
    const initial = !selected.length && cities.find(c => c.nome === preferred);
    if (initial) await addCity(initial);
  } catch {
    feedback('Não foi possível carregar os municípios deste estado.', true);
  }
}

function renderCities(list) {
  const available = list.filter(c => !selected.some(s => s.id === c.id));
  els.city.innerHTML = available.length
    ? '<option value="">Selecione uma cidade</option>' + available.map(c => `<option value="${c.id}">${c.nome}</option>`).join('')
    : '<option disabled>Nenhuma cidade disponível</option>';
}

async function resolveCity(city) {
  const uf = els.state.value;
  const stateName = states.find(s => s.sigla === uf)?.nome || '';
  const geo = await json(GEOCODING(city.nome));
  const result = geo.results?.find(r => normalize(r.name) === normalize(city.nome) && normalize(r.admin1 || '') === normalize(stateName))
    || geo.results?.find(r => normalize(r.name) === normalize(city.nome))
    || geo.results?.[0];
  if (!result) throw new Error('Cidade sem coordenadas');
  return { id:city.id, name:city.nome, uf, stateName, latitude:result.latitude, longitude:result.longitude, forecast:[] };
}

async function addCity(city) {
  if (selected.some(s => s.id === city.id)) return;
  if (selected.length >= MAX_CITIES) {
    feedback('O comparativo aceita até cinco cidades. Remova uma para adicionar outra.', true);
    return;
  }
  feedback(`Adicionando ${city.nome}…`);
  els.city.disabled = true;
  try {
    const item = await resolveCity(city);
    selected.push(item);
    await loadCityForecast(item);
    renderSelection();
    renderCities(cities);
    updateView();
    feedback(`${city.nome} adicionada. ${selected.length} de ${MAX_CITIES} cidades selecionadas.`);
  } catch {
    feedback(`Não foi possível localizar ou consultar ${city.nome}. Tente novamente.`, true);
  } finally {
    els.city.disabled = false; els.city.value = ''; els.citySearch.value = '';
  }
}

async function loadCityForecast(item) {
  const payload = await json(FORECAST(item.latitude, item.longitude, Number(els.period.value)));
  item.forecast = payload.daily.time.map((date, i) => ({
    date, max:payload.daily.temperature_2m_max[i], min:payload.daily.temperature_2m_min[i]
  }));
}

async function reloadForecasts() {
  if (!selected.length) return;
  feedback('Atualizando o período para todas as cidades…');
  els.period.disabled = true;
  try {
    await Promise.all(selected.map(loadCityForecast));
    updateView();
    feedback(`Previsão de ${els.period.value} dias atualizada para ${selected.length} ${selected.length === 1 ? 'cidade' : 'cidades'}.`);
  } catch {
    feedback('Não foi possível atualizar todas as previsões. Tente novamente.', true);
  } finally {
    els.period.disabled = false;
  }
}

function removeCity(id) {
  selected = selected.filter(city => city.id !== id);
  renderSelection(); renderCities(cities); updateView();
  feedback(selected.length ? `${selected.length} ${selected.length === 1 ? 'cidade selecionada' : 'cidades selecionadas'}.` : 'Adicione até cinco cidades para comparar.');
}

function renderSelection() {
  els.selectedCities.innerHTML = selected.map((city, index) =>
    `<span class="city-chip" style="--chip-color:var(--city-${index + 1})"><i></i>${city.name} · ${city.uf}<button type="button" data-remove="${city.id}" aria-label="Remover ${city.name}">×</button></span>`
  ).join('');
  els.selectedCities.querySelectorAll('[data-remove]').forEach(button =>
    button.addEventListener('click', () => removeCity(Number(button.dataset.remove)))
  );
  els.cityLegend.innerHTML = selected.map((city, index) =>
    `<span><i style="background:var(--city-${index + 1})"></i>${city.name} · ${city.uf}</span>`
  ).join('');
}

function updateView() {
  const hasData = selected.some(city => city.forecast.length);
  els.summary.hidden = !hasData; els.chartSection.hidden = !hasData;
  if (!hasData) return;
  updateSummary(); drawChart();
  els.location.textContent = selected.length === 1 ? `${selected[0].name.toUpperCase()} · ${selected[0].uf}` : `COMPARATIVO · ${selected.length} CIDADES`;
  els.updated.textContent = `Atualizado em ${new Intl.DateTimeFormat('pt-BR', {dateStyle:'short', timeStyle:'short'}).format(new Date())}`;
}

function updateSummary() {
  const observations = selected.flatMap(city => city.forecast.map(day => ({...day, city:city.name, uf:city.uf})));
  const peak = observations.reduce((a,b) => b.max > a.max ? b : a);
  const low = observations.reduce((a,b) => b.min < a.min ? b : a);
  const avg = observations.reduce((sum,d) => sum + d.max - d.min, 0) / observations.length;
  els.peakMax.textContent = `${peak.max.toFixed(1).replace('.', ',')} °C`;
  els.peakMaxDate.textContent = `${peak.city} · ${formatLong(peak.date)}`;
  els.lowestMin.textContent = `${low.min.toFixed(1).replace('.', ',')} °C`;
  els.lowestMinDate.textContent = `${low.city} · ${formatLong(low.date)}`;
  els.avgRange.textContent = `${avg.toFixed(1).replace('.', ',')} °C`;
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([key,value]) => el.setAttribute(key,value));
  return el;
}

function drawChart() {
  const datasets = selected.filter(city => city.forecast.length);
  if (!datasets.length) return;
  const days = datasets[0].forecast;
  const width = Math.max(320, els.chartWrap.clientWidth);
  const height = width < 560 ? 350 : 410;
  const margin = { top:24, right:22, bottom:54, left:58 };
  const iw = width-margin.left-margin.right, ih=height-margin.top-margin.bottom;
  const all = datasets.flatMap(city => city.forecast.flatMap(d => [d.max,d.min]));
  const min = Math.floor(Math.min(...all)-2), max=Math.ceil(Math.max(...all)+2);
  const x = i => margin.left + (days.length === 1 ? iw/2 : i*iw/(days.length-1));
  const y = value => margin.top + (max-value)*ih/(max-min);
  els.chart.innerHTML = ''; els.chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const title=svgEl('title',{id:'chartTitle'}); title.textContent=`Comparação de temperaturas em ${datasets.map(c=>c.name).join(', ')}`;
  const desc=svgEl('desc',{id:'chartDescription'}); desc.textContent='Linhas contínuas para máximas e tracejadas para mínimas, em graus Celsius.';
  els.chart.append(title,desc,svgEl('rect',{x:margin.left,y:margin.top,width:iw,height:ih,class:'plot-frame'}));
  for(let i=0;i<=5;i++){
    const value=min+(max-min)*i/5, py=y(value);
    els.chart.append(svgEl('line',{x1:margin.left,y1:py,x2:width-margin.right,y2:py,class:'grid-line'}));
    const label=svgEl('text',{x:margin.left-10,y:py+4,class:'axis-label','text-anchor':'end'}); label.textContent=`${Math.round(value)}°`; els.chart.append(label);
  }
  const tickEvery = width < 560 ? Math.ceil(days.length/4) : Math.ceil(days.length/7);
  days.forEach((day,i)=>{
    if(i%tickEvery===0 || i===days.length-1){
      const label=svgEl('text',{x:x(i),y:height-20,class:'axis-label','text-anchor':i===0?'start':i===days.length-1?'end':'middle'});
      label.textContent=formatDate(day.date); els.chart.append(label);
    }
  });
  datasets.forEach((city, cityIndex) => {
    ['max','min'].forEach(key => {
      if(!visible[key]) return;
      const points=city.forecast.map((d,i)=>`${x(i)},${y(d[key])}`).join(' ');
      els.chart.append(svgEl('polyline',{points,class:`series-line ${key}`,style:`--series-color:var(--city-${cityIndex+1})`}));
      city.forecast.forEach((d,i)=>els.chart.append(svgEl('circle',{cx:x(i),cy:y(d[key]),r:3.5,class:`series-point ${key}`,style:`--series-color:var(--city-${cityIndex+1})`})));
    });
  });
  const guide=svgEl('line',{y1:margin.top,y2:height-margin.bottom,class:'hover-guide'}); guide.style.display='none'; els.chart.append(guide);
  const hit=svgEl('rect',{x:margin.left,y:margin.top,width:iw,height:ih,class:'hit-area'});
  hit.addEventListener('pointermove', event => {
    const rect=els.chart.getBoundingClientRect(), px=(event.clientX-rect.left)*width/rect.width;
    const index=Math.max(0,Math.min(days.length-1,Math.round((px-margin.left)/iw*(days.length-1))));
    guide.setAttribute('x1',x(index)); guide.setAttribute('x2',x(index)); guide.style.display='';
    const rows=[`<strong>${formatLong(days[index].date)}</strong>`];
    datasets.forEach(city => {
      const d=city.forecast[index];
      const values=[]; if(visible.max) values.push(`máx. ${d.max.toFixed(1).replace('.', ',')}°`); if(visible.min) values.push(`mín. ${d.min.toFixed(1).replace('.', ',')}°`);
      rows.push(`<span>${city.name}:</span> ${values.join(' · ')}`);
    });
    els.tooltip.innerHTML=rows.join('<br>'); els.tooltip.style.opacity='1';
    els.tooltip.style.left=`${Math.min(rect.width-220,Math.max(4,event.clientX-rect.left+12))}px`;
    els.tooltip.style.top=`${Math.max(8,event.clientY-rect.top-(74+datasets.length*18))}px`;
  });
  hit.addEventListener('pointerleave',()=>{guide.style.display='none';els.tooltip.style.opacity='0';});
  els.chart.append(hit);
}

els.state.addEventListener('change',()=>loadCities(els.state.value));
els.citySearch.addEventListener('input',()=>{
  const query=normalize(els.citySearch.value.trim());
  renderCities(query ? cities.filter(c=>normalize(c.nome).includes(query)) : cities);
});
els.city.addEventListener('change',()=>{
  const city=cities.find(c=>String(c.id)===els.city.value);
  if(city) addCity(city);
});
els.period.addEventListener('change',reloadForecasts);
document.querySelectorAll('.metric-legend button').forEach(button=>button.addEventListener('click',()=>{
  const key=button.dataset.series; visible[key]=!visible[key];
  if(!visible.max && !visible.min){ visible[key]=true; return; }
  button.setAttribute('aria-pressed',String(visible[key])); drawChart();
}));
new ResizeObserver(()=>drawChart()).observe(els.chartWrap);
loadStates();