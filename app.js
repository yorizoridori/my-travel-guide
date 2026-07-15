const DATA = window.NOWDA_DATA || [];
const DETAILS = window.NOWDA_DETAILS || {};
const IMAGES = window.NOWDA_IMAGES || {};
const PAGE_SIZE = 24;
const categories = ["전체", "관광지", "체험/레포츠", "식음료", "쇼핑/소품샵"];
const categoryOrder = Object.fromEntries(categories.map((name, index) => [name, index]));

// 자유로운 표현을 제휴사 데이터에 쓰인 말로 연결한다. 이 목록에 없는 단어도
// 업체명, 주소, 혜택, 소개문에서 그대로 검색되므로 검색어가 제한되지는 않는다.
const SEARCH_CONCEPTS = [
  { label: "분위기 좋은 곳", terms: ["분좋카", "분위기", "감성", "감성카페", "분위기좋은카페", "예쁜카페", "인테리어", "포토존", "인생샷", "사진"] },
  { label: "전망 좋은 곳", terms: ["뷰맛집", "뷰좋은", "전망", "오션뷰", "바다뷰", "산뷰", "정원뷰", "루프탑", "바다", "해안", "풍경", "경관"] },
  { label: "흑돼지", terms: ["흑돼지", "제주흑돼지", "돼지고기", "고기집", "고깃집", "돼지구이"] },
  { label: "아이와 함께", terms: ["아이와", "아이랑", "애들이랑", "어린이", "유아", "키즈", "가족", "가족여행", "가족체험"] },
  { label: "비 오는 날", terms: ["비오는날", "비올때", "우천", "실내", "박물관", "미술관", "전시", "공방"] },
  { label: "데이트", terms: ["데이트", "연인", "커플", "로맨틱", "감성", "사진"] },
  { label: "카페", terms: ["카페", "커피", "디저트", "베이커리", "빵", "브런치", "음료"] },
  { label: "체험", terms: ["체험", "액티비티", "놀거리", "레포츠", "클래스", "만들기"] },
  { label: "반려동물", terms: ["반려동물", "반려견", "강아지", "애견", "펫", "댕댕이"] },
  { label: "산책과 힐링", terms: ["산책", "걷기", "힐링", "조용한", "여유", "숲", "정원", "휴양"] }
];

const state = { search: "", category: "전체", location: "all", area: "all", sort: "category", visible: PAGE_SIZE };
let route = JSON.parse(localStorage.getItem("nowdaRoute") || "[]").filter(id => DATA.some(item => item.id === id));
let nearbySourceId = null;
let nearbyHistory = [];
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

