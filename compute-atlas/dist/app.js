const byId = id => document.getElementById(id);
const integer = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumSignificantDigits: 3,
});
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 2,
});
const available = value => value !== null;
const plottable = model => model.compute > 0 && model.cost > 0;
const compute = value => available(value) ? value.toExponential(2).replace('e+', 'e') + ' FLOP' : 'Unavailable';
const cost = value => available(value) ? (value < 1000 ? usd : compact).format(value) : 'Unavailable';
const filters = byId('filters');
const sort = byId('sort');
const plot = byId('plot');
const pageSize = 12;
let page = 0;
let results = [];

function element(tag, content, className) {
  const node = document.createElement(tag);
  if (content !== undefined) node.textContent = content;
  if (className) node.className = className;
  return node;
}

function definition(label, value) {
  const row = element('div');
  row.append(element('dt', label), element('dd', value));
  return row;
}

const coverage = [
  ['Models in catalog', models.length],
  ['With compute', models.filter(model => available(model.compute)).length],
  ['With cost', models.filter(model => available(model.cost)).length],
];
for (const [label, count] of coverage) {
  const item = definition(label, integer.format(count));
  item.prepend(item.lastChild);
  byId('coverage').append(item);
}

const domains = [...new Set(models.flatMap(model => model.domains))].sort((a, b) => a.localeCompare(b));
for (const domain of domains) byId('domain').add(new Option(domain, domain));

function showDetails(model) {
  byId('detail-title').textContent = model.name;
  byId('detail-org').textContent = [model.org, model.date].filter(Boolean).join(' · ');
  byId('detail-metrics').replaceChildren(
    definition('Training compute', compute(model.compute)),
    definition('Training cost (2023 USD)', available(model.cost) ? usd.format(model.cost) : 'Unavailable'),
    definition('Domain', model.domains.join(', ') || 'Unavailable'),
  );
  const link = byId('detail-link');
  link.hidden = true;
  link.removeAttribute('href');
  try {
    const url = new URL(model.link);
    if (['https:', 'http:'].includes(url.protocol)) {
      link.href = url.href;
      link.hidden = false;
    }
  } catch {
    // Some entries have no usable source URL.
  }
  byId('details').showModal();
}

function range(metric) {
  return ['min', 'max'].map(end => {
    const input = byId(metric + '-' + end);
    return {value: input.value === '' ? null : input.valueAsNumber, valid: input.validity.valid};
  });
}

function within(value, [min, max]) {
  if (min.value === null && max.value === null) return true;
  return available(value) && (min.value === null || value >= min.value) && (max.value === null || value <= max.value);
}

function refresh() {
  const query = byId('query').value.trim().toLowerCase();
  const domain = byId('domain').value;
  const complete = byId('complete').checked;
  const computeRange = range('compute');
  const costRange = range('cost');
  const error = byId('filter-error');
  let message = '';
  for (const [label, [min, max]] of [['Compute', computeRange], ['Cost', costRange]]) {
    if (!min.valid || !max.valid) {
      message = label + ' bounds must be valid nonnegative numbers.';
      break;
    }
    if (min.value !== null && max.value !== null && min.value > max.value) {
      message = label + ' minimum must be at most the maximum.';
      break;
    }
  }
  error.hidden = !message;
  error.textContent = message;
  if (message) return;

  results = models.filter(model =>
    (!query || (model.name + ' ' + model.org).toLowerCase().includes(query)) &&
    (!domain || model.domains.includes(domain)) &&
    (!complete || (available(model.compute) && available(model.cost))) &&
    within(model.compute, computeRange) && within(model.cost, costRange)
  );
  const [key, direction] = sort.value.split('-');
  const sign = direction === 'asc' ? 1 : -1;
  results.sort((a, b) => {
    const left = a[key];
    const right = b[key];
    if (left === right) return a.name.localeCompare(b.name);
    if (left === null || left === '') return 1;
    if (right === null || right === '') return -1;
    return sign * (typeof left === 'number' ? left - right : left.localeCompare(right));
  });
  page = 0;
  renderTable();
  renderPlot();
}

