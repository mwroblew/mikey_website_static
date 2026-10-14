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
  const rangeStart = document.getElementById('range-start');
  const rangeEnd = document.getElementById('range-end');
  const rangeStatus = document.getElementById('range-status');
  const rangeError = document.getElementById('range-error');
  const NS = 'http://www.w3.org/2000/svg';
  const all = Object.values(data.series).flat();
  const xmin = Math.min(...all.map(p => p[0]));
  const xmax = Math.max(...all.map(p => p[0]));
  const ymin = Math.floor(Math.min(...all.map(p => p[1])) / 2) * 2 - 1;
  const ymax = Math.ceil(Math.max(...all.map(p => p[1])) / 2) * 2 + 1;
  const qname = x => `${Math.floor(x)}Q${Math.round((x % 1) * 4) + 1}`;
  const source = value => value < data.sourceSwitch[windowSize] ? 'Livingston' : 'SPF';
  const originCount = value => source(value) === 'SPF' ? windowSize :
    Array.from({length:windowSize},(_,h)=>Math.round((value-h/4)*4)%4).filter(q=>q===1||q===3).length;
  const format = x => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}%`;
  const classify = x => x < -1.25 ? 'Tight' : x < -.75 ? 'Moderately tight' : x <= .75 ? 'Approximately neutral' : x <= 1.25 ? 'Moderately loose' : 'Loose';
  let windowSize = 10, series = data.series[10], selectedX = xmax, svg, guide, marker, x, y;
  let viewStart = series[0][0], viewEnd = xmax, fullHistory = true;
  const visible = () => series.filter(p => p[0] >= viewStart && p[0] <= viewEnd);
  const clampQuarter = value => Math.max(series[0][0], Math.min(xmax, Math.round(value*4)/4));
  function syncRange() {
    rangeStart.value = String(viewStart); rangeEnd.value = String(viewEnd);
    rangeStatus.textContent = `Showing ${qname(viewStart)}–${qname(viewEnd)}`;
  }
  function setRange(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      rangeError.textContent = 'Choose an end quarter after the start quarter.';
      return;
    }
    const a = clampQuarter(start), b = clampQuarter(end);
    if (a >= b) {
      rangeError.textContent = 'Choose at least two available quarters.';
      return;
    }
    viewStart = a; viewEnd = b;
    fullHistory = a === series[0][0] && b === xmax;
    rangeError.textContent = '';
    syncRange(); updatePicker(); draw();
  }
  function node(tag, attributes = {}, text = null, parent = svg) {
    const el = document.createElementNS(NS, tag);
    Object.entries(attributes).forEach(([key, value]) => el.setAttribute(key, value));
    if (text !== null) el.textContent = text;
    parent.appendChild(el);
    return el;
  }
  function inspect(value) {
    value = Math.max(viewStart, Math.min(viewEnd, value));
    const index = Math.max(0, Math.min(series.length - 1, Math.round((value - series[0][0]) * 4)));
    const point = series[index];
    selectedX = point[0]; picker.value = String(selectedX);
    selection.textContent = `${qname(point[0])} · ${format(point[1])} · ${classify(point[1])} · ${source(point[0])} (${originCount(point[0])} surveys)`;
    guide.setAttribute('x1', x(point[0])); guide.setAttribute('x2', x(point[0]));
    marker.setAttribute('cx', x(point[0])); marker.setAttribute('cy', y(point[1]));
  }
  function updatePicker() {
    picker.replaceChildren();
    visible().forEach(p => { const option = document.createElement('option'); option.value = String(p[0]); option.textContent = qname(p[0]); picker.appendChild(option); });
  }
  function draw() {
    const width = Math.max(250, host.getBoundingClientRect().width);
    const height = width < 520 ? 360 : 430;
    const m = {left: 64, right: 16, top: 35, bottom: 48};
    const innerWidth = width - m.left - m.right;
    const innerHeight = height - m.top - m.bottom;
    x = value => m.left + 3 + (value - viewStart) / (viewEnd - viewStart) * (innerWidth - 6);
    y = value => m.top + 3 + (ymax - value) / (ymax - ymin) * (innerHeight - 6);
    host.replaceChildren();
    svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('height', height);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-labelledby', 'ngdp-chart-title ngdp-chart-description');
    host.appendChild(svg);
    node('title', {id:'ngdp-chart-title'}, `NGDP gap with a ${windowSize}-quarter window`);
    node('desc', {id:'ngdp-chart-description'}, `Showing ${qname(viewStart)} through ${qname(viewEnd)}. Livingston supplies the early history; SPF begins in ${qname(data.sourceSwitch[windowSize])}. Drag across the plot to zoom, or use the start and end quarter controls. Select any visible observation in the quarter menu beneath the chart. Gray bands are NBER recessions. Colored horizontal bands are fixed classification thresholds.`);
    const defs = node('defs');
    const clip = node('clipPath', {id:'ngdp-plot-clip'}, null, defs);
    node('rect', {x:m.left,y:m.top,width:innerWidth,height:innerHeight}, null, clip);
    const plot = node('g', {'clip-path':'url(#ngdp-plot-clip)'});
    const limits = [ymin,-1.25,-.75,.75,1.25,ymax];
    const colors = ['var(--tight)','var(--modtight)','var(--neutral)','var(--modloose)','var(--loose)'];
    limits.slice(0,-1).forEach((v,i) => node('rect', {x:m.left,y:y(limits[i+1]),width:innerWidth,height:y(v)-y(limits[i+1]),fill:colors[i]},null,plot));
    data.recessions.forEach(([a,b]) => {
      a = Math.max(viewStart,a); b = Math.min(viewEnd,b);
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
    const maxTicks = Math.max(2, Math.floor(innerWidth / 85));
    const step = [.25,.5,1,2,5,10,20,50].find(v => (viewEnd-viewStart)/v <= maxTicks-1) || 50;
    const ticks=[viewStart];
    for(let t=Math.ceil(viewStart/step)*step;t<viewEnd;t+=step) if(t>viewStart) ticks.push(t);
    ticks.push(viewEnd);
    let rightEdge=-Infinity;
    const tickLabel = v => step < 1 || v%1 !== 0 ? qname(v) : String(v);
    const lastWidth = tickLabel(viewEnd).length*7.4;
    ticks.forEach((v,i)=>{
      const text=tickLabel(v),tw=text.length*7.4,tx=x(v),last=i===ticks.length-1,first=i===0;
      const left=last?tx-tw:first?tx:tx-tw/2, right=left+tw;
      if(left<rightEdge+5 || (!first && !last && right>x(viewEnd)-lastWidth-5))return;
      node('text',{x:tx,y:height-m.bottom+22,'text-anchor':last?'end':first?'start':'middle'},text);
      rightEdge=right;
    });
    node('text',{x:m.left,y:18},'NGDP gap (%)');
    node('text',{x:(width+m.left-m.right)/2,y:height-2,'text-anchor':'middle'},step<1?'Quarter':'Year');
    const points=visible().map(p=>`${x(p[0]).toFixed(3)},${y(p[1]).toFixed(3)}`).join(' ');
    node('polyline',{points,fill:'none',stroke:'#244e70','stroke-width':2.3,'stroke-linejoin':'round','stroke-linecap':'round','data-series-window':windowSize},null,plot);
    guide=node('line',{x1:0,x2:0,y1:m.top,y2:height-m.bottom,stroke:'#687c8e','stroke-width':.8,'stroke-dasharray':'3 4'},null,plot);
    marker=node('circle',{cx:0,cy:0,r:4,fill:'#244e70',stroke:'#fff','stroke-width':1.5},null,plot);
    const brush=node('rect',{x:0,y:m.top,width:0,height:innerHeight,fill:'var(--green)',opacity:.18,'pointer-events':'none','data-zoom-selection':''},null,plot);
    const overlay=node('rect',{x:m.left,y:m.top,width:innerWidth,height:innerHeight,fill:'transparent','data-hit':'',style:'touch-action:pan-y;cursor:crosshair;user-select:none'});
    const position=event=>{
      const rect=svg.getBoundingClientRect();
      const px=Math.max(x(viewStart),Math.min(x(viewEnd),(event.clientX-rect.left)/rect.width*width));
      return {px,value:viewStart+(px-m.left-3)/(innerWidth-6)*(viewEnd-viewStart)};
    };
    let drag=null;
    const cancel=()=>{drag=null;brush.setAttribute('width',0);};
    overlay.addEventListener('pointerdown',event=>{
      if(event.button!==0 || event.isPrimary===false)return;
      drag={...position(event),id:event.pointerId};
      overlay.setPointerCapture(event.pointerId);
    });
    overlay.addEventListener('pointermove',event=>{
      const pos=position(event);
      if(drag && drag.id===event.pointerId){
        brush.setAttribute('x',Math.min(drag.px,pos.px));
        brush.setAttribute('width',Math.abs(drag.px-pos.px));
      } else if(!drag && event.pointerType!=='touch')inspect(pos.value);
    });
    overlay.addEventListener('pointerup',event=>{
      if(!drag || drag.id!==event.pointerId)return;
      const start=drag,pos=position(event);
      cancel();
      if(overlay.hasPointerCapture(event.pointerId))overlay.releasePointerCapture(event.pointerId);
      const a=clampQuarter(Math.min(start.value,pos.value)),b=clampQuarter(Math.max(start.value,pos.value));
      if(Math.abs(start.px-pos.px)>=8 && a<b)setRange(a,b);
      else inspect(pos.value);
    });
    overlay.addEventListener('pointercancel',cancel);
    overlay.addEventListener('lostpointercapture',cancel);
    inspect(selectedX);
  }
  function update() {
    windowSize=Number(slider.value); series=data.series[windowSize];
    if (!series) return;
    if(fullHistory){viewStart=series[0][0];viewEnd=xmax;}
    else {
      viewStart=Math.max(viewStart,series[0][0]);
      viewEnd=Math.max(viewEnd,viewStart+.25);
    }
    [rangeStart,rangeEnd].forEach(select=>{
      select.replaceChildren();
      series.forEach(p=>{const option=document.createElement('option');option.value=String(p[0]);option.textContent=qname(p[0]);select.appendChild(option);});
    });
    rangeError.textContent=''; syncRange();
    label.textContent=`${windowSize} quarters`;
    slider.setAttribute('aria-valuetext',`${windowSize} quarters, ${windowSize/4} years`);
    const last=series.at(-1);
    document.getElementById('latest-quarter').textContent=`Latest · ${qname(last[0])}`;
    document.getElementById('latest-gap').textContent=format(last[1]);
    document.getElementById('latest-classification').textContent=`${classify(last[1])} · Luther classification`;
    coverage.textContent=`${qname(series[0][0])}–${qname(last[0])}`;
    document.getElementById('survey-transition').textContent=`Livingston through ${qname(data.sourceSwitch[windowSize]-.25)}; SPF from ${qname(data.sourceSwitch[windowSize])}. Shorter windows extend SPF coverage earlier; Livingston fills only the preceding history.`;
    updatePicker();draw();
  }
  slider.addEventListener('input',update);
  const applyRange = () => setRange(Number(rangeStart.value),Number(rangeEnd.value));
  document.getElementById('range-apply').addEventListener('click',applyRange);
  document.getElementById('range-reset').addEventListener('click',()=>setRange(series[0][0],xmax));
  picker.addEventListener('change',()=>inspect(Number(picker.value)));
  if (window.ResizeObserver) new ResizeObserver(draw).observe(host);
  else window.addEventListener('resize',draw);
  update();
})();
