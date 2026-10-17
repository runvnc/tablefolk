// note-svg.js - archived SVG foreignObject note renderer (fallback path).
// Root cause of "mostly plain text" bug: foreignObject requires WELL-FORMED XHTML.
// Plain HTML void tags like <img src=...> without a self-closing slash, or HTML
// entities like &nbsp;, make the whole SVG document fail XML parsing silently,
// so img.onerror fires and the note falls back to stripped plain text.
// Kept as a last-resort fallback when html2canvas is unavailable/fails.
function renderNoteTextureSVG(tex,ctx,W,H,html){
  try{
    const css='margin:0;padding:18px;box-sizing:border-box;width:'+W+'px;height:'+H+'px;background:#f3ecd8;color:#2a2318;font-family:Georgia,serif;font-size:17px;line-height:1.4;overflow:hidden;word-wrap:break-word;';
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="'+css.replace(/"/g,"'")+'">'+String(html||'')+'</div></foreignObject></svg>';
    const img=new Image();
    img.onload=()=>{ try{ ctx.fillStyle='#f3ecd8'; ctx.fillRect(0,0,W,H); ctx.drawImage(img,0,0,W,H); tex.update(); }catch(e){ console.warn('note svg drawImage failed',e); } };
    img.onerror=()=>{ /* keep whatever is already on the texture */ };
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  }catch(e){ console.warn('note SVG render failed',e); }
}
