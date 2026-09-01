const IBGE_STATES = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome';
const IBGE_CITIES = uf => `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`;
const GEOCODING = name => `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=20&language=pt&format=json&countryCode=BR`;
const FORECAST = (lat, lon, days) => `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=${days}`;

const els = {
  state: document.querySelector('#stateSelect'), citySearch: document.querySelector('#citySearch'),
  city: document.querySelector('#citySelect'), period: document.querySelector('#periodSelect'),
  feedback: document.querySelector('#feedback'), summary: document.querySelector('#summary'),
  chartSection: document.querySelector('#chartSection'), chart: document.querySelector('#temperatureChart'),
  chartWrap: document.querySelector('#chartWrap'), tooltip: document.querySelector('#tooltip'),
  location: document.querySelector('#locationLabel'), updated: document.querySelector('#updatedAt'),
  peakMax: document.querySelector('#peakMax'), peakMaxDate: document.querySelector('#peakMaxDate'),
  lowestMin: document.querySelector('#lowestMin'), lowestMinDate: document.querySelector('#lowestMinDate'),
  avgRange: document.querySelector('#avgRange')
};

let states = [], cities = [], forecast = [], selectedCity = null;
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
    feedback('Digite o nome ou escolha uma cidade.');
    const initial = cities.find(c => c.nome === preferred);
    if (initial) {
      els.city.value = String(initial.id);
      await selectCity(initial);
    }
  } catch {
    feedback('Não foi possível carregar os municípios deste estado.', true);
  }
}

function renderCities(list) {
  els.city.innerHTML = list.length
    ? list.map(c => `<option value="${c.id}">${c.nome}</option>`).join('')
    : '<option disabled>Nenhuma cidade encontrada</option>';
}

async function selectCity(city) {
  selectedCity = city;
  feedback(`Localizando ${city.nome}…`);
  try {
    const geo = await json(GEOCODING(city.nome));
    const stateName = states.find(s => s.sigla === els.state.value)?.nome;
    const result = geo.results?.find(r => normalize(r.name) === normalize(city.nome) && normalize(r.admin1 || '') === normalize(stateName || ''))
      || geo.results?.find(r => normalize(r.name) === normalize(city.nome))
      || geo.results?.[0];
    if (!result) throw new Error('Cidade sem coordenadas');
    await loadForecast(result.latitude, result.longitude);
  } catch {
    forecast = [];
    els.summary.hidden = true; els.chartSection.hidden = true;
    feedback('Não foi possível localizar ou consultar esta cidade. Tente novamente.', true);
  }
}

async function loadForecast(lat, lon) {
  feedback('Consultando a previsão meteorológica…');
  try {
    const days = Number(els.period.value);
    const payload = await json(FORECAST(lat, lon, days));
    forecast = payload.daily.time.map((date, i) => ({
      date, max: payload.daily.temperature_2m_max[i], min: payload.daily.temperature_2m_min[i]
    }));
    updateSummary(); drawChart();
    els.summary.hidden = false; els.chartSection.hidden = false;
    const stateName = states.find(s => s.sigla === els.state.value)?.nome;
    els.location.textContent = `${selectedCity.nome.toUpperCase()} · ${els.state.value}`;
    feedback(`Previsão de ${forecast.length} dias para ${selectedCity.nome}, ${stateName}.`);
    els.updated.textContent = `Atualizado em ${new Intl.DateTimeFormat('pt-BR', {dateStyle:'short', timeStyle:'short'}).format(new Date())}`;
  } catch {
    feedback('O serviço meteorológico não respondeu. Tente novamente em instantes.', true);
  }
}

function updateSummary() {
  const peak = forecast.reduce((a,b) => b.max > a.max ? b : a);
  const low = forecast.reduce((a,b) => b.min < a.min ? b : a);
  const avg = forecast.reduce((sum,d) => sum + d.max - d.min, 0) / forecast.length;
  els.peakMax.textContent = `${peak.max.toFixed(1).replace('.', ',')} °C`;
  els.peakMaxDate.textContent = formatLong(peak.date);
  els.lowestMin.textContent = `${low.min.toFixed(1).replace('.', ',')} °C`;
  els.lowestMinDate.textContent = formatLong(low.date);
  els.avgRange.textContent = `${avg.toFixed(1).replace('.', ',')} °C`;
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k,v));
  return el;
}

