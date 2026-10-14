/* Behavioral checks for both date controls and pointer zoom. No browser dependencies. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
class Element {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.attrs = {}; this.events = {}; this.value = ''; this.textContent = ''; }
  setAttribute(k,v) { this.attrs[k] = v; }
  appendChild(el) { this.children.push(el); return el; }
  replaceChildren() { this.children = []; }
  addEventListener(k,fn) { this.events[k] = fn; }
  getBoundingClientRect() { return {width:700,left:0}; }
  setPointerCapture(id) { this.captured = id; }
  hasPointerCapture(id) { return this.captured === id; }
  releasePointerCapture() { this.captured = null; }
}
function run(html, script, dataScript, previewId) {
  const els = {};
  for (const m of html.matchAll(/id="([^"]+)"/g)) els[m[1]] = new Element();
  els['window-slider'].value = '10';
  if (previewId) els[previewId].querySelector = id => els[id.slice(1)];
  const document = {getElementById:id=>els[id],createElement:tag=>new Element(tag),createElementNS:(ns,tag)=>new Element(tag)};
  const context = vm.createContext({document,window:{addEventListener(){}},console});
  if (dataScript) vm.runInContext(dataScript, context);
  vm.runInContext(script, context);
  const fire = (id,name,event={}) => els[id].events[name]({preventDefault(){},...event});
  assert.match(html, /<button type="button"[^>]*id="range-apply"/);
  const apply = (start,end) => {els['range-start'].value=String(start);els['range-end'].value=String(end);fire('range-apply','click');};
  const bounds = () => [Number(els['range-start'].value),Number(els['range-end'].value)];
  const nodes = el => [el,...el.children.flatMap(nodes)];
  const hit = () => nodes(els['ngdp-chart']).find(el=>'data-hit' in el.attrs);
  const line = () => nodes(els['ngdp-chart']).filter(el=>el.tag==='polyline');
  apply(1985,2006.75);
  assert.deepEqual(bounds(),[1985,2006.75]);
  assert.equal(line().length,1);
  assert.equal(line()[0].attrs.points.split(' ').length,88);
  assert.equal(els['quarter-select'].children.length,88);
  for(let w=4;w<=20;w++) {
    els['window-slider'].value=String(w);fire('window-slider','input');
    assert.deepEqual(bounds(),[1985,2006.75]);
    assert.equal(line().length,1);
  }
  const status=els['range-status'].textContent;
  apply(2006,1985);
  assert.ok(els['range-error'].textContent.includes('after'));
  assert.equal(els['range-status'].textContent,status);
  apply(2000,2000.25);
  assert.equal(line()[0].attrs.points.split(' ').length,2);
  assert.equal(els['range-error'].textContent,'');
  const pointer=(clientX)=>({clientX,button:0,pointerId:1,pointerType:'mouse',isPrimary:true});
  for(const reverse of [false,true]) {
    apply(1985,2006.75);
    const overlay=hit(),a=reverse?500:200,b=reverse?200:500;
    overlay.events.pointerdown(pointer(a));overlay.events.pointermove(pointer(b));
    assert.ok(nodes(els['ngdp-chart']).find(el=>'data-zoom-selection' in el.attrs).attrs.width>0);
    overlay.events.pointerup(pointer(b));
    assert.deepEqual(bounds(),[1989.75,2000.25]);
    assert.ok(els['range-status'].textContent.includes('1989Q4–2000Q2'));
  }
  apply(1985,2006.75);
  const cancelled=hit();cancelled.events.pointerdown(pointer(200));cancelled.events.pointermove(pointer(500));cancelled.events.pointercancel({});
  assert.deepEqual(bounds(),[1985,2006.75]);
  assert.equal(nodes(els['ngdp-chart']).find(el=>'data-zoom-selection' in el.attrs).attrs.width,0);
  const click=hit();click.events.pointerdown(pointer(350));click.events.pointerup(pointer(350));
  assert.deepEqual(bounds(),[1985,2006.75]);
  assert.ok(els['selected-value'].textContent.includes('SPF'));
  fire('range-reset','click');
  assert.equal(bounds()[1],2026.25);
  els['window-slider'].value='4';fire('window-slider','input');
  assert.equal(bounds()[0],1952.25);
  assert.ok(els['survey-transition'].textContent.includes('SPF from 1969Q3'));
  apply(1952.25,1953);
  els['window-slider'].value='20';fire('window-slider','input');
  assert.ok(bounds()[0]>=1956 && bounds()[1]>bounds()[0]);
  assert.ok(line()[0].attrs.points.split(' ').length>=2);
}
run(fs.readFileSync(path.join(root,'ngdp.html'),'utf8'),fs.readFileSync(path.join(root,'assets/js/ngdp.js'),'utf8'),fs.readFileSync(path.join(root,'assets/data/ngdp.js'),'utf8'));
if(process.argv[2]) {
  const html=fs.readFileSync(process.argv[2],'utf8');
  const id=html.match(/<div id="([^"]+)"/)[1];
  run(html,html.split('<script>')[1].split('</script>')[0],null,id);
}
console.log('Passed: date ranges, all window sizes, both drag directions, cancellation, click inspection, reset, and early-coverage clamping.');
