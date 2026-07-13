const DATA = window.NOWDA_DATA || [];
const PAGE_SIZE = 24;
const categories = ["전체", "관광지", "체험/레포츠", "식음료", "쇼핑/소품샵"];
const categoryOrder = Object.fromEntries(categories.map((name, index) => [name, index]));

const state = { search: "", category: "전체", location: "all", area: "all", sort: "category", visible: PAGE_SIZE };
let route = JSON.parse(localStorage.getItem("nowdaRoute") || "[]").filter(id => DATA.some(item => item.id === id));
const $ = (selector) => document.querySelector(selector);
const els = {
  search: $("#search"), categoryFilters: $("#categoryFilters"), location: $("#locationFilter"), area: $("#areaFilter"),
  sort: $("#sortOrder"), grid: $("#cardGrid"), count: $("#resultCount"),
  summary: $("#activeSummary"), loadMore: $("#loadMore"), empty: $("#emptyState")
};

categories.forEach((category) => {
  const button = document.createElement("button");
  button.className = `chip${category === "전체" ? " active" : ""}`;
  button.type = "button";
  button.dataset.value = category;
  button.textContent = category;
  button.addEventListener("click", () => { state.category = category; state.visible = PAGE_SIZE; render(); });
  els.categoryFilters.append(button);
});