function normalize(value) { return String(value || "").toLocaleLowerCase().replace(/[^0-9a-z가-힣]/g, ""); }
function escaped(value) { return String(value || "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function isNewPartner(item) {
  if (!item.newUntil) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expires = new Date(`${item.newUntil}T23:59:59`);
  return !Number.isNaN(expires.getTime()) && expires >= today;
}

function updateCollectionMeta() {
  const now = new Date();
  const month = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}`;
  $("#collectionMonth").textContent = month;
  $("#partnerTotal").textContent = DATA.length.toLocaleString("ko-KR");
  $("#heroPartnerTotal").textContent = DATA.length.toLocaleString("ko-KR");
  document.querySelectorAll("[data-category-stat]").forEach(stat => {
    stat.querySelector("strong").textContent = DATA.filter(item => item.category === stat.dataset.categoryStat).length.toLocaleString("ko-KR");
  });
}

function searchProfile(item) {
  const detail = DETAILS[item.id] || {};
  const fields = {
    name: normalize(item.name),
    category: normalize(item.category),
    location: normalize([item.location, item.area, detail.address || item.address].join(" ")),
    benefit: normalize(item.benefit),
    description: normalize([detail.summary, detail.description].join(" "))
  };
  fields.all = Object.values(fields).join(" ");
  return fields;
}

function parseSearch(query) {
  const rawTokens = String(query || "").toLocaleLowerCase().match(/[0-9a-z가-힣]+/g) || [];
  const compact = normalize(query);
  const concepts = SEARCH_CONCEPTS.filter(concept => concept.terms.some(term => compact.includes(normalize(term))));
  const conceptTerms = new Set(concepts.flatMap(concept => concept.terms.map(normalize)));
  const tokens = [...new Set(rawTokens.map(normalize).filter(token => token.length > 1))];
  return { compact, tokens, concepts, conceptTerms };
}

function scoreSearch(item, parsed) {
  if (!parsed.compact) return { score: 0, reasons: [] };
  const profile = searchProfile(item);
  let score = 0;
  const reasons = [];

  if (profile.name.includes(parsed.compact)) { score += 30; reasons.push("업체명 일치"); }
  const directTokens = parsed.tokens.filter(token => profile.all.includes(token));
  directTokens.forEach(token => {
    if (profile.name.includes(token)) score += 12;
    else if (profile.category.includes(token) || profile.location.includes(token)) score += 8;
    else if (profile.benefit.includes(token)) score += 6;
    else score += 4;
  });
  if (directTokens.length) reasons.push(...directTokens.slice(0, 2));

  parsed.concepts.forEach(concept => {
    const matches = concept.terms.map(normalize).filter(term => profile.all.includes(term));
    if (matches.length) {
      score += 5 + Math.min(matches.length, 3) * 2;
      reasons.push(concept.label);
    }
  });

  // 검색 문장에 카페/흑돼지처럼 명확한 업종 의도가 있으면 엉뚱한 결과를 줄인다.
  const wantsCafe = parsed.concepts.some(x => x.label === "카페") || ["분좋카", "카페"].some(x => parsed.compact.includes(x));
  if (wantsCafe && /카페|커피|베이커리|디저트|브런치/.test(profile.all)) score += 10;
  const wantsBlackPork = parsed.concepts.some(x => x.label === "흑돼지");
  if (wantsBlackPork && /흑돼지/.test(profile.all)) score += 14;

  const matchedIntent = directTokens.length > 0 ||
    parsed.concepts.some(concept => concept.terms.some(term => profile.all.includes(normalize(term)))) ||
    (wantsCafe && /카페|커피|베이커리|디저트|브런치/.test(profile.all)) ||
    (wantsBlackPork && /흑돼지/.test(profile.all));
  return { score: matchedIntent ? score : 0, reasons: [...new Set(reasons)].slice(0, 3) };
}

function updateAreas() {
  const previous = state.area;
  const areas = [...new Set(DATA.filter(x => state.location === "all" || x.location === state.location).map(x => x.area).filter(Boolean))].sort((a,b) => a.localeCompare(b,"ko"));
  els.area.innerHTML = '<option value="all">전체</option>' + areas.map(x => `<option value="${escaped(x)}">${escaped(x)}</option>`).join("");
  state.area = areas.includes(previous) ? previous : "all";
  els.area.value = state.area;
}

function filteredData() {
  const parsed = parseSearch(state.search);
  const filtered = DATA.map(item => ({ item, search: scoreSearch(item, parsed) })).filter(({ item, search }) => {
    return (!parsed.compact || search.score > 0) &&
      (state.category === "전체" || item.category === state.category) &&
      (state.location === "all" || item.location === state.location) &&
      (state.area === "all" || item.area === state.area);
  }).sort((a,b) => {
    const newDifference = Number(isNewPartner(b.item)) - Number(isNewPartner(a.item));
    if (newDifference) return newDifference;
    if (parsed.compact && b.search.score !== a.search.score) return b.search.score - a.search.score;
    const left = a.item, right = b.item;
    if (state.sort === "name") return left.name.localeCompare(right.name,"ko");
    if (state.sort === "location") return (left.location+left.area+left.name).localeCompare(right.location+right.area+right.name,"ko");
    return (categoryOrder[left.category] - categoryOrder[right.category]) || left.name.localeCompare(right.name,"ko");
  }).map(({ item, search }) => ({ ...item, _searchReasons: search.reasons }));
  return filtered;
}

function card(item) {
  const detail = DETAILS[item.id];
  const warning = ["휴업", "확인 필요"].includes(item.status);
  const showNote = item.status !== "특이사항 미확인";
  const added = route.includes(item.id);
  return `<article class="card" data-category="${escaped(item.category)}">
    <div class="card-top"><div class="card-labels"><span class="category">${escaped(item.category)}</span>${isNewPartner(item) ? '<span class="new-badge">NEW</span>' : ""}</div><span class="status ${warning ? "warning" : ""}">${escaped(item.status)}</span></div>
    <h3>${escaped(item.name)}</h3>
    <p class="address">${escaped(detail?.address || item.address)}</p>
    ${state.search && item._searchReasons?.length ? `<div class="match-reasons"><span>검색 연결</span>${item._searchReasons.map(reason => `<em>${escaped(reason)}</em>`).join("")}</div>` : ""}
    ${detail ? `<p class="card-summary">${escaped(detail.summary)}</p>` : ""}
    <button class="card-detail" data-detail="${item.id}" type="button">사진·상세 정보 보기 <span>→</span></button>
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
  $("#courseMapViewButton").disabled = items.length === 0;
  window.dispatchEvent(new CustomEvent("nowda:routechange", { detail: { items } }));
}
window.getNowdaRouteItems = () => route.map(id => DATA.find(item => item.id === id)).filter(Boolean);

