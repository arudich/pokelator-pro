/* Local amplitude checks only: no audio recording, storage or upload. */
window.VoiceActivity=class {
  constructor(){this.active=false;this.cancelled=false;this.lastVoiceAt=performance.now();}
  async start(){
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context||!navigator.mediaDevices?.getUserMedia)return false;
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if(this.cancelled){stream.getTracks().forEach(t=>t.stop());return false;}
      this.stream=stream;this.context=new Context();await this.context.resume();
      if(this.cancelled){this.stop();return false;}
      this.source=this.context.createMediaStreamSource(stream);this.analyser=this.context.createAnalyser();
      this.analyser.fftSize=1024;this.source.connect(this.analyser);this.samples=new Float32Array(1024);
      this.active=true;this.lastVoiceAt=performance.now();
      this.timer=setInterval(()=>{
        this.analyser.getFloatTimeDomainData(this.samples);
        const rms=Math.sqrt(this.samples.reduce((sum,x)=>sum+x*x,0)/this.samples.length);
        if(rms>=.01)this.lastVoiceAt=performance.now();
      },50);
      return true;
    }catch{this.stop();return false;}
  }
  quietFor(milliseconds){return this.active&&performance.now()-this.lastVoiceAt>=milliseconds;}
  stop(){
    this.cancelled=true;this.active=false;clearInterval(this.timer);
    this.source?.disconnect();this.stream?.getTracks().forEach(t=>t.stop());
    this.context?.close().catch(()=>{});
  }
};