function normalize(value) { return String(value || "").toLocaleLowerCase().replace(/\s+/g, ""); }
function escaped(value) { return String(value || "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }

function updateAreas() {
  const previous = state.area;
  const areas = [...new Set(DATA.filter(x => state.location === "all" || x.location === state.location).map(x => x.area).filter(Boolean))].sort((a,b) => a.localeCompare(b,"ko"));
  els.area.innerHTML = '<option value="all">전체</option>' + areas.map(x => `<option value="${escaped(x)}">${escaped(x)}</option>`).join("");
  state.area = areas.includes(previous) ? previous : "all";
  els.area.value = state.area;
}

function filteredData() {
  const query = normalize(state.search);
  const filtered = DATA.filter(item => {
    const haystack = normalize([item.name,item.address,item.benefit,item.category,item.area].join(" "));
    return (!query || haystack.includes(query)) &&
      (state.category === "전체" || item.category === state.category) &&
      (state.location === "all" || item.location === state.location) &&
      (state.area === "all" || item.area === state.area);
  });
  return filtered.sort((a,b) => {
    if (state.sort === "name") return a.name.localeCompare(b.name,"ko");
    if (state.sort === "location") return (a.location+a.area+a.name).localeCompare(b.location+b.area+b.name,"ko");
    return (categoryOrder[a.category] - categoryOrder[b.category]) || a.name.localeCompare(b.name,"ko");
  });
}

function card(item) {
  const warning = ["휴업", "확인 필요"].includes(item.status);
  const showNote = item.status !== "특이사항 미확인";
  const added = route.includes(item.id);
  return `<article class="card" data-category="${escaped(item.category)}">
    <div class="card-top"><span class="category">${escaped(item.category)}</span><span class="status ${warning ? "warning" : ""}">${escaped(item.status)}</span></div>
    <h3>${escaped(item.name)}</h3>
    <p class="address">${escaped(item.address)}</p>
    <div class="benefit-box"><span>NOWDA BENEFIT</span><p>${escaped(item.benefit)}</p></div>
    ${showNote ? `<p class="note">${escaped(item.note)}</p>` : ""}
    <a class="card-link" href="${escaped(item.sourceUrl)}" target="_blank" rel="noopener">비짓제주에서 자세히 보기 <span>↗</span></a>
    <div class="card-actions">
      <button class="add-course ${added ? "added" : ""}" data-add="${item.id}" type="button">${added ? "✓ 코스에 담김" : "+ 코스에 담기"}</button>
      <button class="nearby-button" data-nearby="${item.id}" type="button" ${item.lat && item.lon ? "" : "disabled"}>인근 추천</button>
    </div>
  </article>`;
}

function render() {
  const results = filteredData();
  const shown = results.slice(0, state.visible);
  els.grid.innerHTML = shown.map(card).join("");
  els.count.textContent = results.length.toLocaleString("ko-KR");
  els.empty.hidden = results.length !== 0;
  els.loadMore.hidden = state.visible >= results.length || results.length === 0;
  document.querySelectorAll(".chip").forEach(x => x.classList.toggle("active", x.dataset.value === state.category));

  const active = [];
  if (state.search) active.push(`“${state.search}” 검색`);
  if (state.category !== "전체") active.push(state.category);
  if (state.location !== "all") active.push(state.location);
  if (state.area !== "all") active.push(state.area);
  els.summary.hidden = active.length === 0;
  els.summary.textContent = active.length ? `${active.join(" · ")} 조건으로 찾은 결과입니다.` : "";
  window.dispatchEvent(new CustomEvent("nowda:results", { detail: { items: results } }));
}

function saveRoute() {
  localStorage.setItem("nowdaRoute", JSON.stringify(route));
  renderRoute();
}

function toggleRoute(id) {
  route = route.includes(id) ? route.filter(x => x !== id) : [...route, id];
  saveRoute();
  render();
}
window.toggleNowdaRoute = toggleRoute;
window.getNowdaFilteredData = filteredData;
window.renderNowdaGallery = render;

function renderRoute() {
  const items = route.map(id => DATA.find(item => item.id === id)).filter(Boolean);
  $("#courseCount").textContent = items.length;
  $("#routeEmpty").hidden = items.length > 0;
  $("#routeList").innerHTML = items.map((item, index) => `<div class="route-item">
    <span class="route-number">${index + 1}</span>
    <div class="route-info"><strong>${escaped(item.name)}</strong><span>${escaped(item.category)} · ${escaped(item.area || item.location)}</span></div>
    <div class="route-controls">
      <button type="button" data-move="up" data-route-id="${item.id}" aria-label="위로 이동" ${index === 0 ? "disabled" : ""}>↑</button>
      <button type="button" data-move="down" data-route-id="${item.id}" aria-label="아래로 이동" ${index === items.length - 1 ? "disabled" : ""}>↓</button>
      <button type="button" data-remove="${item.id}" aria-label="코스에서 제거">×</button>
    </div>
  </div>`).join("");
  $("#benefitSummary").hidden = items.length === 0;
  $("#benefitCount").textContent = `${items.length}개`;
  $("#benefitList").innerHTML = items.map(item => `<div class="benefit-line"><strong>${escaped(item.name)}</strong> · ${escaped(item.benefit)}</div>`).join("");
}

function openDrawer() {
  $("#courseDrawer").classList.add("open");
  $("#courseDrawer").setAttribute("aria-hidden", "false");
  $("#drawerBackdrop").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeDrawer() {
  $("#courseDrawer").classList.remove("open");
  $("#courseDrawer").setAttribute("aria-hidden", "true");
  $("#drawerBackdrop").hidden = true;
  document.body.style.overflow = "";
}

function distanceKm(a, b) {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function nearbyFor(source) {
  const candidates = DATA.filter(item => item.id !== source.id && item.lat && item.lon && !["휴업", "확인 필요"].includes(item.status))
    .map(item => ({...item, distance: distanceKm(source, item)}))
    .sort((a,b) => a.distance - b.distance);
  const take = (types, count) => candidates.filter(item => types.includes(item.category)).slice(0, count);
  const preferred = source.category === "식음료"
    ? [...take(["관광지", "체험/레포츠"], 4), ...take(["식음료", "쇼핑/소품샵"], 2)]
    : [...take(["식음료"], 3), ...take(["관광지", "체험/레포츠", "쇼핑/소품샵"], 3)];
  return [...new Map(preferred.sort((a,b) => a.distance - b.distance).map(item => [item.id, item])).values()].slice(0, 6);
}

function openNearby(id) {
  const source = DATA.find(item => item.id === id);
  if (!source || !source.lat || !source.lon) return;
  const nearby = nearbyFor(source);
  $("#nearbyTitle").textContent = `${source.name} 인근 추천`;
  $("#nearbyCopy").textContent = source.category === "식음료" ? "식사 전후 함께 둘러보기 좋은 관광지·체험과 다른 먹거리를 추천해요." : "이 장소와 함께 방문하기 좋은 가까운 식음료·관광 제휴사를 추천해요.";
  $("#nearbyGrid").innerHTML = nearby.map(item => `<article class="nearby-item">
    <div class="nearby-item-top"><span>${escaped(item.category)}</span><strong>약 ${item.distance < 1 ? Math.round(item.distance * 1000) + "m" : item.distance.toFixed(1) + "km"}</strong></div>
    <h3>${escaped(item.name)}</h3><p>${escaped(item.benefit)}</p>
    <button type="button" class="${route.includes(item.id) ? "added" : ""}" data-nearby-add="${item.id}">${route.includes(item.id) ? "✓ 코스에 담김" : "+ 함께 코스에 담기"}</button>
  </article>`).join("");
  $("#nearbyModal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeNearby() {
  $("#nearbyModal").hidden = true;
  document.body.style.overflow = "";
}

function copyRoute() {
  const items = route.map(id => DATA.find(item => item.id === id)).filter(Boolean);
  if (!items.length) return;
  const text = ["나의 나우다 제주 코스", ...items.map((item, i) => `${i + 1}. ${item.name} (${item.category})\n   ${item.address}\n   혜택: ${item.benefit}`)].join("\n\n");
  const done = () => { const button = $("#copyRoute"); button.textContent = "복사 완료 ✓"; setTimeout(() => button.textContent = "코스 복사하기", 1300); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done);
  else { const area = document.createElement("textarea"); area.value = text; document.body.append(area); area.select(); document.execCommand("copy"); area.remove(); done(); }
}

let searchTimer;
els.search.addEventListener("input", e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.search = e.target.value.trim(); state.visible = PAGE_SIZE; render(); }, 120); });
els.location.addEventListener("change", e => { state.location = e.target.value; state.visible = PAGE_SIZE; updateAreas(); render(); });
els.area.addEventListener("change", e => { state.area = e.target.value; state.visible = PAGE_SIZE; render(); });
els.sort.addEventListener("change", e => { state.sort = e.target.value; render(); });
els.loadMore.addEventListener("click", () => { state.visible += PAGE_SIZE; render(); });
els.grid.addEventListener("click", event => {
  const add = event.target.closest("[data-add]");
  const nearby = event.target.closest("[data-nearby]");
  if (add) toggleRoute(Number(add.dataset.add));
  if (nearby) openNearby(Number(nearby.dataset.nearby));
});
$("#routeList").addEventListener("click", event => {
  const remove = event.target.closest("[data-remove]");
  const move = event.target.closest("[data-move]");
  if (remove) { route = route.filter(id => id !== Number(remove.dataset.remove)); saveRoute(); render(); }
  if (move) {
    const index = route.indexOf(Number(move.dataset.routeId));
    const next = move.dataset.move === "up" ? index - 1 : index + 1;
    if (index >= 0 && next >= 0 && next < route.length) [route[index], route[next]] = [route[next], route[index]];
    saveRoute();
  }
});
$("#nearbyGrid").addEventListener("click", event => {
  const add = event.target.closest("[data-nearby-add]");
  if (add) { toggleRoute(Number(add.dataset.nearbyAdd)); openNearby(Number(DATA.find(x => x.name === $("#nearbyTitle").textContent.replace(" 인근 추천", ""))?.id)); }
});
$("#courseFab").addEventListener("click", openDrawer);
$("#closeDrawer").addEventListener("click", closeDrawer);
$("#drawerBackdrop").addEventListener("click", closeDrawer);
$("#closeNearby").addEventListener("click", closeNearby);
$("#nearbyBackdrop").addEventListener("click", closeNearby);
$("#copyRoute").addEventListener("click", copyRoute);
$("#clearRoute").addEventListener("click", () => { if (route.length && confirm("담아둔 코스를 모두 비울까요?")) { route = []; saveRoute(); render(); } });

function reset() {
  Object.assign(state, { search: "", category: "전체", location: "all", area: "all", sort: "category", visible: PAGE_SIZE });
  els.search.value = ""; els.location.value = "all"; els.sort.value = "category"; updateAreas(); render();
}
$("#resetFilters").addEventListener("click", reset);
$("#emptyReset").addEventListener("click", reset);
document.addEventListener("keydown", e => { if (e.key === "/" && document.activeElement !== els.search) { e.preventDefault(); els.search.focus(); } });
document.addEventListener("keydown", e => { if (e.key === "Escape") { closeDrawer(); closeNearby(); } });

updateAreas();
renderRoute();
render();
