/* Five screenshot-led introductions; recapture before publishing UI changes. */
(() => {
  'use strict';
  const seenKey='pokelator-pro-tutorial-seen-v1';
  const slides=[
    {title:'Battle Answers & Better Teams',image:'overview',alt:'Battle calculations beside team-building damage tiers, with callouts for fast battle queries, comparing builds, and saving teams.',caption:'Get battle answers in about 3 seconds with preloaded meta data, then find your next teammate with Advanced Filtering.'},
    {title:'Advanced Filtering',image:'filtering',alt:'An Attack boost and a physical Fire move with 75 or more power: two compact move requirements above actual matching Pokémon results.',caption:'Find Pokémon that meet several move requirements, then combine them with type, resistance and ability filters.'},
    {title:'Fast Matchup Answers',image:'battle',alt:'Actual Battle View with highlighted opponent selection, damage ranges, weather, terrain, abilities, items, stat stages and Speed comparisons, plus a real item tooltip labeled Hover When Confused!.',caption:'Pick an opponent, then test battle conditions and modifiers. Hover When Confused!'},
    {title:'Smarter Stat Investments',image:'builder',alt:'Speed, Offense, Defense and Balance panels showing investment thresholds, move previews, defensive spread suggestions and one-on-one matchups.',caption:'Compare Speed, Offense, Team Offense, Defense and Balance, then lock in stronger moves and stat spreads.'},
    {title:'Your Matchup Shortlists',image:'highlights',alt:'Highlighted opponent borders, Pokémon search, the highlighted-only filter and named highlight sets in Team Builder.',caption:'Click or search to highlight Pokémon across views, focus calculations on them, and save named sets to revisit.'}
  ];
  const dialog=document.createElement('dialog');
  dialog.id='tutorialDialog';dialog.className='tutorial-dialog';
  dialog.setAttribute('aria-labelledby','tutorialTitle');
  dialog.innerHTML=`<div class="tutorial-heading"><span class="tutorial-eyebrow">Pokelator Pro · Quick Tour</span><button type="button" class="mini-button tutorial-close" aria-label="Close tutorial">×</button></div>
    <h2 id="tutorialTitle"></h2><div class="tutorial-picture"><img id="tutorialImage" width="1440" height="810" alt="" /></div>
    <p id="tutorialCaption"></p><div class="tutorial-footer"><button type="button" id="tutorialPrevious" class="mini-button tutorial-arrow" aria-label="Previous tutorial picture">←</button><div class="tutorial-dots" role="group" aria-label="Tutorial pictures"></div><span id="tutorialProgress" aria-live="polite"></span><button type="button" id="tutorialNext" class="mini-button tutorial-arrow" aria-label="Next tutorial picture">→</button><button type="button" id="tutorialDone" class="mini-button" hidden>Try it</button></div>`;
  document.body.append(dialog);
  const picture=dialog.querySelector('img'),title=dialog.querySelector('h2'),caption=dialog.querySelector('p');
  const previous=dialog.querySelector('#tutorialPrevious'),next=dialog.querySelector('#tutorialNext'),done=dialog.querySelector('#tutorialDone');
  const dots=dialog.querySelector('.tutorial-dots');
  dots.innerHTML=slides.map((slide,index)=>`<button type="button" data-slide="${index}" aria-label="Picture ${index+1}: ${slide.title}"></button>`).join('');
  let current=0;
  function render() {
    const slide=slides[current];
    title.textContent=slide.title;caption.textContent=slide.caption;
    picture.src=`assets/tutorial/${slide.image}.png?v=20261123-filtering-release`;picture.alt=slide.alt;
    previous.disabled=current===0;next.hidden=current===slides.length-1;done.hidden=current!==slides.length-1;
    dialog.querySelector('#tutorialProgress').textContent=`${current+1} / ${slides.length}`;
    dots.querySelectorAll('button').forEach((button,index)=>button.setAttribute('aria-current',String(index===current)));
  }
  function close() {dialog.close();}
  function open() {
    current=0;render();
    if(!dialog.open) dialog.showModal();
    try {localStorage.setItem(seenKey,'true');} catch { /* Tour still works without storage. */ }
    dialog.querySelector('.tutorial-close').focus({preventScroll:true});
  }
  previous.addEventListener('click',()=>{current=Math.max(0,current-1);render();});
  next.addEventListener('click',()=>{current=Math.min(slides.length-1,current+1);render();});
  done.addEventListener('click',close);dialog.querySelector('.tutorial-close').addEventListener('click',close);
  dots.addEventListener('click',event=>{const button=event.target.closest('[data-slide]');if(button){current=Number(button.dataset.slide);render();}});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) close();}});
  dialog.addEventListener('keydown',event=>{
    if(event.key==='ArrowLeft' || event.key==='ArrowRight') {event.preventDefault();event.stopPropagation();current=Math.max(0,Math.min(slides.length-1,current+(event.key==='ArrowRight'?1:-1)));render();}
  });
  document.getElementById('tutorialButton').addEventListener('click',open);
  window.PokelatorTutorial={open,close};
  let seen=false;try {seen=localStorage.getItem(seenKey)==='true';} catch {seen=true;}
  if(!seen) open();
})();