function openDrawer() {
  $("#courseDrawer").classList.add("open");
  $("#courseDrawer").setAttribute("aria-hidden", "false");
  $("#drawerBackdrop").hidden = false;
  document.body.style.overflow = "hidden";
  window.dispatchEvent(new CustomEvent("nowda:draweropen", { detail: { items: window.getNowdaRouteItems() } }));
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

function distanceBand(distance) {
  if (distance < 1) return 0;
  if (distance < 3) return 1;
  if (distance < 5) return 2;
  return 3;
}

function nearbyFor(source) {
  const categoryGroups = {
    "관광지": [["식음료"], ["체험/레포츠", "쇼핑/소품샵"], ["관광지"]],
    "체험/레포츠": [["식음료"], ["관광지", "쇼핑/소품샵"], ["체험/레포츠"]],
    "식음료": [["관광지", "체험/레포츠"], ["쇼핑/소품샵"], ["식음료"]],
    "쇼핑/소품샵": [["관광지", "식음료"], ["체험/레포츠"], ["쇼핑/소품샵"]]
  };
  const groups = categoryGroups[source.category] || [];
  const categoryRank = category => {
    const rank = groups.findIndex(group => group.includes(category));
    return rank < 0 ? groups.length : rank;
  };
  return DATA.filter(item => item.id !== source.id && !route.includes(item.id) && item.lat && item.lon && !["휴업", "확인 필요"].includes(item.status))
    .map(item => ({...item, distance: distanceKm(source, item)}))
    .sort((a, b) => {
      const bandDifference = distanceBand(a.distance) - distanceBand(b.distance);
      if (bandDifference) return bandDifference;
      const categoryDifference = categoryRank(a.category) - categoryRank(b.category);
      return categoryDifference || a.distance - b.distance;
    })
    .slice(0, 6);
}

function openNearby(id) {
  const source = DATA.find(item => item.id === id);
  if (!source || !source.lat || !source.lon) return;
  nearbySourceId = id;
  const nearby = nearbyFor(source);
  $("#nearbyTitle").textContent = `${source.name} 다음 코스 추천`;
  $("#nearbyCopy").textContent = "가까운 거리 구간과 다른 카테고리를 우선해요. 장소를 담으면 그곳을 기준으로 다음 추천이 이어집니다.";
  $("#nearbyGrid").innerHTML = nearby.map(item => `<article class="nearby-item">
    <div class="nearby-item-top"><span>${escaped(item.category)}</span><strong>약 ${item.distance < 1 ? Math.round(item.distance * 1000) + "m" : item.distance.toFixed(1) + "km"}</strong></div>
    <h3>${escaped(item.name)}</h3><p>${escaped(item.benefit)}</p>
    <button type="button" data-nearby-add="${item.id}">코스에 담고 다음 추천 보기 →</button>
  </article>`).join("") || '<p class="nearby-empty">새로 추천할 제휴사가 없습니다.</p>';
  $("#nearbyBack").hidden = nearbyHistory.length === 0;
  $("#nearbyModal").hidden = false;
  document.body.style.overflow = "hidden";
}

function startNearby(id) {
  nearbyHistory = [];
  openNearby(id);
}
window.openNowdaNearby = startNearby;

function openDetail(id) {
  const item = DATA.find(entry => entry.id === id);
  if (!item) return;
  const detail = DETAILS[id] || {};
  const image = detail.imageUrl ? detail : (IMAGES[id] || {});
  const address = detail.address || item.address;
  const hours = detail.weeklyHours?.length
    ? detail.weeklyHours.map(row => `<div class="hours-row"><strong>${escaped(row.days)}</strong><span>${escaped(row.hours)}</span></div>`).join("")
    : '<div class="hours-unverified">요일별 운영시간을 확인하고 있습니다.</div>';
  const annualOpenNote = String(detail.hoursNote || "").includes("연중무휴");
  const hoursNote = detail.hoursNote
    ? annualOpenNote
      ? `<div class="hours-note annual-open-note"><strong>나우다 등록정보</strong><span>${escaped(detail.hoursNote)}</span><em>실제 휴무·임시휴무는 방문 전 업체에 확인해주세요.</em></div>`
      : `<p class="hours-note">※ ${escaped(detail.hoursNote)}</p>`
    : "";
  const hasFullDetail = Boolean(DETAILS[id]);
  const mapLink = item.lat && item.lon
    ? `https://map.kakao.com/link/map/${encodeURIComponent(item.name)},${item.lat},${item.lon}`
    : `https://map.kakao.com/?q=${encodeURIComponent(address)}`;
  const added = route.includes(id);

  $("#detailEyebrow").textContent = `${item.category} · ${item.area || item.location}`;
  $("#detailTitle").textContent = item.name;
  $("#detailContent").innerHTML = `
    ${image.imageUrl ? `<figure class="detail-photo"><img src="${escaped(image.imageUrl)}" alt="${escaped(image.imageAlt || `${item.name} 대표 사진`)}"><figcaption>사진 · <a href="${escaped(image.imageSourceUrl || detail.infoSourceUrl)}" target="_blank" rel="noopener">${escaped(image.imageSourceLabel || detail.infoSourceLabel || "출처 보기")}</a></figcaption></figure>` : ""}
    ${hasFullDetail ? `<p class="detail-summary">${escaped(detail.description || detail.summary)}</p>` : '<p class="detail-pending">이 제휴사의 소개와 운영시간은 아직 확인 전입니다. 현재 확보된 기본 정보를 먼저 보여드립니다.</p>'}
    <section class="detail-section"><h3>주소</h3><p>${escaped(address)}</p></section>
    <section class="detail-section"><h3>요일별 운영시간</h3><div class="hours-table">${hours}</div>${hoursNote}</section>
    <div class="detail-pair">
      <section class="detail-section"><h3>문의</h3><p>${escaped(detail.phone || "정보 확인 필요")}</p></section>
      <section class="detail-section"><h3>운영 상태</h3><p>${escaped(item.status)}</p></section>
    </div>
    <section class="detail-benefit"><span>NOWDA BENEFIT</span><p>${escaped(item.benefit)}</p></section>
    ${detail.checkedAt ? `<p class="detail-verified">${escaped(detail.checkedAt)} 확인 · <a href="${escaped(detail.infoSourceUrl)}" target="_blank" rel="noopener">${escaped(detail.infoSourceLabel)}</a><br>운영시간과 휴무는 업체 사정에 따라 달라질 수 있습니다.</p>` : ""}
    <div class="detail-actions">
      <button class="detail-route ${added ? "added" : ""}" data-detail-add="${id}" type="button">${added ? "✓ 코스에 담김" : "+ 코스에 담기"}</button>
      <button data-detail-nearby="${id}" type="button" ${item.lat && item.lon ? "" : "disabled"}>인근 제휴사 추천</button>
      <a href="${mapLink}" target="_blank" rel="noopener">카카오맵에서 보기 ↗</a>
      <a href="${escaped(item.sourceUrl)}" target="_blank" rel="noopener">비짓제주 원문 ↗</a>
    </div>`;
  const detailImage = $("#detailContent").querySelector(".detail-photo img");
  if (detailImage) detailImage.addEventListener("error", () => { detailImage.closest(".detail-photo").hidden = true; });
  $("#detailModal").hidden = false;
  document.body.style.overflow = "hidden";
}
window.openNowdaDetail = openDetail;

function closeDetail() {
  $("#detailModal").hidden = true;
  document.body.style.overflow = "";
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
document.querySelectorAll("[data-search-example]").forEach(button => button.addEventListener("click", () => {
  els.search.value = button.dataset.searchExample;
  state.search = button.dataset.searchExample;
  state.visible = PAGE_SIZE;
  render();
}));
els.location.addEventListener("change", e => { state.location = e.target.value; state.visible = PAGE_SIZE; updateAreas(); render(); });
els.area.addEventListener("change", e => { state.area = e.target.value; state.visible = PAGE_SIZE; render(); });
els.sort.addEventListener("change", e => { state.sort = e.target.value; render(); });
els.loadMore.addEventListener("click", () => { state.visible += PAGE_SIZE; render(); });
els.grid.addEventListener("click", event => {
  const add = event.target.closest("[data-add]");
  const nearby = event.target.closest("[data-nearby]");
  const detail = event.target.closest("[data-detail]");
  if (add) toggleRoute(Number(add.dataset.add));
  if (nearby) startNearby(Number(nearby.dataset.nearby));
  if (detail) openDetail(Number(detail.dataset.detail));
});
$("#detailContent").addEventListener("click", event => {
  const add = event.target.closest("[data-detail-add]");
  const nearby = event.target.closest("[data-detail-nearby]");
  if (add) {
    const id = Number(add.dataset.detailAdd);
    toggleRoute(id);
    openDetail(id);
  }
  if (nearby) {
    const id = Number(nearby.dataset.detailNearby);
    closeDetail();
    startNearby(id);
  }
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
  if (add) {
    const id = Number(add.dataset.nearbyAdd);
    if (!route.includes(id)) {
      route = [...route, id];
      saveRoute();
      render();
    }
    if (nearbySourceId !== null) nearbyHistory.push(nearbySourceId);
    openNearby(id);
  }
});
$("#nearbyBack").addEventListener("click", () => {
  const previousId = nearbyHistory.pop();
  if (previousId !== undefined) openNearby(previousId);
});
$("#courseFab").addEventListener("click", openDrawer);
$("#closeDrawer").addEventListener("click", closeDrawer);
$("#drawerBackdrop").addEventListener("click", closeDrawer);
$("#closeNearby").addEventListener("click", closeNearby);
$("#nearbyBackdrop").addEventListener("click", closeNearby);
$("#closeDetail").addEventListener("click", closeDetail);
$("#detailBackdrop").addEventListener("click", closeDetail);
$("#copyRoute").addEventListener("click", copyRoute);
$("#clearRoute").addEventListener("click", () => { if (route.length && confirm("담아둔 코스를 모두 비울까요?")) { route = []; saveRoute(); render(); } });

function reset() {
  Object.assign(state, { search: "", category: "전체", location: "all", area: "all", sort: "category", visible: PAGE_SIZE });
  els.search.value = ""; els.location.value = "all"; els.sort.value = "category"; updateAreas(); render();
}
$("#resetFilters").addEventListener("click", reset);
$("#emptyReset").addEventListener("click", reset);
document.addEventListener("keydown", e => { if (e.key === "/" && document.activeElement !== els.search) { e.preventDefault(); els.search.focus(); } });
document.addEventListener("keydown", e => { if (e.key === "Escape") { closeDrawer(); closeNearby(); closeDetail(); } });

updateCollectionMeta();
updateAreas();
renderRoute();
render();
