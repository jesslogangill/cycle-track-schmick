const App = (()=>{
 const STORAGE_KEY='ct_entries_demo';
 const getEntries=()=>JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
 const setEntries=(a)=>localStorage.setItem(STORAGE_KEY,JSON.stringify(a));
 function initDashboard(){
   renderWeightOverlay('weightChart');
 }
 function renderWeightOverlay(id){
   const entries=getEntries();
   const cycles={};
   entries.forEach(e=>{const c=e.cycleNumber||'1';(cycles[c] ||= []).push({x:+e.cycleDay,y:+e.weight});});
   const datasets=Object.keys(cycles).map((c,i)=>({label:'Cycle '+c,data:cycles[c],borderColor:['#ff4da6','#72e5ff','#2bdc90'][i%3],tension:.3,fill:false,parsing:false}));
   const ctx=document.getElementById(id).getContext('2d');
   if(ctx._chart) ctx._chart.destroy();
   ctx._chart=new Chart(ctx,{type:'line',data:{datasets},options:{scales:{x:{type:'linear',min:1,max:40}}}});
 }
 function initLog(){
   document.getElementById('logForm').addEventListener('submit',e=>{
     e.preventDefault();
     const fd=new FormData(e.target);
     const entry=Object.fromEntries(fd.entries());
     setEntries([...getEntries(),entry]);
     e.target.reset();
     alert('Saved');
   });
 }
 function initInsights(){
   const ctx=document.getElementById('heatmap').getContext('2d');
   ctx.fillStyle='#ff4da6';ctx.fillRect(20,20,100,50);
 }
 return {initDashboard,initLog,initInsights};
})();