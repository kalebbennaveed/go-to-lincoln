const paths={
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  muted:'<path d="M11 5 6 9H3v6h3l5 4zM16 9l6 6m0-6-6 6"/>',sound:'<path d="M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  pause:'<path d="M8 5v14m8-14v14" stroke-width="3"/>',expand:'<path d="M14 3h7v7m0-7-7 7M10 21H3v-7m0 7 7-7"/>',
  pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  walk:'<circle cx="14" cy="4" r="2"/><path d="m7 13 3-4 4-1 2 4 3 1m-7-4-2 7-4 5m5-7 4 3 2 4"/>',car:'<path d="m4 11 2-5h12l2 5m-17 0h18v7H3zm2 7v2m14-2v2m-13-6h2m8 0h2"/>',
  bike:'<circle cx="5.3" cy="16.4" r="4"/><circle cx="18.7" cy="16.4" r="4"/><path d="m5 16 5-8 4 8H5m8 0 4-9m-2-3h3l1 12M8 8h4"/>',
  fly:'<path d="M2 6h18M11 6v4m-8 1 3 2 3-3h5c3 0 5 3 6 6H9l-2-2-5-1V9m8 10h11m-9-3v3m5-3v3m-2-9 1 5"/>',camera:'<path d="M3 7h5l2-3h5l2 3h4v13H3z"/><circle cx="12" cy="13" r="3.5"/>'
};
export function icons(){for(const el of document.querySelectorAll('[data-icon]')) el.innerHTML=`<svg aria-hidden="true" viewBox="0 0 24 24">${paths[el.dataset.icon]||''}</svg>`;}
