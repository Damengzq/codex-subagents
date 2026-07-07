import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const MARKED_PATH = 'file:///C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/marked/lib/marked.esm.js';
const { marked } = await import(MARKED_PATH);
marked.setOptions({ gfm: true, breaks: false });

const WIKI_ROOT = path.join(import.meta.dirname, 'wiki-content');
const PORT = 3000;

// ========== UTILITIES ==========
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

async function isDir(p) { try { const s = await fs.stat(p); return s.isDirectory(); } catch { return false; } }

async function listDir(dp) {
  try {
    const entries = await fs.readdir(dp, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    const files = entries.filter(e => e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('_')).map(e => e.name.replace(/\.md$/, '')).sort();
    return { dirs, files };
  } catch { return { dirs: [], files: [] }; }
}

async function readMd(fp) { try { return await fs.readFile(fp, 'utf-8'); } catch { return null; } }

async function getTitle(fp) {
  const md = await readMd(fp);
  if (!md) return path.basename(fp, '.md');
  const m = md.match(/^#\s+(.+)/m);
  return m ? m[1] : path.basename(fp, '.md');
}

async function getAllPages(dir, pages = []) {
  if (!dir) dir = WIKI_ROOT;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await getAllPages(full, pages);
      else if (e.name.endsWith('.md')) {
        const rel = path.relative(WIKI_ROOT, full).replace(/\\/g, '/');
        pages.push({ path: rel, title: await getTitle(full) });
      }
    }
  } catch {}
  return pages;
}

function wikiToFs(rel) { return path.join(WIKI_ROOT, rel.replace(/^\/+/, '').replace(/\\/g, '/')); }

function fsToWiki(fp) { return path.relative(WIKI_ROOT, fp).replace(/\\/g, '/'); }

async function rmDir(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const e of entries) { const full = path.join(dirPath, e.name); if (e.isDirectory()) await rmDir(full); else await fs.unlink(full); }
    await fs.rmdir(dirPath); return true;
  } catch { return false; }
}

function fixMermaid(html) {
  return html.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, (_, code) => {
    return '<div class="mermaid">' + code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') + '</div>';
  });
}

// ========== SIDEBAR TREE ==========
async function buildTree(dir, basePath = '') {
  const result = { name: path.basename(dir), path: basePath || '', children: [], type: 'dir' };
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    for (const e of dirs) {
      const childPath = basePath ? basePath + '/' + e.name : e.name;
      result.children.push(await buildTree(path.join(dir, e.name), childPath));
    }
    const files = entries.filter(e => e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('_'));
    for (const e of files) {
      const name = e.name.replace(/\.md$/, '');
      const childPath = basePath ? basePath + '/' + name : name;
      const fp = path.join(dir, e.name);
      const title = await getTitle(fp);
      result.children.push({ name, path: childPath, title, type: 'page' });
    }
  } catch {}
  return result;
}

function renderSidebarHtml(tree, currentPath, depth = 0) {
  let html = '';
  for (const node of tree.children) {
    if (node.type === 'dir') {
      const isOpen = currentPath.startsWith('/' + node.path + '/') || currentPath === '/' + node.path;
      const hasChildren = node.children && node.children.length > 0;
      const toggleClass = isOpen ? 'open' : '';
      html += `<li class="tree-folder ${toggleClass}">`;
      html += `<div class="tree-item" style="padding-left:${8 + depth * 12}px">`;
      html += `<span class="tree-arrow" >▼</span>`;
      html += `<a href="/${node.path}">${esc(node.name)}</a></div>`;
      if (hasChildren) {
        html += `<ul>${renderSidebarHtml(node, currentPath, depth + 1)}</ul>`;
      }
      html += '</li>';
    } else {
      const isActive = currentPath === '/' + node.path;
      html += `<li class="tree-page ${isActive ? 'active' : ''}">`;
      html += `<a href="/${node.path}" style="padding-left:${8 + depth * 12 + 16}px">${esc(node.title || node.name)}</a></li>`;
    }
  }
  return html;
}