function drawChart() {
  if (!forecast.length) return;
  const width = Math.max(320, els.chartWrap.clientWidth);
  const height = width < 560 ? 330 : 390;
  const margin = { top:24, right:22, bottom:54, left:58 };
  const iw = width-margin.left-margin.right, ih=height-margin.top-margin.bottom;
  const all = forecast.flatMap(d => [d.max,d.min]);
  let min = Math.floor(Math.min(...all)-2), max=Math.ceil(Math.max(...all)+2);
  const x = i => margin.left + (forecast.length === 1 ? iw/2 : i*iw/(forecast.length-1));
  const y = v => margin.top + (max-v)*ih/(max-min);
  els.chart.innerHTML = ''; els.chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const title=svgEl('title',{id:'chartTitle'}); title.textContent=`Temperaturas em ${selectedCity.nome}`;
  const desc=svgEl('desc',{id:'chartDescription'}); desc.textContent='Linhas de temperatura máxima e mínima diária em graus Celsius.';
  els.chart.append(title,desc);
  const frame=svgEl('rect',{x:margin.left,y:margin.top,width:iw,height:ih,class:'plot-frame'}); els.chart.append(frame);
  const steps=5;
  for(let i=0;i<=steps;i++){
    const value=min+(max-min)*i/steps, py=y(value);
    els.chart.append(svgEl('line',{x1:margin.left,y1:py,x2:width-margin.right,y2:py,class:'grid-line'}));
    const label=svgEl('text',{x:margin.left-10,y:py+4,class:'axis-label','text-anchor':'end'}); label.textContent=`${Math.round(value)}°`; els.chart.append(label);
  }
  const tickEvery = width < 560 ? Math.ceil(forecast.length/4) : Math.ceil(forecast.length/7);
  forecast.forEach((d,i)=>{
    if(i%tickEvery===0 || i===forecast.length-1){
      const label=svgEl('text',{x:x(i),y:height-20,class:'axis-label','text-anchor':i===0?'start':i===forecast.length-1?'end':'middle'});
      label.textContent=formatDate(d.date); els.chart.append(label);
    }
  });
  ['max','min'].forEach(key=>{
    if(!visible[key]) return;
    const points=forecast.map((d,i)=>`${x(i)},${y(d[key])}`).join(' ');
    els.chart.append(svgEl('polyline',{points,class:`line ${key}`}));
    forecast.forEach((d,i)=>els.chart.append(svgEl('circle',{cx:x(i),cy:y(d[key]),r:4,class:`point ${key}`})));
  });
  const guide=svgEl('line',{y1:margin.top,y2:height-margin.bottom,class:'hover-guide'});
  guide.style.display='none'; els.chart.append(guide);
  const hit=svgEl('rect',{x:margin.left,y:margin.top,width:iw,height:ih,class:'hit-area'});
  hit.addEventListener('pointermove', event => {
    const rect=els.chart.getBoundingClientRect(), px=(event.clientX-rect.left)*width/rect.width;
    const index=Math.max(0,Math.min(forecast.length-1,Math.round((px-margin.left)/iw*(forecast.length-1))));
    const d=forecast[index], gx=x(index);
    guide.setAttribute('x1',gx); guide.setAttribute('x2',gx); guide.style.display='';
    const rows=[`<strong>${formatLong(d.date)}</strong>`];
    if(visible.max) rows.push(`Máxima: ${d.max.toFixed(1).replace('.', ',')} °C`);
    if(visible.min) rows.push(`Mínima: ${d.min.toFixed(1).replace('.', ',')} °C`);
    els.tooltip.innerHTML=rows.join('<br>');
    els.tooltip.style.opacity='1';
    els.tooltip.style.left=`${Math.min(rect.width-158, Math.max(4,event.clientX-rect.left+12))}px`;
    els.tooltip.style.top=`${Math.max(8,event.clientY-rect.top-78)}px`;
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
  if(city) selectCity(city);
});
els.period.addEventListener('change',()=>{ if(selectedCity) selectCity(selectedCity); });
document.querySelectorAll('.legend button').forEach(button=>button.addEventListener('click',()=>{
  const key=button.dataset.series; visible[key]=!visible[key];
  if(!visible.max && !visible.min){ visible[key]=true; return; }
  button.setAttribute('aria-pressed',String(visible[key])); drawChart();
}));
new ResizeObserver(()=>drawChart()).observe(els.chartWrap);
loadStates();