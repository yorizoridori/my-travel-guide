(function () {
  const details = window.NOWDA_DETAILS || {};
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
  let activeView = "gallery";
  let activeItems = [];
  let courseMap;
  let courseInfoWindow;
  let courseLine;
  let courseMapVisible = false;
  let courseMarkers = [];
  const markerById = new Map();

  const escapeHtml = value => String(value || "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

  function markerImage(category) {
    const color = colors[category] || "#174c3c";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46"><path fill="${color}" stroke="white" stroke-width="2" d="M19 1C9.6 1 2 8.5 2 17.8 2 30.6 19 45 19 45s17-14.4 17-27.2C36 8.5 28.4 1 19 1Z"/><circle cx="19" cy="18" r="6" fill="white"/></svg>`;
    return new kakao.maps.MarkerImage(`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, new kakao.maps.Size(38, 46), { offset: new kakao.maps.Point(19, 45) });
  }

  function numberedMarkerImage(index) {
    const label = index + 1;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46"><path fill="#174c3c" stroke="white" stroke-width="2" d="M19 1C9.6 1 2 8.5 2 17.8 2 30.6 19 45 19 45s17-14.4 17-27.2C36 8.5 28.4 1 19 1Z"/><circle cx="19" cy="18" r="9" fill="#dfe77c"/><text x="19" y="21.5" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="#174c3c">${label}</text></svg>`;
    return new kakao.maps.MarkerImage(`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, new kakao.maps.Size(38, 46), { offset: new kakao.maps.Point(19, 45) });
  }

  function infoContent(item) {
    const added = JSON.parse(localStorage.getItem("nowdaRoute") || "[]").includes(item.id);
    const mapLink = `https://map.kakao.com/link/map/${encodeURIComponent(item.name)},${item.lat},${item.lon}`;
    const address = details[item.id]?.address || item.address;
    return `<div class="map-info"><span class="map-info-category">${escapeHtml(item.category)}</span><h3>${escapeHtml(item.name)}</h3><p class="map-info-address">${escapeHtml(address)}</p><p class="map-info-benefit"><strong>혜택</strong> · ${escapeHtml(item.benefit)}</p><div class="map-info-actions"><a href="${mapLink}" target="_blank" rel="noopener">카카오맵 열기</a><button type="button" onclick="window.toggleNowdaRoute(${item.id});this.textContent='✓ 코스에 담김'">${added ? "✓ 코스에 담김" : "+ 코스에 담기"}</button><button class="map-info-detail" type="button" onclick="window.openNowdaDetail(${item.id})">상세 정보 보기</button><button class="map-info-nearby" type="button" onclick="window.openNowdaNearby(${item.id})">인근 제휴사 추천</button></div></div>`;
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

  function courseInfoContent(item, index) {
    return `<div class="course-map-info"><span>${index + 1}번째 장소 · ${escapeHtml(item.category)}</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.address)}</p><p class="course-map-benefit"><strong>혜택</strong> · ${escapeHtml(item.benefit)}</p><button type="button" onclick="window.toggleNowdaRoute(${item.id})">코스에서 제거</button></div>`;
  }

  function straightDistance(a, b) {
    const rad = value => value * Math.PI / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  function routeDistance(items) {
    return items.slice(1).reduce((total, item, index) => total + straightDistance(items[index], item), 0);
  }

  function clearCourseMap() {
    courseMarkers.forEach(marker => marker.setMap(null));
    courseMarkers = [];
    if (courseLine) courseLine.setMap(null);
    courseLine = null;
    if (courseInfoWindow) courseInfoWindow.close();
  }

  function ensureCourseMap() {
    if (courseMap || !ready) return;
    courseMap = new kakao.maps.Map(document.querySelector("#courseMap"), { center: new kakao.maps.LatLng(33.38, 126.55), level: 9 });
    courseMap.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
    courseInfoWindow = new kakao.maps.InfoWindow({ removable: true });
  }

  function renderCourseMap(items) {
    const allItems = items || [];
    const locatedItems = allItems.filter(item => item.lat && item.lon);
    document.querySelector("#courseMapCount").textContent = allItems.length;
    const distanceLabel = document.querySelector("#courseMapDistance");
    if (locatedItems.length !== allItems.length) distanceLabel.textContent = "일부 좌표 확인 중";
    else if (locatedItems.length < 2) distanceLabel.textContent = "다음 장소를 담아보세요";
    else {
      const total = routeDistance(locatedItems);
      distanceLabel.textContent = total < 1 ? `총 직선거리 ${Math.round(total * 1000)}m` : `총 직선거리 ${total.toFixed(1)}km`;
    }
    if (!courseMapVisible || !ready) return;
    ensureCourseMap();
    clearCourseMap();
    if (!locatedItems.length) return;

    const path = locatedItems.map(item => new kakao.maps.LatLng(item.lat, item.lon));
    courseLine = new kakao.maps.Polyline({ map: courseMap, path, strokeWeight: 3, strokeColor: "#174c3c", strokeOpacity: 0.8, strokeStyle: "solid" });
    courseMarkers = locatedItems.map((item, index) => {
      const marker = new kakao.maps.Marker({ map: courseMap, position: path[index], image: numberedMarkerImage(index), title: `${index + 1}. ${item.name}` });
      kakao.maps.event.addListener(marker, "click", () => {
        courseInfoWindow.setContent(courseInfoContent(item, index));
        courseInfoWindow.open(courseMap, marker);
      });
      return marker;
    });

    setTimeout(() => {
      courseMap.relayout();
      if (path.length === 1) {
        courseMap.setCenter(path[0]);
        courseMap.setLevel(5);
      } else {
        const bounds = new kakao.maps.LatLngBounds();
        path.forEach(position => bounds.extend(position));
        courseMap.setBounds(bounds, 55, 45, 55, 45);
      }
    }, 30);
  }

  function setCourseDrawerView(view) {
    const items = window.getNowdaRouteItems ? window.getNowdaRouteItems() : [];
    const isMap = view === "map" && items.length > 0;
    courseMapVisible = isMap;
    document.querySelector("#courseListView").hidden = isMap;
    document.querySelector("#courseMapView").hidden = !isMap;
    document.querySelector("#courseListViewButton").classList.toggle("active", !isMap);
    document.querySelector("#courseMapViewButton").classList.toggle("active", isMap);
    if (isMap) renderCourseMap(items);
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
        if (completed === missing.length) {
          applyResults(window.getNowdaFilteredData(), false);
          renderCourseMap(window.getNowdaRouteItems ? window.getNowdaRouteItems() : []);
        }
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
    renderCourseMap(window.getNowdaRouteItems ? window.getNowdaRouteItems() : []);
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
    activeView = view;
    const isMap = view === "map";
    document.querySelector("#cardGrid").hidden = isMap;
    document.querySelector("#mapSection").hidden = !isMap;
    if (isMap) document.querySelector("#loadMore").hidden = true;
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
  document.querySelector("#courseListViewButton").addEventListener("click", () => setCourseDrawerView("list"));
  document.querySelector("#courseMapViewButton").addEventListener("click", () => setCourseDrawerView("map"));
  window.addEventListener("nowda:results", event => {
    applyResults(event.detail.items, false);
    if (activeView === "map") document.querySelector("#loadMore").hidden = true;
  });
  window.addEventListener("nowda:routechange", event => {
    if (!event.detail.items.length && courseMapVisible) setCourseDrawerView("list");
    else renderCourseMap(event.detail.items);
  });
  window.addEventListener("nowda:draweropen", event => {
    if (courseMapVisible) renderCourseMap(event.detail.items);
  });
  loadKakao();
  if (window.location.hash === "#map") setView("map");
})();
