import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const artifacts = process.env.DEV_RUNNER_ARTIFACTS!,
  placement = process.env.DEV_RUNNER_CHROME_CLASS!
if (!artifacts || !placement) throw Error('Use managed Chrome')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
const html =
  "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Logo sources</title><style>\n*{box-sizing:border-box}body{margin:0;font:15px system-ui;background:#14171b;color:#eee}main{display:grid;grid-template-columns:320px 1fr;height:100vh}aside{padding:20px;overflow:auto;border-right:1px solid #383d45}section{padding:32px;overflow:auto}input,select,button,a{font:inherit}input,select,button{padding:10px;border-radius:7px;border:1px solid #525966;background:#232830;color:#eee}input{width:100%}button,a{cursor:pointer}button:disabled{opacity:.5;cursor:wait}label{display:grid;gap:6px;margin:16px 0;font-size:13px}nav{display:flex;gap:12px;margin:20px 0}a{color:#aad3ff}#queue button{width:100%;text-align:left;margin:4px 0}#queue button[aria-current=true]{border-color:#8bbfff;background:#293c52}small{display:block;color:#a8b2c0;margin-top:5px}#preview{width:100%;height:300px;object-fit:contain;background:#fff;border-radius:8px}article{max-width:850px}#status{min-height:24px;color:#ffcf7c}#save{background:#b8d9fa;color:#11263b}h1{margin-top:0}#count{margin:12px 0} [hidden]{display:none!important}@media(max-width:650px){main{grid-template-columns:1fr;height:auto}aside{max-height:300px}section{padding:20px}}\n</style><main><aside><h1>Logo sources</h1><label>Filter<input id=\"filter\" placeholder=\"Brand or group\"></label><label>Gap<select id=\"gap\"><option value=\"\">All gaps</option><option>Missing logo</option><option>Full SVG missing</option></select></label><small id=\"count\"></small><div id=\"queue\"></div></aside><section><article><h2 id=\"name\">Select an identity</h2><div id=\"controls\" hidden><label>Search terms<input id=\"query\"></label><nav><a id=\"google\" target=\"_blank\" rel=\"noreferrer\">Google Images \u2197</a><a id=\"bing\" target=\"_blank\" rel=\"noreferrer\">Bing Images \u2197</a></nav><p>Open a result\u2019s original image, then paste its address. You can also paste an image copied from the search results.</p><div id=\"suggestions\" style=\"display:flex;gap:12px;flex-wrap:wrap\"></div><label>Original image URL<input id=\"url\" type=\"url\" placeholder=\"https://\u2026\"></label><label>Source page (optional)<input id=\"page\" type=\"url\" placeholder=\"https://\u2026\"></label><button id=\"load\">Preview source</button><p id=\"status\" role=\"status\"></p><div id=\"review\" hidden><img id=\"preview\" alt=\"Selected source preview\"><small id=\"quality\"></small><label>Artwork type<select id=\"role\"><option value=\"full-logo\">Full logo</option><option value=\"brand-mark\">Brand mark</option></select></label><button id=\"save\">Use as source</button><p>Sources are retained for artwork preparation. Selecting one does not replace the live logo.</p></div></div></article></section></main><script>\nconst $=s=>document.querySelector(s);let rows=[],selected=null,candidate=null,selections=[];const token='__TOKEN__';\nfunction links(){const q=encodeURIComponent($('#query').value);$('#google').href='https://www.google.com/search?udm=2&q='+q;$('#bing').href='https://www.bing.com/images/search?q='+q}\nfunction draw(){const visible=rows.filter(r=>r.name.toLowerCase().includes($('#filter').value.toLowerCase())&&(!$('#gap').value||r.gap===$('#gap').value));$('#count').textContent=visible.length+' identities \u00b7 '+selections.length+' selected sources';$('#queue').replaceChildren();for(const r of visible){let b=document.createElement('button');b.textContent=r.name;let s=document.createElement('small');s.textContent=r.kind+' \u00b7 '+r.gap+(selections.some(v=>v.id===r.id)?' \u00b7 Source selected':'');b.append(s);b.setAttribute('aria-current',r.id===selected?.id);b.onclick=()=>choose(r);$('#queue').append(b)}}\nfunction choose(r){selected=r;candidate=null;$('#name').textContent=r.name;$('#controls').hidden=false;$('#review').hidden=true;$('#status').textContent='';$('#url').value='';$('#page').value='';$('#query').value=r.name+' logo'+(r.kind==='brand'?' Hong Kong':'');links();draw();$('#suggestions').replaceChildren();for(const source of r.sources??[]){const b=document.createElement('button');const img=document.createElement('img');img.src=source.url;img.alt='Discovered source';img.style='width:120px;height:80px;object-fit:contain;background:white';img.referrerPolicy='no-referrer';b.append(img);b.title=source.url;b.onclick=()=>{$('#url').value=source.url;$('#page').value=source.page;$('#load').click()};$('#suggestions').append(b)}history.replaceState(null,'','#'+encodeURIComponent(r.id))}\nasync function request(path,data){const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Review-Token':token},body:JSON.stringify(data)});const b=await res.json();if(!res.ok)throw Error(b.error);return b}\n$('#query').oninput=links;$('#filter').oninput=draw;$('#gap').onchange=draw;$('#url').oninput=()=>{candidate=null;$('#review').hidden=true};\n$('#load').onclick=async()=>{const id=selected.id;candidate=null;$('#review').hidden=true;$('#load').disabled=true;$('#status').textContent='Fetching original source\u2026';try{const b=await request('/api/preview',{id,url:$('#url').value,page:$('#page').value});if(selected.id!==id)return;candidate=b;$('#preview').src=b.preview;$('#quality').textContent=b.format.toUpperCase()+' \u00b7 '+(b.width?b.width+' \u00d7 '+b.height+' \u00b7 ':'')+b.quality;$('#review').hidden=false;$('#status').textContent=''}catch(e){$('#status').textContent=e.message}finally{$('#load').disabled=false}};\n$('#save').onclick=async()=>{if(!candidate)return;$('#save').disabled=true;try{const b=await request('/api/select',{id:selected.id,sha256:candidate.sha256,role:$('#role').value});selections=selections.filter(x=>!(x.id===b.id&&x.composition===b.composition));selections.push(b);$('#status').textContent='Source saved. Original bytes and provenance retained.';draw()}catch(e){$('#status').textContent=e.message}finally{$('#save').disabled=false}};\ndocument.addEventListener('paste',e=>{const html=e.clipboardData?.getData('text/html');if(!html||!selected)return;const img=new DOMParser().parseFromString(html,'text/html').querySelector('img');if(img?.src.startsWith('https://')){$('#url').value=img.src;candidate=null;$('#review').hidden=true;e.preventDefault()}});\nfetch('/api/queue').then(r=>r.json()).then(b=>{rows=b.rows;selections=b.selections;draw();const r=rows.find(x=>x.id===decodeURIComponent(location.hash.slice(1)));if(r)choose(r)}).catch(e=>{$('#count').textContent=e.message});\n</script></html>\n"
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const selections: any[] = []
  await page.route('http://review.test/**', async route => {
    const path = new URL(route.request().url()).pathname
    let data: any
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: html })
    if (path === '/api/queue')
      data = {
        rows: [
          {
            id: 'test-brand',
            name: 'Test Brand',
            kind: 'brand',
            gap: 'Missing logo',
            sources: [
              { url: 'https://example.com/logo.png', page: 'https://example.com' },
            ],
          },
        ],
        selections,
      }
    else if (path === '/api/preview')
      data = {
        id: 'test-brand',
        sha256: 'a'.repeat(64),
        format: 'png',
        width: 600,
        height: 600,
        quality: '512+ px',
        preview:
          'data:image/svg+xml;base64,' +
          Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#168d9c"/></svg>',
          ).toString('base64'),
      }
    else {
      data = { ...route.request().postDataJSON(), composition: 'full-logo' }
      selections.push(data)
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.goto('http://review.test/')
  await page.getByRole('button', { name: /Test Brand/ }).click()
  await expect(page.getByRole('link', { name: 'Google Images ↗' })).toHaveAttribute(
    'href',
    /udm=2.*Test%20Brand/,
  )
  await expect(page.getByRole('link', { name: 'Bing Images ↗' })).toHaveAttribute(
    'href',
    /bing.com/,
  )
  await page.getByRole('button', { name: 'Discovered source' }).click()
  await expect(page.getByLabel('Original image URL')).toHaveValue(
    'https://example.com/logo.png',
  )
  await page.getByRole('button', { name: 'Preview source' }).click()
  await expect(page.locator('#quality')).toContainText('600 × 600')
  await page.getByRole('button', { name: 'Use as source' }).click()
  await expect(page.getByRole('status')).toContainText('Source saved')
  await page.reload()
  await expect(page.getByRole('button', { name: /Test Brand/ })).toContainText(
    'Source selected',
  )
  await page.screenshot({ path: artifacts + '/logo-source-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByLabel('Original image URL')).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true)
  await page.screenshot({ path: artifacts + '/logo-source-mobile.png' })
} finally {
  await browser.close()
}
