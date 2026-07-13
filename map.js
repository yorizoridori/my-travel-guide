(function () {
  const colors = {
    "관광지": "#2878a5",
    "체험/레포츠": "#dc762d",
    "식음료": "#c94d4d",
    "쇼핑/소품샵": "#8461a8"
  };
  let map;
  let clusterer;
  let infoWindow;
  let ready = false;
  let activeItems = [];
  const markerById = new Map();

  const escapeHtml = value => String(value || "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

  function markerImage(category) {
    const color = colors[category] || "#174c3c";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46"><path fill="${color}" stroke="white" stroke-width="2" d="M19 1C9.6 1 2 8.5 2 17.8 2 30.6 19 45 19 45s17-14.4 17-27.2C36 8.5 28.4 1 19 1Z"/><circle cx="19" cy="18" r="6" fill="white"/></svg>`;
    return new kakao.maps.MarkerImage(`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, new kakao.maps.Size(38, 46), { offset: new kakao.maps.Point(19, 45) });
  }

  function infoContent(item) {
    const added = JSON.parse(localStorage.getItem("nowdaRoute") || "[]").includes(item.id);
    const mapLink = `https://map.kakao.com/link/map/${encodeURIComponent(item.name)},${item.lat},${item.lon}`;
    return `<div class="map-info"><span class="map-info-category">${escapeHtml(item.category)}</span><h3>${escapeHtml(item.name)}</h3><p class="map-info-address">${escapeHtml(item.address)}</p><p class="map-info-benefit"><strong>혜택</strong> · ${escapeHtml(item.benefit)}</p><div class="map-info-actions"><a href="${mapLink}" target="_blank" rel="noopener">카카오맵 열기</a><button type="button" onclick="window.toggleNowdaRoute(${item.id});this.textContent='✓ 코스에 담김'">${added ? "✓ 코스에 담김" : "+ 코스에 담기"}</button><button class="map-info-nearby" type="button" onclick="window.openNowdaNearby(${item.id})">인근 제휴사 추천</button></div></div>`;
  }

  function addMarker(item) {
    if (!item.lat || !item.lon || markerById.has(item.id)) return;
    const marker = new kakao.maps.Marker({ position: new kakao.maps.LatLng(item.lat, item.lon), image: markerImage(item.category), title: item.name });
    kakao.maps.event.addListener(marker, "click", function () {
      infoWindow.setContent(infoContent(item));
      infoWindow.open(map, marker);
    });
    markerById.set(item.id, marker);
  }

  function applyResults(items, fit = false) {
    activeItems = items || [];
    if (!ready) return;
    const markers = activeItems.map(item => markerById.get(item.id)).filter(Boolean);
    clusterer.clear();
    clusterer.addMarkers(markers);
    document.querySelector("#mapMarkerCount").textContent = markers.length;
    if (fit && markers.length) {
      const bounds = new kakao.maps.LatLngBounds();
      markers.forEach(marker => bounds.extend(marker.getPosition()));
      map.setBounds(bounds, 45, 45, 45, 45);
    }
  }

  function geocodeMissing() {
    const geocoder = new kakao.maps.services.Geocoder();
    const missing = window.NOWDA_DATA.filter(item => !item.lat || !item.lon);
    let completed = 0;
    if (!missing.length) return;
    missing.forEach(item => {
      geocoder.addressSearch(item.address, function (result, status) {
        if (status === kakao.maps.services.Status.OK && result[0]) {
          item.lat = Number(result[0].y);
          item.lon = Number(result[0].x);
          addMarker(item);
        }
        completed += 1;
        if (completed === missing.length) applyResults(window.getNowdaFilteredData(), false);
      });
    });
  }

  function initMap() {
    map = new kakao.maps.Map(document.querySelector("#kakaoMap"), { center: new kakao.maps.LatLng(33.38, 126.55), level: 9 });
    map.addControl(new kakao.maps.MapTypeControl(), kakao.maps.ControlPosition.TOPRIGHT);
    map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
    infoWindow = new kakao.maps.InfoWindow({ removable: true });
    clusterer = new kakao.maps.MarkerClusterer({ map, averageCenter: true, minLevel: 6, minClusterSize: 2, styles: [{ width: "42px", height: "42px", background: "rgba(23,76,60,.9)", borderRadius: "50%", color: "#fff", textAlign: "center", lineHeight: "42px", fontSize: "11px", fontWeight: "700" }] });
    window.NOWDA_DATA.forEach(addMarker);
    ready = true;
    applyResults(window.getNowdaFilteredData(), false);
    geocodeMissing();
  }

  function showError(message) {
    const error = document.querySelector("#mapError");
    error.textContent = message;
    error.hidden = false;
  }

  function loadKakao() {
    const key = window.KAKAO_MAP_KEY;
    if (!key || key.includes("PASTE_YOUR")) {
      showError("카카오 JavaScript 키가 설정되지 않았습니다. kakao-config.js를 확인해주세요.");
      return;
    }
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&libraries=services,clusterer`;
    script.onload = () => kakao.maps.load(initMap);
    script.onerror = () => showError("카카오 지도를 불러오지 못했습니다. JavaScript 키와 등록 도메인을 확인해주세요.");
    document.head.appendChild(script);
  }

  function setView(view) {
    const isMap = view === "map";
    document.querySelector("#cardGrid").hidden = isMap;
    document.querySelector("#mapSection").hidden = !isMap;
    document.querySelector("#loadMore").hidden = isMap || document.querySelector("#loadMore").hidden;
    document.querySelector("#sortOrder").hidden = isMap;
    document.querySelector("#galleryViewButton").classList.toggle("active", !isMap);
    document.querySelector("#mapViewButton").classList.toggle("active", isMap);
    if (isMap && ready) {
      setTimeout(() => { map.relayout(); applyResults(window.getNowdaFilteredData(), true); }, 30);
    }
    if (!isMap && window.renderNowdaGallery) window.renderNowdaGallery();
  }

  document.querySelector("#galleryViewButton").addEventListener("click", () => { setView("gallery"); window.location.hash = "gallery"; });
  document.querySelector("#mapViewButton").addEventListener("click", () => { setView("map"); window.location.hash = "map"; });
  window.addEventListener("nowda:results", event => applyResults(event.detail.items, false));
  loadKakao();
  if (window.location.hash === "#map") setView("map");
})();
