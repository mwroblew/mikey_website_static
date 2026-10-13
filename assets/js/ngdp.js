/* Static, dependency-free explorer. Data values are percentages, not fractions. */
(() => {
  'use strict';
  const host = document.getElementById('ngdp-chart');
  const data = window.NGDP_DATA;
  if (!host) return;
  if (!data || !data.series) {
    host.innerHTML = '<p class="chart-error">The chart data could not load. Please reload the page or download the CSV below.</p>';
    return;
  }
  const slider = document.getElementById('window-slider');
  const picker = document.getElementById('quarter-select');
  const label = document.getElementById('window-value');
  const selection = document.getElementById('selected-value');
  const coverage = document.getElementById('coverage');
  const NS = 'http://www.w3.org/2000/svg';
  const all = Object.values(data.series).flat();
  const xmin = Math.min(...all.map(p => p[0]));
  const xmax = Math.max(...all.map(p => p[0]));
  const ymin = Math.floor(Math.min(...all.map(p => p[1])) / 2) * 2 - 1;
  const ymax = Math.ceil(Math.max(...all.map(p => p[1])) / 2) * 2 + 1;
  const qname = x => `${Math.floor(x)}Q${Math.round((x % 1) * 4) + 1}`;
  const format = x => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}%`;
  const classify = x => x < -1.25 ? 'Tight' : x < -.75 ? 'Moderately tight' : x <= .75 ? 'Approximately neutral' : x <= 1.25 ? 'Moderately loose' : 'Loose';
  let windowSize = 10, series = data.series[10], selectedX = xmax, svg, guide, marker, x, y;
  function node(tag, attributes = {}, text = null, parent = svg) {
    const el = document.createElementNS(NS, tag);
    Object.entries(attributes).forEach(([key, value]) => el.setAttribute(key, value));
    if (text !== null) el.textContent = text;
    parent.appendChild(el);
    return el;
  }
  function inspect(value) {
    const index = Math.max(0, Math.min(series.length - 1, Math.round((value - series[0][0]) * 4)));
    const point = series[index];
    selectedX = point[0]; picker.value = String(selectedX);
    selection.textContent = `${qname(point[0])} · ${format(point[1])} · ${classify(point[1])}`;
    guide.setAttribute('x1', x(point[0])); guide.setAttribute('x2', x(point[0]));
    marker.setAttribute('cx', x(point[0])); marker.setAttribute('cy', y(point[1]));
  }
  function updatePicker() {
    picker.replaceChildren();
    series.forEach(p => { const option = document.createElement('option'); option.value = String(p[0]); option.textContent = qname(p[0]); picker.appendChild(option); });
  }
  function draw() {
    const width = Math.max(250, host.getBoundingClientRect().width);
    const height = width < 520 ? 360 : 430;
    const m = {left: 56, right: 12, top: 35, bottom: 48};
    const innerWidth = width - m.left - m.right;
    const innerHeight = height - m.top - m.bottom;
    x = value => m.left + 3 + (value - xmin) / (xmax - xmin) * (innerWidth - 6);
    y = value => m.top + 3 + (ymax - value) / (ymax - ymin) * (innerHeight - 6);
    host.replaceChildren();
    svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('height', height);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-labelledby', 'ngdp-chart-title ngdp-chart-description');
    host.appendChild(svg);
    node('title', {id:'ngdp-chart-title'}, `NGDP gap with a ${windowSize}-quarter window`);
    node('desc', {id:'ngdp-chart-description'}, `Quarterly observations from ${qname(series[0][0])} through ${qname(xmax)}. Select any observation in the quarter menu beneath the chart. Gray bands are NBER recessions. Colored horizontal bands are fixed classification thresholds.`);
    const defs = node('defs');
    const clip = node('clipPath', {id:'ngdp-plot-clip'}, null, defs);
    node('rect', {x:m.left,y:m.top,width:innerWidth,height:innerHeight}, null, clip);
    const plot = node('g', {'clip-path':'url(#ngdp-plot-clip)'});
    const limits = [ymin,-1.25,-.75,.75,1.25,ymax];
    const colors = ['var(--tight)','var(--modtight)','var(--neutral)','var(--modloose)','var(--loose)'];
    limits.slice(0,-1).forEach((v,i) => node('rect', {x:m.left,y:y(limits[i+1]),width:innerWidth,height:y(v)-y(limits[i+1]),fill:colors[i]},null,plot));
    data.recessions.forEach(([a,b]) => {
      a = Math.max(xmin,a); b = Math.min(xmax,b);
      if (b>a) node('rect',{x:x(a),y:m.top,width:x(b)-x(a),height:innerHeight,fill:'#596660',opacity:.19},null,plot);
    });
    const tickStep = (ymax-ymin) > 24 ? 4 : 2;
    for(let v=Math.ceil(ymin/tickStep)*tickStep;v<=ymax;v+=tickStep){
      node('line',{x1:m.left,x2:width-m.right,y1:y(v),y2:y(v),stroke:'#fff','stroke-width':1},null,plot);
      node('text',{x:m.left-9,y:y(v)+4,'text-anchor':'end'},`${v}%`);
    }
    [-1.25,-.75,.75,1.25].forEach(v=>node('line',{x1:m.left,x2:width-m.right,y1:y(v),y2:y(v),stroke:'#8c979c','stroke-width':.7,'stroke-dasharray':'3 4'},null,plot));
    node('line',{x1:m.left,x2:width-m.right,y1:y(0),y2:y(0),stroke:'#111','stroke-width':2.2},null,plot);
    node('rect',{x:m.left,y:m.top,width:innerWidth,height:innerHeight,fill:'none',stroke:'#d9dfd7'});
    const step=width<520?20:10;
    const ticks=[];
    for(let year=Math.ceil(xmin/step)*step;year<xmax-2;year+=step) ticks.push(year);
    ticks.push(Math.floor(xmax));
    let rightEdge=-Infinity;
    ticks.forEach(v=>{
      const tx=x(v),last=v===ticks.at(-1),left=last?tx-30:tx-15;
      if(left<rightEdge+5)return;
      node('text',{x:tx,y:height-m.bottom+22,'text-anchor':last?'end':'middle'},String(v));
      rightEdge=last?tx:tx+15;
    });
    node('text',{x:m.left,y:18},'NGDP gap (%)');
    node('text',{x:(width+m.left-m.right)/2,y:height-2,'text-anchor':'middle'},'Year');
    const points=series.map(p=>`${x(p[0]).toFixed(3)},${y(p[1]).toFixed(3)}`).join(' ');
    node('polyline',{points,fill:'none',stroke:'#244e70','stroke-width':2.3,'stroke-linejoin':'round','stroke-linecap':'round','data-series-window':windowSize},null,plot);
    guide=node('line',{x1:0,x2:0,y1:m.top,y2:height-m.bottom,stroke:'#687c8e','stroke-width':.8,'stroke-dasharray':'3 4'},null,plot);
    marker=node('circle',{cx:0,cy:0,r:4,fill:'#244e70',stroke:'#fff','stroke-width':1.5},null,plot);
    const overlay=node('rect',{x:m.left,y:m.top,width:innerWidth,height:innerHeight,fill:'transparent','data-hit':''});
    const pick=event=>{const rect=svg.getBoundingClientRect();const px=(event.clientX-rect.left)/rect.width*width;const value=xmin+(px-m.left-3)/(innerWidth-6)*(xmax-xmin);inspect(value);};
    overlay.addEventListener('pointermove',event=>{if(event.pointerType!=='touch')pick(event);});
    overlay.addEventListener('click',pick);
    inspect(selectedX);
  }
  function update() {
    windowSize=Number(slider.value); series=data.series[windowSize];
    if (!series) return;
    label.textContent=`${windowSize} quarters`;
    slider.setAttribute('aria-valuetext',`${windowSize} quarters, ${windowSize/4} years`);
    const last=series.at(-1);
    document.getElementById('latest-quarter').textContent=`Latest · ${qname(last[0])}`;
    document.getElementById('latest-gap').textContent=format(last[1]);
    document.getElementById('latest-classification').textContent=`${classify(last[1])} · Luther classification`;
    coverage.textContent=`${qname(series[0][0])}–${qname(last[0])}`;
    updatePicker();draw();
  }
  slider.addEventListener('input',update);
  picker.addEventListener('change',()=>inspect(Number(picker.value)));
  if (window.ResizeObserver) new ResizeObserver(draw).observe(host);
  else window.addEventListener('resize',draw);
  update();
})();
