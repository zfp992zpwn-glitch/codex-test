const KEY="nogekiri_v1";
const defaults={currentAge:20,targetAge:35,currentAssets:1000000,monthlyLivingCost:300000,annualReturn:7,jobRoute:"カスタム",income20early:1000000,income20late:5000000,income30early:9000000,income30late:12000000,income40plus:15000000,taxMode:"auto",manualTakeHomeRate:74,investMode:"auto",manualInvestment:150000,expenseMode:"manual",rent:80000,fixedCost:50000,hobbyCost:70000,annualSpecial:300000,sideIncome:0,sideGrowth:30,sideCap:300000,sideTakeHomeRate:80,dailyTakeHome:30000,acceptableDays:3};
const routes={"会社員":{manualTakeHomeRate:75,dailyTakeHome:18000},"医師":{manualTakeHomeRate:63,dailyTakeHome:45000},"エンジニア":{manualTakeHomeRate:72,dailyTakeHome:25000},"資格職":{manualTakeHomeRate:70,dailyTakeHome:28000},"公務員":{manualTakeHomeRate:76,dailyTakeHome:19000},"起業・副業":{manualTakeHomeRate:68,dailyTakeHome:22000},"学生":{manualTakeHomeRate:90,dailyTakeHome:8000},"カスタム":{}};
const ids=Object.keys(defaults); const state={...defaults,...JSON.parse(localStorage.getItem(KEY)||"{}")};
const charts={};
const el=id=>document.getElementById(id); const y=v=>`¥${Math.round(v).toLocaleString("ja-JP")}`;
function incomeByAge(a,s){if(a<25)return s.income20early;if(a<30)return s.income20late;if(a<35)return s.income30early;if(a<40)return s.income30late;return s.income40plus;}
function takeRate(income,s){if(s.taxMode==="manual")return s.manualTakeHomeRate/100; if(income<3000000)return .82;if(income<5000000)return .78;if(income<8000000)return .74;if(income<12000000)return .69;if(income<18000000)return .63;return .58;}
function calc(customReturn){const s=collect(); const arr=[]; let assets=s.currentAssets, side=s.sideIncome; let e5,e3,e1,fire;
 for(let age=s.currentAge;age<=Math.max(s.targetAge,60);age++){
  const annual=incomeByAge(age,s), tr=takeRate(annual,s), take=annual*tr, monthTake=take/12;
  const monthlyCost=s.expenseMode==="auto"?(s.rent+s.fixedCost+s.hobbyCost+s.annualSpecial/12):s.monthlyLivingCost;
  const invest=s.investMode==="manual"?s.manualInvestment:Math.max(monthTake-monthlyCost,0);
  side=Math.min(side*(1+s.sideGrowth/100),s.sideCap); const sideNet=side*(s.sideTakeHomeRate/100);
  const assetIncome=assets*.04/12, escape=((assetIncome+sideNet)/monthlyCost)*100;
  const shortage=Math.max(monthlyCost-assetIncome-sideNet,0), needWeek=(shortage/s.dailyTakeHome)/4;
  if(e5===undefined&&needWeek<=5)e5=age; if(e3===undefined&&needWeek<=3)e3=age; if(e1===undefined&&needWeek<=1)e1=age; if(fire===undefined&&shortage<=0)fire=age;
  arr.push({age,annual,take,monthlyCost,invest,assets,assetIncome,sideNet,escape,needWeek,taxLoss:annual-take});
  assets=assets*(1+(customReturn??s.annualReturn)/100)+invest*12;
  if(age===30)assets*=.7; if(age===33)assets*=.5;
 }
 return {arr,e5,e3,e1,fire,s};
}
function score(row,s){const escape=Math.min(row.escape,180)/1.8; const work=Math.max(0,100-row.needWeek*20); const assets=Math.min(row.assets/50000000*100,100); const side=Math.min(row.sideNet/200000*100,100); const invest=Math.min(row.invest/200000*100,100); const crash=Math.min((row.assets/(row.monthlyCost*12))*5,100); return Math.round((escape+work+assets+side+invest+crash)/6);}
function rank(sc){if(sc>=85)return"S";if(sc>=75)return"A";if(sc>=60)return"B";if(sc>=45)return"C";if(sc>=30)return"D";return"E"}
function comment(sc){if(sc>=75)return"年収が高いだけでは不十分。あなたは手取りと投資余力への変換ができています。";if(sc>=55)return"完全FIREは遠くても、週5で消耗する未来からは逃げ始めています。";return"週5が当たり前、という前提を疑うところから再設計を。資産はエンジン、副業は加速装置です。";}
function render(){const res=calc(); const target=res.arr.find(x=>x.age===res.s.targetAge)??res.arr.at(-1); const sc=score(target,res.s), r=rank(sc);
 el("score").textContent=`${sc}点 (${r})`; el("escape5").textContent=res.e5??"未到達"; el("fireAge").textContent=res.fire??"未到達";
 const sideZero={...res.s,sideIncome:0}; const noSide=calcWith(sideZero); const fast=(noSide.e5??999)-(res.e5??999);
 el("resultText").innerHTML=`<h2>診断結果</h2><ul><li>目標年齢の必要労働日数: ${target.needWeek.toFixed(2)}日/週</li><li>週3脱出年齢: ${res.e3??"未到達"} / 週1脱出年齢: ${res.e1??"未到達"}</li><li>副業月${Math.round(res.s.sideIncome/10000)}万円は、週5脱出を${fast>0?fast.toFixed(1):0}年早めます。</li><li>この年収だと、ざっくり年間${y(target.taxLoss)}が税金・社会保険で消えます。</li><li>年収${y(target.annual)}でも、自由に使える手取りは約${y(target.take)}です。</li><li>${comment(sc)}</li><li>ランク${r}: ${["E:このままだと普通に週5労働","D:まだ労働依存が強い","C:副業か投資額の強化が必要","B:週3勤務ならかなり自由","A:週1〜2勤務で十分","S:もう労働に人生を握られていない"][["E","D","C","B","A","S"].indexOf(r)]}</li></ul>`;
 draw(res);
}
function calcWith(s){const old=collect;return (function(){const bak=collect;collect=()=>s;const r=calc();collect=bak;return r;})();}
function draw(res){const L=res.arr.map(v=>v.age),D=res.arr; mk("assetChart","line",L,[{label:"予想資産額",data:D.map(v=>v.assets),borderColor:"#0f766e"}]);
 mk("incomeChart","line",L,[{label:"年収",data:D.map(v=>v.annual),borderColor:"#2563eb"},{label:"手取り",data:D.map(v=>v.take),borderColor:"#16a34a"}]);
 mk("investChart","bar",L,[{label:"毎月投資可能額",data:D.map(v=>v.invest),backgroundColor:"#0ea5e9"}]);
 mk("escapeChart","line",L,[{label:"労働脱出率(%)",data:D.map(v=>v.escape),borderColor:"#22c55e"}]);
 const t=D.find(v=>v.age===res.s.targetAge)??D.at(-1), labor=Math.max(t.monthlyCost-t.assetIncome-t.sideNet,0); mk("ratioChart","doughnut",["資産収入","副業手取り","労働収入"],[{data:[t.assetIncome,t.sideNet,labor],backgroundColor:["#14b8a6","#3b82f6","#64748b"]}]);
 const s3=calc(res.s.annualReturn?3:3),s5=calc(5),s7=calc(7),s10=calc(10); mk("scenarioChart","line",L,[{label:"3%",data:s3.arr.map(v=>v.assets),borderColor:"#94a3b8"},{label:"5%",data:s5.arr.map(v=>v.assets),borderColor:"#22c55e"},{label:"7%",data:s7.arr.map(v=>v.assets),borderColor:"#0ea5e9"},{label:"10%",data:s10.arr.map(v=>v.assets),borderColor:"#7c3aed"}]);}
function mk(id,type,labels,datasets){charts[id]?.destroy(); charts[id]=new Chart(el(id),{type,data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false}})}
function collect(){ids.forEach(i=>{const n=el(i).type==="number"?Number(el(i).value):el(i).value; state[i]=n;}); localStorage.setItem(KEY,JSON.stringify(state)); return state;}
function init(){const sel=el("jobRoute"); Object.keys(routes).forEach(k=>sel.add(new Option(k,k))); ids.forEach(i=>el(i).value=state[i]);
 el("jobRoute").addEventListener("change",()=>{const r=routes[el("jobRoute").value]||{}; Object.entries(r).forEach(([k,v])=>el(k).value=v);});
 document.querySelectorAll("input,select").forEach(n=>n.addEventListener("change",()=>{collect();render();})); el("calcBtn").addEventListener("click",render); render();}
init();