// ========== CSS ==========
const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f7fa;color:#1a1a2e;min-height:100vh;display:flex;flex-direction:column}
a{color:#1976d2;text-decoration:none}
a:hover{text-decoration:underline}

/* Layout */
.app-layout{display:flex;flex:1;min-height:0}
.sidebar{width:260px;min-width:260px;background:#1a1a2e;color:#c8d6e5;overflow-y:auto;padding:0;font-size:14px;border-right:1px solid #2d2d44;transition:margin-left .25s}
.sidebar-header{padding:16px;border-bottom:1px solid #2d2d44;display:flex;align-items:center;justify-content:space-between}
.sidebar-header a{font-weight:600;color:#fff;font-size:15px;display:flex;align-items:center;gap:8px}
.sidebar-header button{background:none;border:none;color:#c8d6e5;cursor:pointer;font-size:18px;display:none}
.main-content{flex:1;overflow-y:auto;min-width:0}

/* Sidebar tree */
.sidebar ul{list-style:none}
.sidebar .tree-folder>ul{display:none}
.sidebar .tree-folder.open>ul{display:block}
.tree-item{cursor:pointer;display:flex;align-items:center;padding:6px 16px;gap:4px;transition:background .15s}
.tree-item:hover{background:rgba(255,255,255,0.06)}
.tree-item a{color:#c8d6e5;flex:1;font-size:13px}
.tree-item a:hover{color:#fff;text-decoration:none}
.tree-arrow{font-size:10px;width:14px;text-align:center;color:#8395a7;cursor:pointer;flex-shrink:0}
.tree-arrow:hover{color:#fff}
.tree-folder.open>.tree-item>.tree-arrow{transform:rotate(0deg)}
.tree-folder:not(.open)>.tree-item>.tree-arrow{transform:rotate(-90deg)}
.tree-page a{display:block;padding:5px 16px;color:#8395a7;font-size:13px;transition:all .15s}
.tree-page a:hover{color:#fff;background:rgba(255,255,255,0.06);text-decoration:none}
.tree-page.active a{color:#64b5f6;background:rgba(25,118,210,0.15);border-left:3px solid #1976d2;font-weight:500}

/* Header */
header{background:#1a1a2e;color:#fff;padding:10px 0;box-shadow:0 2px 8px rgba(0,0,0,0.15);position:sticky;top:0;z-index:100}
header .container{display:flex;align-items:center;justify-content:space-between;max-width:100%;padding:0 20px}
header h1{font-size:20px;font-weight:600}
header h1 a{color:#fff}
header nav{display:flex;align-items:center;gap:16px}
header nav a,.header-btn{color:#c8d6e5;font-size:14px;background:none;border:none;cursor:pointer}
header nav a:hover,.header-btn:hover{color:#fff;text-decoration:none}

/* Container */
.content-container{max-width:1100px;margin:0 auto;padding:20px}

/* Breadcrumb */
.breadcrumb{font-size:13px;color:#8395a7;margin-bottom:20px}
.breadcrumb a{color:#8395a7}

/* Cards */
.card{background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:24px;margin-bottom:16px}
.card h2{font-size:18px;margin-bottom:8px}
.card p{color:#576574;font-size:14px;line-height:1.6}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.tag{display:inline-block;background:#e8f0fe;color:#1976d2;padding:2px 10px;border-radius:12px;font-size:12px;margin-right:6px}
.item-list{list-style:none}
.item-list li{padding:10px 0;border-bottom:1px solid #f1f2f6}
.item-list li:last-child{border-bottom:none}
.item-list a{font-size:15px;display:flex;align-items:center;gap:8px}
.item-list .meta{font-size:12px;color:#8395a7;margin-left:6px}

/* Markdown */
.markdown-body{line-height:1.8;font-size:15px}
.markdown-body h1{font-size:26px;border-bottom:2px solid #e8e8e8;padding-bottom:8px;margin:24px 0 16px}
.markdown-body h2{font-size:20px;margin:20px 0 12px;padding-bottom:6px;border-bottom:1px solid #f0f0f0}
.markdown-body h3{font-size:17px;margin:16px 0 8px}
.markdown-body h4{font-size:15px;margin:12px 0 6px}
.markdown-body p{margin:10px 0}
.markdown-body ul,.markdown-body ol{padding-left:24px;margin:8px 0}
.markdown-body li{margin:4px 0}
.markdown-body pre{background:#1e1e2e;color:#cdd6f4;border-radius:8px;padding:16px;overflow-x:auto;margin:12px 0;font-size:13px;line-height:1.5}
.markdown-body code{background:#f0f0f3;padding:2px 6px;border-radius:4px;font-size:13px;font-family:'JetBrains Mono','Fira Code','Consolas',monospace}
.markdown-body pre code{background:none;padding:0;color:inherit;white-space:pre}
.markdown-body table{border-collapse:collapse;width:100%;margin:12px 0}
.markdown-body th,.markdown-body td{border:1px solid #ddd;padding:8px 12px;text-align:left}
.markdown-body th{background:#f5f7fa;font-weight:600}
.markdown-body blockquote{border-left:4px solid #1976d2;padding:8px 16px;margin:12px 0;background:#f8f9ff;color:#555}
.markdown-body hr{border:none;border-top:1px solid #eee;margin:16px 0}
.mermaid{background:#fff;border-radius:8px;padding:16px;margin:12px 0;text-align:center;overflow-x:auto}

/* Buttons */
.btn{display:inline-block;padding:8px 20px;border-radius:6px;font-size:14px;cursor:pointer;border:none;transition:all .2s;text-decoration:none}
.btn-primary{background:#1976d2;color:#fff}
.btn-primary:hover{background:#1565c0;text-decoration:none}
.btn-danger{background:#e74c3c;color:#fff}
.btn-danger:hover{background:#c0392b;text-decoration:none}
.btn-ghost{background:transparent;color:#1976d2;border:1px solid #1976d2}
.btn-ghost:hover{background:#e8f0fe;text-decoration:none}
.btn-sm{padding:4px 12px;font-size:12px}
.actions{margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.card-header{display:flex;justify-content:space-between;align-items:flex-start}

/* Search */
.search-bar{margin-bottom:20px}
.search-bar input{width:100%;padding:10px 16px;border:1px solid #ddd;border-radius:8px;font-size:15px;outline:none}
.search-bar input:focus{border-color:#1976d2;box-shadow:0 0 0 3px rgba(25,118,210,0.1)}

/* Edit */
.edit-area{width:100%;min-height:400px;font-family:'JetBrains Mono','Fira Code','Consolas',monospace;font-size:14px;padding:16px;border:1px solid #ddd;border-radius:8px;resize:vertical}
.preview-box{background:#fff;padding:20px;border:1px solid #eee;border-radius:8px;margin-top:16px}
.empty-state{text-align:center;padding:60px 20px;color:#8395a7}
.empty-state .icon{font-size:48px;margin-bottom:12px}
.form-group{margin-bottom:16px}
.form-group label{display:block;margin-bottom:4px;font-weight:600}
.form-group input,.form-group select{width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:15px}

/* Footer */
footer{text-align:center;padding:16px;color:#8395a7;font-size:12px;border-top:1px solid #eee;margin-top:20px}

.hidden{display:none}

/* Mobile */
@media(max-width:768px){
  .sidebar{position:fixed;top:0;left:0;height:100vh;z-index:200;margin-left:-260px;transition:margin-left .25s}
  .sidebar.open{margin-left:0;box-shadow:4px 0 20px rgba(0,0,0,0.3)}
  .sidebar-header button{display:block}
  .sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:199}
  .sidebar-overlay.show{display:block}
  .content-container{padding:12px}
  .grid{grid-template-columns:1fr}
}

/* Sidebar toggle (mobile menu button in header) */
.sidebar-toggle{display:none;background:none;border:none;color:#c8d6e5;font-size:20px;cursor:pointer;padding:4px}
.sidebar-toggle:hover{color:#fff}
@media(max-width:768px){.sidebar-toggle{display:block}}

/* Dialogs */
.dialog-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:300;display:flex;align-items:center;justify-content:center}
.dialog-box{background:#fff;border-radius:12px;padding:24px;min-width:360px;max-width:500px;box-shadow:0 8px 32px rgba(0,0,0,0.2)}
.dialog-box h3{margin:0 0 16px;font-size:18px}
.dialog-box input{width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:15px;margin-bottom:16px;outline:none}
.dialog-box input:focus{border-color:#1976d2;box-shadow:0 0 0 3px rgba(25,118,210,0.1)}

/* Item actions */
.item-actions{margin-left:auto;display:flex;gap:4px;flex-shrink:0}
.rename-btn{background:none;border:none;cursor:pointer;font-size:14px;padding:2px 6px;border-radius:4px;transition:background .15s}
.rename-btn:hover{background:#f0f0f3}
`;

// ========== HTML TEMPLATES ==========
function page(title, crumbsHtml, content, sidebarHtml, basePath = '/', extraHead = '') {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<base href="${basePath}">
<title>${esc(title)} | Hardware Wiki</title>
<style>${CSS}</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
${extraHead}
</head>
<body>
<header>
  <div class="container">
    <div style="display:flex;align-items:center;gap:12px">
      <button class="sidebar-toggle" onclick="toggleSidebar()" title="Menu">☰</button>
      <h1><a href="/">Hardware Wiki</a></h1>
    </div>
    <nav>
      <a href="javascript:void(0)" onclick="toggleSearch()">Search</a>
      <a href="/new" class="btn btn-primary btn-sm">+ New Module</a>
    </nav>
  </div>
</header>
<div class="app-layout">
  <div class="sidebar-overlay" onclick="toggleSidebar()"></div>
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <a href="/" onclick="toggleSidebar()">Home</a>
      <button onclick="toggleSidebar()" title="Close">✕</button>
    </div>
    <ul>${sidebarHtml}</ul>
  </aside>
  <div class="main-content">
    <div class="search-bar hidden"><input type="text" id="searchInput" placeholder="Search docs... (press Enter)" onkeydown="if(event.key==='Enter')search()"></div>
    <div class="content-container">
      ${crumbsHtml}
      ${content}
    </div>
  </div>
</div>
<footer>Hardware Documentation Wiki &middot; Powered by Node.js</footer>
<script>
function toggleSearch(){var s=document.querySelector('.search-bar');s.classList.toggle('hidden');if(!s.classList.contains('hidden'))document.getElementById('searchInput').focus();}
function search(){window.location='/search?q='+encodeURIComponent(document.getElementById('searchInput').value);}
function toggleSidebar(){document.getElementById('sidebar').classList.toggle('open');document.querySelector('.sidebar-overlay').classList.toggle('show');}
function toggleFolder(li){li.classList.toggle('open');}
document.getElementById('sidebar').addEventListener('click',function(e){
  var arrow=e.target.closest('.tree-arrow');
  if(arrow){
    e.preventDefault();
    e.stopPropagation();
    var li=arrow.closest('.tree-folder');
    if(li)li.classList.toggle('open');
  }
});
function showRename(oldPath,oldName,isDir){
  var o=document.createElement("div");o.className="dialog-overlay";o.id="renameOverlay";
  var box=document.createElement("div");box.className="dialog-box";
  var h3=document.createElement("h3");h3.textContent="Rename "+(isDir?"Folder":"Document");
  var inp=document.createElement("input");inp.type="text";inp.id="renameInput";inp.value=oldName;
  var actions=document.createElement("div");actions.className="actions";
  var okBtn=document.createElement("button");okBtn.className="btn btn-primary";okBtn.textContent="Rename";
  okBtn.onclick=function(){doRename(oldPath,isDir)};
  var cancelBtn=document.createElement("button");cancelBtn.className="btn btn-ghost";cancelBtn.textContent="Cancel";
  cancelBtn.onclick=function(){closeDialog("renameOverlay")};
  actions.appendChild(okBtn);actions.appendChild(cancelBtn);
  box.appendChild(h3);box.appendChild(inp);box.appendChild(actions);
  o.appendChild(box);
  document.body.appendChild(o);setTimeout(function(){var i=document.getElementById("renameInput");i.focus();i.select();},100);
}
function closeDialog(id){var o=document.getElementById(id);if(o)o.remove();}
async function doRename(oldPath,isDir){
  var n=document.getElementById("renameInput").value.trim();if(!n){closeDialog("renameOverlay");return;}
  var r=await fetch("/api/rename",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({oldPath:oldPath,newName:n,isDir:isDir})});
  if(r.ok){var d=await r.json();window.location.href=d.redirect||"/";}
  else{var e=await r.json();alert("Rename failed: "+e.error);closeDialog("renameOverlay");}
}
function showNewFolder(parentPath){
  var o=document.createElement("div");o.className="dialog-overlay";o.id="newFolderOverlay";
  var box=document.createElement("div");box.className="dialog-box";
  var h3=document.createElement("h3");h3.textContent="New Folder";
  var inp=document.createElement("input");inp.type="text";inp.id="newFolderInput";inp.placeholder="Folder name";
  var actions=document.createElement("div");actions.className="actions";
  var okBtn=document.createElement("button");okBtn.className="btn btn-primary";okBtn.textContent="Create";
  okBtn.onclick=function(){doNewFolder(parentPath)};
  var cancelBtn=document.createElement("button");cancelBtn.className="btn btn-ghost";cancelBtn.textContent="Cancel";
  cancelBtn.onclick=function(){closeDialog("newFolderOverlay")};
  actions.appendChild(okBtn);actions.appendChild(cancelBtn);
  box.appendChild(h3);box.appendChild(inp);box.appendChild(actions);
  o.appendChild(box);
  document.body.appendChild(o);setTimeout(function(){document.getElementById("newFolderInput").focus();},100);
}
async function doNewFolder(parentPath){
  var n=document.getElementById("newFolderInput").value.trim();if(!n){closeDialog("newFolderOverlay");return;}
  var fullPath=parentPath?parentPath+"/"+n:n;
  var r=await fetch("/api/page/"+encodeURIComponent(fullPath+"/_index"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:"# "+n+"\\n\\n"})});
  if(r.ok){window.location.reload();}else{var e=await r.json();alert("Create failed: "+e.error);closeDialog("newFolderOverlay");}
}
document.addEventListener('keydown',function(e){if(e.key==='/'&&document.activeElement!==document.getElementById('searchInput')){e.preventDefault();toggleSearch();}if(e.key==='Escape'){document.querySelector('.search-bar').classList.add('hidden');}});
(function(){if(typeof mermaid!=='undefined'){mermaid.initialize({startOnLoad:true,theme:'default',securityLevel:'loose'});}})();
async function delFolder(p){const r=await fetch('/api/folder/'+encodeURIComponent(p),{method:'DELETE'});if(r.ok){window.location.reload();}else{const e=await r.json();alert('Delete failed: '+e.error);}}
// Open sidebar folders to current page
(function(){var s=document.getElementById('sidebar');var active=s.querySelector('.tree-page.active');if(active){var p=active;while(p){if(p.classList.contains('tree-folder'))p.classList.add('open');p=p.parentElement;}}})();
</script>
</body>
</html>`;
}

function crumbs(segments) {
  let h = '<div class="breadcrumb"><a href="/">Home</a>';
  let accum = '';
  for (const s of segments) { accum += '/' + s; h += ` / <a href="${accum}">${esc(s)}</a>`; }
  return h + '</div>';
}

// Sidebar data
async function getSidebarHtml(currentPath) {
  const tree = await buildTree(WIKI_ROOT, '');
  return renderSidebarHtml(tree, currentPath);
}

// ========== PAGE RENDERERS ==========
async function homePage() {
  let modules = [];
  try {
    const ents = await fs.readdir(WIKI_ROOT, { withFileTypes: true });
    modules = ents.filter(e => e.isDirectory()).map(e => e.name).sort();
  } catch {}

  let cards = '';
  for (const mod of modules) {
    const ip = path.join(WIKI_ROOT, mod, '_index.md');
    const md = await readMd(ip);
    const desc = md ? md.split('\n').find(l => l.trim() && !l.startsWith('#')) || '' : '';
    const { dirs, files } = await listDir(path.join(WIKI_ROOT, mod));
    cards += `<div class="card">
      <div class="card-header">
        <h2><a href="/${mod}">${esc(mod)}</a></h2>
        <button onclick="delMod('${esc(mod)}')" class="btn btn-danger btn-sm" title="Delete module">Delete</button>
      </div>
      <p>${esc(desc || 'No description')}</p>
      <div style="margin-top:8px">
        <span class="tag">${dirs.length} subdirs</span>
        <span class="tag">${files.length} docs</span>
      </div>
    </div>`;
  }

  const body = modules.length > 0
    ? `<h2 style="margin-bottom:16px">Module List</h2><div class="grid">${cards}</div>`
    : `<div class="empty-state"><div class="icon">📦</div><h3>No modules yet</h3><p>Click "+ New Module" to create your first hardware module</p></div>`;

  const content = `${body}
<script>
async function delMod(name){
  if(!confirm('Delete ENTIRE module "'+name+'" and ALL documents?\\nThis cannot be undone!')) return;
  if(!confirm('Final confirmation: delete "'+name+'"?')) return;
  const r=await fetch('/api/module/'+encodeURIComponent(name),{method:'DELETE'});
  if(r.ok) location.reload();
  else{const e=await r.json();alert('Failed: '+e.error);}
}
</script>`;
  const sidebar = await getSidebarHtml('/');
  return page('Home', '', content, sidebar, '/', '');
}

﻿async function viewPage(relPath) {
  relPath = relPath.replace(/\/$/, "");
  const fp = wikiToFs(relPath);
  const segs = relPath.replace(/^\/+/, "").split("/").filter(Boolean);
  const wpath = relPath.replace(/^\/+/, "");

  // Directory?
  if (await isDir(fp)) {
    const { dirs, files } = await listDir(fp);
    const ip = path.join(fp, "_index.md");
    const imd = await readMd(ip);
    let dh = imd ? `<div class="card markdown-body">${fixMermaid(marked.parse(imd))}</div>` : "";
    let items = "";
    for (const d of dirs) {
      items += `<li><a href="${d}/">📁 ${esc(d)}</a><span class="item-actions"><button class="rename-btn" onclick="event.preventDefault();showRename('${wpath}/${d}','${d}',true)">✏️</button> <button class="rename-btn" onclick="event.preventDefault();if(confirm('Delete folder '+this.dataset.fname+' and ALL contents?')){delFolder(this.dataset.fpath)}" data-fpath="${wpath}/${d}" data-fname="${d}" style="color:#e74c3c">🗑</button></span></li>`;
    }
    for (const f of files) {
      const t = await getTitle(path.join(fp, f + ".md"));
      items += `<li><a href="${f}">📄 ${esc(t)} <span class="meta">(${esc(f)})</span></a><span class="item-actions"><button class="rename-btn" onclick="event.preventDefault();showRename('${wpath}/${f}','${f}',false)">✏️</button></span></li>`;
    }
    let content = dh;
    if (items) content += `<div class="card"><h3 style="margin-bottom:12px">Contents</h3><ul class="item-list">${items}</ul></div>`;
    content += `<div class="actions">
      <a href="_index?edit=1" class="btn btn-ghost">✏️ Edit Description</a>
      <button class="btn btn-ghost" onclick="showNewFolder('${wpath}')">📁 New Folder</button>
      <a href="/new-page?module=${wpath}" class="btn btn-primary">📄 New Page</a>
    </div>`;
    const sidebar = await getSidebarHtml("/" + wpath);
    return page(segs[segs.length - 1] || "Home", crumbs(segs), content, sidebar, "/" + wpath + "/");
  }

  // .md file?
  const mdp = fp + ".md";
  const md = await readMd(mdp);
  if (md !== null) {
    const html = fixMermaid(marked.parse(md));
    const title = md.match(/^#\s+(.+)/m)?.[1] || segs[segs.length - 1];
    const baseForPage = "/" + segs.slice(0, -1).join("/");
    const baseUrl = (baseForPage === "/" || baseForPage === "") ? "/" : baseForPage + "/";
    const content = `<div class="card markdown-body">${html}</div>
    <div class="actions">
      <a href="/edit/${wpath}" class="btn btn-ghost">✏️ Edit</a>
      <button class="btn btn-ghost btn-sm" onclick="showRename('${wpath}','${segs[segs.length-1]}',false)">🔤 Rename</button>
      <button onclick="if(confirm('Delete this page?')){delPage('${wpath}')}" class="btn btn-danger">🗑 Delete</button>
    </div>
    <script>async function delPage(p){const r=await fetch('/api/page/'+encodeURIComponent(p),{method:'DELETE'});if(r.ok)location.href='/';else alert('Delete failed');}</script>`;
    const sidebar = await getSidebarHtml("/" + wpath);
    return page(title, crumbs(segs), content, sidebar, baseUrl);
  }

  return null;
}

async function editPage(relPath) {
  const wpath = relPath.replace(/^\/+/, '').replace(/\\/g, '/');
  const fp = path.join(WIKI_ROOT, wpath + '.md');
  let content = await readMd(fp) || '';
  const title = content.match(/^#\s+(.+)/m)?.[1] || '';
  const segs = wpath.split('/').filter(Boolean);
  const isNew = !content;

  const body = `<h2>${isNew ? '📝 New Page' : '✏️ Edit: ' + esc(title || wpath)}</h2>
<div class="card">
  <div class="form-group">
    <label>Title</label>
    <input type="text" id="pageTitle" value="${esc(title)}" placeholder="Page title">
  </div>
  <textarea class="edit-area" id="editContent">${esc(content)}</textarea>
  <div class="actions">
    <button class="btn btn-primary" onclick="save()">💾 Save</button>
    <button class="btn btn-ghost" onclick="preview()">👁 Preview</button>
    <a href="${isNew ? '/' : '/' + wpath}" class="btn btn-ghost">Cancel</a>
  </div>
  <div id="previewArea" class="preview-box hidden markdown-body"></div>
</div>
<script>
async function save(){
  let c=document.getElementById('editContent').value;
  const t=document.getElementById('pageTitle').value.trim();
  if(t&&!c.match(/^#\\s+/)) c='# '+t+'\\n\\n'+c.replace(/^#\\s+.+\\n*/,'');
  const r=await fetch('/api/page/'+encodeURIComponent('${wpath}'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:c})});
  if(r.ok){const s='${wpath}'.split('/');if(s[s.length-1]==='_index'){s.pop();location.href='/'+s.join('/');}else{location.href='/${wpath}';}}
  else{const e=await r.json();alert('Save failed: '+e.error);}
}
async function preview(){
  const c=document.getElementById('editContent').value;
  const r=await fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:c})});
  const h=await r.text();
  document.getElementById('previewArea').classList.remove('hidden');
  document.getElementById('previewArea').innerHTML=h;
}
</script>`;
  const sidebar = await getSidebarHtml('/' + wpath);
  return page((isNew ? 'New: ' : 'Edit: ') + (title || wpath), crumbs(segs.length ? segs : [wpath]), body, sidebar);
}

async function searchPage(query) {
  const all = await getAllPages();
  const results = all.filter(p => {
    const q = query.toLowerCase();
    return p.title.toLowerCase().includes(q) || p.path.toLowerCase().includes(q);
  });
  let items = '';
  for (const p of results) {
    const d = path.dirname(p.path);
    const link = p.path.replace(/\.md$/, '');
    items += `<li><a href="/${link}">📄 ${esc(p.title)} <span class="meta">${esc(d === '.' ? '/' : d)}</span></a></li>`;
  }
  const content = `<h2>🔍 Search: ${esc(query)}</h2>
<div class="card">
  ${results.length > 0 ? `<ul class="item-list">${items}</ul><p style="margin-top:12px;color:#8395a7">${results.length} result(s)</p>` : '<div class="empty-state"><p>No results found</p></div>'}
</div>`;
  const sidebar = await getSidebarHtml('/');
  return page('Search: ' + query, '', content, sidebar);
}

async function newModulePage() {
  const content = `<h2>📦 New Module</h2>
<div class="card">
  <div class="form-group">
    <label>Module Name</label>
    <input type="text" id="modName" placeholder="e.g. H80, TY1200">
  </div>
  <div class="form-group">
    <label>Description</label>
    <input type="text" id="modDesc" placeholder="Brief description of this module">
  </div>
  <p style="color:#8395a7;font-size:13px;margin-bottom:12px;line-height:1.6">
    Standard folders will be created automatically:<br>
    📁 <b>0_简介</b> — Module overview (architecture & specs)<br>
    📁 <b>1_原理图</b> — Schematic analysis per sub-module<br>
    📁 <b>2_测试记录</b> — Test plans, reports, issue tracking<br>
    📁 <b>3_生产台账</b> — Production ledger
  </p>
  <button class="btn btn-primary" onclick="createModule()">Create Module</button>
</div>
<script>
async function createModule(){
  const n=document.getElementById('modName').value.trim();
  const d=document.getElementById('modDesc').value.trim();
  if(!n){alert('Enter module name');return;}
  const r=await fetch('/api/module',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:n,description:d||'Module documentation.'})
  });
  if(r.ok){location.href='/'+n;}
  else{const e=await r.json();alert('Create failed: '+e.error);}
}
</script>`;
  const sidebar = await getSidebarHtml('/');
  return page('New Module', '', content, sidebar);
}

async function newPagePage(search) {
  const params = new URLSearchParams(search);
  const mod = params.get('module') || '';
  const content = `<h2>📝 New Page</h2>
<div class="card">
  <div class="form-group">
    <label>Module / Path</label>
    <input type="text" id="modulePath" value="${esc(mod)}" placeholder="e.g. M20/low_speed_interface">
  </div>
  <div class="form-group">
    <label>Page Name</label>
    <input type="text" id="pageName" placeholder="e.g. can">
  </div>
  <button class="btn btn-primary" onclick="goCreate()">Create & Edit</button>
</div>
<script>
function goCreate(){
  const m=document.getElementById('modulePath').value.trim();
  const n=document.getElementById('pageName').value.trim();
  if(!m||!n){alert('Fill all fields');return;}
  location.href='/edit/'+m+'/'+n.replace(/\\s+/g,'_');
}
</script>`;
  const sidebar = await getSidebarHtml('/');
  return page('New Page', mod ? crumbs(mod.split('/')) : '', content, sidebar);
}

// ========== API ==========
function bodyParser(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}

const STD_MODULE_DIRS = ['0_简介', '1_原理图', '2_测试记录', '2_测试记录/0_问题记录', '2_测试记录/1_测试大纲', '2_测试记录/2_测试报告', '3_生产台账'];
const STD_MODULE_FILES = [
  ['2_测试记录/1_测试大纲/测试大纲.md', '# 测试大纲\n\n待补充...'],
  ['2_测试记录/2_测试报告/测试报告.md', '# 测试报告\n\n待补充...'],
];

async function handleApi(req, res, urlObj) {
  const ap = decodeURIComponent(urlObj.pathname.replace('/api', ''));

  const jsonH = { 'Content-Type': 'application/json' };

  // POST /api/rename - rename folder or file
  if (req.method === 'POST' && ap === '/rename') {
    const raw = await bodyParser(req);
    const { oldPath, newName, isDir: renameDir } = JSON.parse(raw);
    if (!oldPath || !newName) { res.writeHead(400, jsonH); res.end(JSON.stringify({ error: 'Invalid' })); return; }
    const parts = oldPath.split('/').filter(Boolean);
    if (!parts.length) { res.writeHead(400, jsonH); res.end(JSON.stringify({ error: 'Invalid path' })); return; }
    const oldName = parts.pop(); const pp = parts.join('/');
    if (renameDir) {
      const of = path.join(WIKI_ROOT, pp, oldName); const nf = path.join(WIKI_ROOT, pp, newName);
      if (!(await isDir(of))) { res.writeHead(404, jsonH); res.end(JSON.stringify({ error: 'Not found' })); return; }
      try { await fs.rename(of, nf); } catch(e) { res.writeHead(500, jsonH); res.end(JSON.stringify({ error: e.message })); return; }
      const rd = pp ? '/' + pp + '/' + newName : '/' + newName;
      res.writeHead(200, jsonH); res.end(JSON.stringify({ ok: true, redirect: rd }));
    } else {
      const om = path.join(WIKI_ROOT, pp, oldName + '.md'); const nm = path.join(WIKI_ROOT, pp, newName + '.md');
      try { await fs.stat(om); } catch { res.writeHead(404, jsonH); res.end(JSON.stringify({ error: 'Not found' })); return; }
      try { await fs.rename(om, nm); } catch(e) { res.writeHead(500, jsonH); res.end(JSON.stringify({ error: e.message })); return; }
      const rd = pp ? '/' + pp + '/' + newName : '/' + newName;
      res.writeHead(200, jsonH); res.end(JSON.stringify({ ok: true, redirect: rd }));
    }
    return;
  }

  // POST /api/module - create a new module with standard structure
  if (req.method === 'POST' && ap === '/module') {
    const raw = await bodyParser(req);
    const { name, description } = JSON.parse(raw);
    if (!name || !/^[\w\u4e00-\u9fff-]+$/.test(name)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid module name' }));
      return;
    }
    const modDir = path.join(WIKI_ROOT, name);
    if (await isDir(modDir)) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Module already exists' }));
      return;
    }
    // Create directories
    await fs.mkdir(modDir, { recursive: true });
    for (const d of STD_MODULE_DIRS) {
      await fs.mkdir(path.join(modDir, d), { recursive: true });
    }
    // Create index
    const desc = description || 'Module documentation.';
    await fs.writeFile(path.join(modDir, '_index.md'), `# ${name}\n\n${desc}\n\n## 硬件架构\n\n待补充...\n\n## 快速规格\n\n| 项目 | 规格 |\n|------|------|\n| | |\n`, 'utf-8');
    // Create standard files
    for (const [fp, content] of STD_MODULE_FILES) {
      const full = path.join(modDir, fp);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, 'utf-8');
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, module: name }));
    return;
  }

  // DELETE /api/module/:name
  if (req.method === 'DELETE' && ap.startsWith('/module/')) {
    const modName = decodeURIComponent(ap.replace('/module/', ''));
    if (!/^[\w\u4e00-\u9fff-]+$/.test(modName)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid module name' }));
      return;
    }
    const dirPath = path.join(WIKI_ROOT, modName);
    if (!(await isDir(dirPath))) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Module not found' }));
      return;
    }
    const ok = await rmDir(dirPath);
    res.writeHead(ok ? 200 : 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ok ? { ok: true } : { error: 'Delete failed' }));
    return;
  }

  // POST /api/page/:path
  if (req.method === 'POST' && ap.startsWith('/page/')) {
    const wp = decodeURIComponent(ap.replace('/page/', ''));
    const raw = await bodyParser(req);
    let bd;
    try { bd = JSON.parse(raw); } catch { bd = { content: raw }; }
    const fp = path.join(WIKI_ROOT, wp + '.md');
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(fp, bd.content, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, path: wp }));
    return;
  }

  // DELETE /api/page/:path
  if (req.method === 'DELETE' && ap.startsWith('/page/')) {
    const wp = decodeURIComponent(ap.replace('/page/', ''));
    const fp = path.join(WIKI_ROOT, wp + '.md');
    try { await fs.unlink(fp); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true })); }
    catch { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found' })); }
    return;
  }


  // DELETE /api/folder/:path - delete folder and all contents
  if (req.method === 'DELETE' && ap.startsWith('/folder/')) {
    const folderPath = decodeURIComponent(ap.replace('/folder/', ''));
    const fp2 = path.join(WIKI_ROOT, folderPath);
    try {
      if (!(await isDir(fp2))) {
        res.writeHead(404, jsonH);
        res.end(JSON.stringify({ error: 'Folder not found' }));
        return;
      }
      const ok = await rmDir(fp2);
      res.writeHead(ok ? 200 : 500, jsonH);
      res.end(JSON.stringify(ok ? { ok: true } : { error: 'Delete failed' }));
    } catch(e) {
      res.writeHead(500, jsonH);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  // POST /api/preview
  if (req.method === 'POST' && ap === '/preview') {
    const raw = await bodyParser(req);
    const { content } = JSON.parse(raw);
    const html = fixMermaid(marked.parse(content || ''));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // GET /api/pages
  if (req.method === 'GET' && ap === '/pages') {
    const pages = await getAllPages();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(pages));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

// ========== SERVER ==========
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(u.pathname);

    if (pathname.startsWith('/api')) return await handleApi(req, res, u);

    let html = null;
    if (pathname === '/') html = await homePage();
    else if (pathname === '/new') html = await newModulePage();
    else if (pathname === '/new-page') html = await newPagePage(u.search);
    else if (pathname === '/search') html = await searchPage(u.searchParams.get('q') || '');
    else if (pathname.startsWith('/edit/')) {
      html = await editPage(pathname.replace('/edit/', '').replace(/^\/+/, ''));
    } else {
      const rp = pathname;
      if (u.searchParams.get('edit') === '1') {
        html = await editPage(rp.replace(/^\/+/, ''));
      } else {
        html = await viewPage(rp);
      }
      if (!html) {
        const segs = rp.replace(/^\/+/, '').split('/').filter(Boolean);
        const body = `<div class="empty-state">
          <div class="icon">❓</div>
          <h3>Page Not Found</h3>
          <p>${esc(rp)}</p>
          <a href="/edit/${rp.replace(/^\/+/, '')}" class="btn btn-primary" style="margin-top:16px">➕ Create This Page</a>
        </div>`;
        const sidebar = await getSidebarHtml('/');
        html = page('404 - Not Found', crumbs(segs.length ? segs : []), body, sidebar);
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (err) {
    console.error('Error:', err);
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>500 - Server Error</h1><pre>${esc(err.stack || err.message)}</pre>`);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Hardware Wiki running at http://0.0.0.0:${PORT}`);
  console.log(`Content root: ${WIKI_ROOT}`);
});


