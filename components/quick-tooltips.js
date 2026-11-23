/* Faster explanations for matchup icons and results; native titles are muted
   while hovered so the browser cannot display a second tooltip. */
(() => {
  const selector='[data-quick-tooltip],.tier-pokemon[title],.speed-scenario[title],.speed-chance[title],.speed-chance-badge[title],.speed-investment-badge[title],.ko-chance-badge[title],.stat-threshold-badge[title],.nature-damage-row[title],.nature-frequency[title]';
  const tip=document.createElement('div');tip.id='quickTooltip';tip.className='quick-tooltip';tip.setAttribute('role','tooltip');tip.setAttribute('popover','manual');document.body.append(tip);
  let current=null,timer=null,muted=[];
  function hide() {
    clearTimeout(timer);timer=null;
    if(tip.matches(':popover-open'))tip.hidePopover();
    for(const [element,title] of muted)if(!element.hasAttribute('title'))element.setAttribute('title',title);
    muted=[];
    if(current?.getAttribute('aria-describedby')==='quickTooltip')current.removeAttribute('aria-describedby');
    current=null;
  }
  function show(target,immediate=false) {
    if(current===target)return;
    hide();if(!target)return;
    const text=target.dataset.quickTooltip || target.getAttribute('title');if(!text)return;
    current=target;
    for(let element=target;element;element=element.parentElement) {
      if(element.hasAttribute('title')) {muted.push([element,element.getAttribute('title')]);element.removeAttribute('title');}
    }
    const reveal=()=>{
      if(!target.isConnected){hide();return;}
      tip.textContent=text;tip.style.left='0px';tip.style.top='0px';tip.showPopover();
      const anchor=target.getBoundingClientRect(),box=tip.getBoundingClientRect();
      tip.style.left=`${Math.max(8,Math.min(anchor.left,innerWidth-box.width-8))}px`;
      tip.style.top=`${Math.max(8,anchor.bottom+8+box.height<=innerHeight-8 ? anchor.bottom+8 : anchor.top-box.height-8)}px`;
      if(!target.hasAttribute('aria-describedby'))target.setAttribute('aria-describedby','quickTooltip');
    };
    timer=setTimeout(reveal,immediate ? 0 : 250);
  }
  document.addEventListener('pointerover',event=>{
    if(event.pointerType==='touch')return;
    if(current?.contains(event.target))return;
    show(event.target.closest(selector));
  });
  document.addEventListener('pointerout',event=>{if(current && !current.contains(event.relatedTarget))hide();});
  document.addEventListener('focusin',event=>{if(event.target.matches('[data-quick-tooltip]'))show(event.target,true);});
  document.addEventListener('focusout',event=>{if(event.target===current)hide();});
  document.addEventListener('click',event=>{const button=event.target.closest('[data-quick-tooltip]');if(button)show(button,true);else hide();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
  document.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);
})();
