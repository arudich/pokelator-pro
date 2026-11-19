/* Reusable, dependency-free color editor. See components/COLOR-PICKER.md. */
(() => {
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
  const hex=n=>Math.round(n).toString(16).padStart(2,'0');
  class DetailedColorPicker extends HTMLElement {
    constructor() {
      super();this.attachShadow({mode:'open'});this.rgb=[112,215,255];this.hsl=[197,100,72];this.alpha=1;
    }
    get value() {return '#'+this.rgb.map(hex).join('')+(this.alpha<1 ? hex(this.alpha*255) : '');}
    set value(value) {
      const match=/^#?([\da-f]{6})([\da-f]{2})?$/i.exec(value || '');if(!match) return;
      this.rgb=[0,2,4].map(i=>parseInt(match[1].slice(i,i+2),16));this.alpha=match[2] ? parseInt(match[2],16)/255 : 1;
      this.readHSL();if(this.isConnected && this.shadowRoot.children.length) this.render();
    }
    readHSL() {
      const [r,g,b]=this.rgb.map(n=>n/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;
      let h=this.hsl[0],s=0;
      if(d) {s=d/(1-Math.abs(2*l-1));h=60*(max===r ? ((g-b)/d+6)%6 : max===g ? (b-r)/d+2 : (r-g)/d+4);}
      this.hsl=[h,s*100,l*100];
    }
    readRGB() {
      const [h,s,l]=[this.hsl[0],this.hsl[1]/100,this.hsl[2]/100],a=s*Math.min(l,1-l);
      this.rgb=[0,8,4].map(n=>{const k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))));});
    }
    connectedCallback() {
      if(this.shadowRoot.children.length) return;
      this.shadowRoot.innerHTML=`<style>
        :host{display:block;min-width:0;color:#dce6f0;font:12px system-ui,sans-serif;color-scheme:dark}
        *{box-sizing:border-box}label{display:grid;gap:4px;color:#a9bbce;font-size:11px}input,button{font:inherit}
        input[type=text],input[type=number]{width:100%;min-width:0;background:#101b29;border:1px solid #3a4f65;border-radius:5px;padding:6px;color:#e4edf7}
        input[type=range]{width:100%;margin:4px 0;accent-color:#93cfff;cursor:pointer}
        .top{display:grid;grid-template-columns:52px 1fr;gap:10px;align-items:end}.swatch{height:39px;padding:0;width:52px;border:1px solid #536b84;border-radius:6px;cursor:pointer}
        .rgb{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:10px 0}
        .sliders{display:grid;gap:7px}.caption{display:flex;justify-content:space-between}output{font-variant-numeric:tabular-nums;color:#dce6f0}
        .preview{height:26px;margin:10px 0;border:1px solid #536b84;border-radius:5px;background:repeating-conic-gradient(#26374a 0% 25%,#101b29 0% 50%) 0/12px 12px}.preview div{height:100%;border-radius:4px}
        .presets{display:flex;gap:5px;flex-wrap:wrap}.presets button{width:24px;height:24px;border:1px solid #667a8e;border-radius:5px;cursor:pointer}
        :focus-visible{outline:2px solid #9bd1ff;outline-offset:2px}
      </style><div class="top"><input class="swatch" type="color" aria-label="Choose color"/><label>Hex / Hex with alpha<input id="hex" type="text" spellcheck="false" aria-label="Hex color"/></label></div>
      <div class="rgb">${['Red','Green','Blue'].map((name,i)=>`<label>${name}<input type="number" min="0" max="255" step="1" data-rgb="${i}" aria-label="${name}"/></label>`).join('')}</div>
      <div class="sliders">${[['h', 'Hue',359],['s','Saturation',100],['l','Lightness',100],['a','Opacity',100]].map(([key,name,max])=>`<label><span class="caption">${name}<output id="${key}-value"></output></span><input type="range" min="0" max="${max}" step="1" data-channel="${key}" aria-label="${name}"/></label>`).join('')}</div>
      <div class="preview"><div></div></div><div class="presets">${['#70d7ff','#64a6ff','#e5aa68','#9cd67f','#c596e5','#e48fa9','#e5e5e5','#748498'].map(color=>`<button type="button" data-color="${color}" style="background:${color}" aria-label="Use ${color}" title="${color}"></button>`).join('')}</div>`;
      this.shadowRoot.addEventListener('input',event=>{
        const input=event.target;
        if(input.matches('.swatch')) {const alpha=this.alpha;this.value=input.value;this.alpha=alpha;}
        else if(input.id==='hex') {if(!/^#?[\da-f]{6}([\da-f]{2})?$/i.test(input.value)) return;this.value=input.value;}
        else if(input.dataset.rgb!==undefined) {if(input.value==='') return;this.rgb[Number(input.dataset.rgb)]=clamp(Number(input.value),0,255);this.readHSL();}
        else if(input.dataset.channel) {
          const key=input.dataset.channel,value=Number(input.value);
          if(key==='a') this.alpha=value/100;else {this.hsl[{h:0,s:1,l:2}[key]]=value;this.readRGB();}
        } else return;
        this.render();this.emit();
      });
      this.shadowRoot.addEventListener('change',()=>this.render());
      this.shadowRoot.addEventListener('click',event=>{const button=event.target.closest('[data-color]');if(button){this.value=button.dataset.color;this.emit();}});
      this.render();
    }
    emit() {this.dispatchEvent(new CustomEvent('color-change',{detail:{value:this.value},bubbles:true,composed:true}));}
    render() {
      const root=this.shadowRoot;
      root.querySelector('.swatch').value='#'+this.rgb.map(hex).join('');root.querySelector('#hex').value=this.value;
      root.querySelectorAll('[data-rgb]').forEach(input=>input.value=this.rgb[Number(input.dataset.rgb)]);
      for(const [key,value] of [['h',this.hsl[0]],['s',this.hsl[1]],['l',this.hsl[2]],['a',this.alpha*100]]) {
        root.querySelector(`[data-channel=${key}]`).value=Math.round(value);root.querySelector(`#${key}-value`).textContent=Math.round(value)+(key==='h' ? '°' : '%');
      }
      root.querySelector('.preview div').style.background=this.value;
    }
  }
  customElements.define('detailed-color-picker',DetailedColorPicker);
})();