function renderTable() {
  const start = page * pageSize;
  const rows = results.slice(start, start + pageSize).map(model => {
    const row = element('tr');
    const identity = element('td');
    const button = element('button', model.name, 'model-button');
    button.type = 'button';
    button.addEventListener('click', () => showDetails(model));
    identity.append(button);
    if (model.org) identity.append(element('small', model.org));
    row.append(identity, element('td', model.domains.join(', ') || 'Unavailable'), element('td', model.date || 'Unavailable'));
    row.append(element('td', compute(model.compute), available(model.compute) ? '' : 'missing'));
    row.append(element('td', cost(model.cost), available(model.cost) ? '' : 'missing'));
    return row;
  });
  if (!rows.length) {
    const row = element('tr');
    const cell = element('td', 'No models match these filters.', 'empty-cell');
    cell.colSpan = 5;
    row.append(cell);
    rows.push(row);
  }
  byId('rows').replaceChildren(...rows);
  byId('results-count').textContent = integer.format(results.length) + ' of ' + integer.format(models.length) + ' models';
  byId('page-label').textContent = results.length
    ? integer.format(start + 1) + '–' + integer.format(Math.min(start + pageSize, results.length))
    : '0 results';
  byId('prev').disabled = page === 0;
  byId('next').disabled = start + pageSize >= results.length;
}

function svgElement(tag, attributes, content) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (content !== undefined) node.textContent = content;
  return node;
}

function logExtent(points, key) {
  const values = points.map(model => Math.log10(model[key]));
  const lower = Math.floor(Math.min(...values));
  return [lower, Math.max(lower + 1, Math.ceil(Math.max(...values)))];
}

function renderPlot() {
  const points = results.filter(plottable);
  byId('plot-summary').textContent = integer.format(points.length) + ' of ' + integer.format(results.length) + ' matching models have both metrics';
  if (!points.length) {
    plot.replaceChildren(element('p', 'No matching models can be plotted.', 'empty'));
    return;
  }
  const width = plot.clientWidth;
  const height = plot.clientHeight;
  if (!width || !height) return;
  const left = 64;
  const right = width - 19;
  const top = 12;
  const bottom = height - 56;
  const [xMin, xMax] = logExtent(points, 'compute');
  const [yMin, yMax] = logExtent(points, 'cost');
  const x = exponent => left + (exponent - xMin) / (xMax - xMin) * (right - left);
  const y = exponent => bottom - (exponent - yMin) / (yMax - yMin) * (bottom - top);
  const svg = svgElement('svg', {viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-label': 'Logarithmic scatter plot'});
  const grid = svgElement('g', {stroke: '#e4ebe2'});
  const labels = svgElement('g', {fill: '#54635a', 'font-size': 10, 'font-family': 'ui-monospace, monospace'});
  const xStep = Math.max(1, Math.ceil((xMax - xMin) / Math.max(1, Math.floor((right - left) / 52))));
  const yStep = Math.max(1, Math.ceil((yMax - yMin) / 6));
  for (let tick = xMin; tick <= xMax; tick += xStep) {
    grid.append(svgElement('line', {x1: x(tick), x2: x(tick), y1: top, y2: bottom}));
    labels.append(svgElement('text', {x: x(tick), y: bottom + 18, 'text-anchor': 'middle'}, '1e' + tick));
  }
  for (let tick = yMin; tick <= yMax; tick += yStep) {
    grid.append(svgElement('line', {x1: left, x2: right, y1: y(tick), y2: y(tick)}));
    labels.append(svgElement('text', {x: left - 8, y: y(tick) + 3, 'text-anchor': 'end'}, cost(10 ** tick)));
  }
  labels.append(svgElement('text', {x: (left + right) / 2, y: height - 12, 'text-anchor': 'middle'}, 'Training compute (FLOP)'));
  labels.append(svgElement('text', {transform: `translate(12 ${(top + bottom) / 2}) rotate(-90)`, 'text-anchor': 'middle'}, 'Training cost (2023 USD)'));
  svg.append(grid, labels);

  const dots = points.map((model, index) => {
    const title = [model.name, compute(model.compute), cost(model.cost)].join(' · ');
    const dot = svgElement('circle', {cx: x(Math.log10(model.compute)), cy: y(Math.log10(model.cost)), r: 5, tabindex: index === 0 ? 0 : -1, role: 'button', 'aria-label': title});
    dot.append(svgElement('title', {}, title));
    dot.addEventListener('click', () => showDetails(model));
    dot.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        showDetails(model);
      }
      if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const delta = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
        const next = dots[(index + delta + dots.length) % dots.length];
        dot.setAttribute('tabindex', '-1');
        next.setAttribute('tabindex', '0');
        next.focus();
      }
    });
    return dot;
  });
  svg.append(...dots);
  plot.replaceChildren(svg);
}

filters.addEventListener('submit', event => event.preventDefault());
filters.addEventListener('input', refresh);
filters.addEventListener('reset', () => {
  sort.selectedIndex = 0;
  requestAnimationFrame(refresh);
});
sort.addEventListener('change', refresh);
byId('prev').addEventListener('click', () => { page -= 1; renderTable(); });
byId('next').addEventListener('click', () => { page += 1; renderTable(); });
new ResizeObserver(renderPlot).observe(plot);
refresh();
