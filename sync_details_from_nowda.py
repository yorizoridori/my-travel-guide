"""비짓제주 나우다 공식 API 원문을 details.js 구조로 변환한다."""

from __future__ import annotations

import importlib.util
import json
import re
from pathlib import Path


GALLERY_DIR = Path(__file__).resolve().parent
WORKSPACE_DIR = GALLERY_DIR.parent
NOWDA_SYNC = WORKSPACE_DIR / ".claude" / "skills" / "nowda-notion" / "sync.py"
CHECKED_AT = "2026-07-14"
TIME_RE = re.compile(r"\d{1,2}:\d{2}\s*(?:~|-|–)\s*\d{1,2}:\d{2}")


def load_nowda_module():
    spec = importlib.util.spec_from_file_location("nowda_sync", NOWDA_SYNC)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def load_js(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    return json.loads(text.split("=", 1)[1].strip().removesuffix(";"))


def load_existing_details(path: Path) -> dict[int, dict]:
    text = path.read_text(encoding="utf-8")
    body = text.split("=", 1)[1].strip().removesuffix(";")
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        body = re.sub(r"([,{]\s*)([A-Za-z_][A-Za-z0-9_]*|\d+)\s*:", r'\1"\2":', body)
        parsed = json.loads(body)
    return {int(key): value for key, value in parsed.items()}


def normalize(value: str) -> str:
    value = value.replace("\u00a0", " ").replace(" ", " ")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{2,}", "\n", value)
    value = re.sub(r"(?<=\d);(?=\d{2})", ":", value)
    return value.strip()


def find_line(text: str, labels: tuple[str, ...]) -> str:
    for line in text.splitlines():
        clean = line.strip(" -")
        if any(clean.startswith(label) for label in labels):
            return clean.split(":", 1)[1].strip() if ":" in clean else ""
    return ""


def phone_from(place: dict, text: str) -> str:
    phone = (place.get("hp") or "").strip()
    if not phone:
        phone = find_line(text, ("문의전화", "전화번호", "문의"))
    if not re.search(r"\d{2,4}[- )]\d{3,4}", phone):
        section = re.search(r"문의전화\s*:?\s*(.*?)(?:\n(?:운영|영업|휴무|유의)|$)", text, re.S)
        if section:
            found = re.findall(r"(?:0\d{1,2}|1\d{3})[- )]\d{3,4}(?:[-~]\d{2,4})?", section.group(1))
            if found:
                return " / ".join(found)
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 8 and digits.startswith("1"):
        return f"{digits[:4]}-{digits[4:]}"
    if len(digits) == 10:
        return f"{digits[:3]}-{digits[3:6]}-{digits[6:]}"
    if len(digits) == 11:
        return f"{digits[:3]}-{digits[3:7]}-{digits[7:]}"
    return phone or "정보 확인 필요"


def intro_from(text: str, name: str, category: str) -> tuple[str, str]:
    intro = text.split("[나우다(관광증) 이용 안내]", 1)[0].strip()
    intro = re.sub(r"\s+", " ", intro)
    if intro:
        summary = intro if len(intro) <= 95 else intro[:92].rstrip() + "…"
        return summary, intro

    caution = ""
    match = re.search(r"(?:유의사항|이용안내)\s*\n?(.*)$", text, re.S)
    if match:
        caution = re.sub(r"\s+", " ", match.group(1)).strip()
        caution = caution[:350]
    summary = f"비짓제주 나우다에 등록된 {category} 제휴사입니다."
    description = f"{name}의 공식 나우다 혜택과 이용 정보를 확인할 수 있습니다."
    if caution:
        description += f" 이용 시 참고사항: {caution}"
    return summary, description


def hours_from(text: str) -> tuple[list[dict[str, str]], str]:
    lines = [line.strip(" -") for line in text.splitlines() if line.strip(" -")]
    rows: list[dict[str, str]] = []
    for line in lines:
        if not TIME_RE.search(line):
            continue
        if not any(keyword in line for keyword in ("운영", "영업", "평일", "주말", "월", "화", "수", "목", "금", "토", "일", "하절기", "동절기", "간절기", "공연시간", "입장")):
            continue
        times = " / ".join(TIME_RE.findall(line))
        label = TIME_RE.split(line, maxsplit=1)[0].strip(" :-")
        label = re.sub(r"^(운영시간|영업시간)\s*", "", label).strip()
        if not label:
            label = "운영일"
        row = {"days": label[:45], "hours": times}
        if row not in rows:
            rows.append(row)

    if not rows:
        block = re.search(r"(?:운영시간|영업시간|공연시간)\s*:?\s*([^\n]+)", text)
        if block and TIME_RE.search(block.group(1)):
            rows.append({"days": "운영일", "hours": " / ".join(TIME_RE.findall(block.group(1)))})

    if not rows:
        special = re.search(r"공연시간\s*:?\s*([^\n]+)", text)
        if special and re.search(r"\d{1,2}:\d{2}", special.group(1)):
            rows.append({"days": "공연일", "hours": special.group(1).strip()})
    if not rows:
        special = re.search(r"운영시간\s*:?\s*(출항[^\n]+)", text)
        if special:
            rows.append({"days": "운영일", "hours": special.group(1).strip()})
    if not rows and any(keyword in text for keyword in ("사전 예약", "예약 후 이용", "전화 예약 필수")):
        rows.append({"days": "예약제", "hours": "이용 전 사전 문의"})

    notes = []
    for line in lines:
        if any(keyword in line for keyword in ("휴무", "입장마감", "매표마감", "주문 마감", "라스트오더", "예약 필수")):
            if line not in notes:
                notes.append(line)
    note = " · ".join(notes[:5]) or "업체 사정에 따라 변경될 수 있으므로 방문 전 공식 안내를 확인하세요."
    return rows, note


def main() -> None:
    nowda = load_nowda_module()
    raw_places = nowda.fetch_places()
    site_data = load_js(GALLERY_DIR / "data.js")
    images = load_js(GALLERY_DIR / "images.js")
    existing = load_existing_details(GALLERY_DIR / "details.js")

    products: dict[str, tuple[dict, dict]] = {}
    for place in raw_places:
        for product in place.get("products") or []:
            code = product.get("code")
            if code:
                products[code] = (place, product)

    details: dict[int, dict] = {}
    missing = []
    for item in site_data:
        pair = products.get(item["code"])
        if not pair:
            missing.append({"id": item["id"], "name": item["name"], "code": item["code"]})
            continue
        place, product = pair
        raw_notice = product.get("notice") or place.get("notice") or ""
        text = normalize(nowda.strip_tags(raw_notice))
        summary, description = intro_from(text, item["name"], item["category"])
        weekly_hours, hours_note = hours_from(text)
        if "업체 폐업" in text or "영업종료" in text or "영업 종료" in text:
            weekly_hours = [{"days": "현재", "hours": "폐업으로 이용 불가"}]
            hours_note = "비짓제주 나우다 공식 안내에 폐업으로 표시되어 있습니다."
        elif "임시 휴업" in text:
            hours_note = f"비짓제주 나우다 공식 안내: 임시 휴업 · {hours_note}"
        address = (place.get("address") or item["address"]).strip()
        image = images.get(str(item["id"]), {})
        details[item["id"]] = {
            **image,
            "summary": summary,
            "description": description,
            "address": address,
            "weeklyHours": weekly_hours,
            "hoursNote": hours_note,
            "phone": phone_from(place, text),
            "checkedAt": CHECKED_AT,
            "infoSourceLabel": "비짓제주 나우다 공식 API",
            "infoSourceUrl": item["sourceUrl"],
        }

    fallback_details = {
        115: {
            **images.get("115", {}),
            "summary": "녹차밭과 카페 시설 옆에서 카트레이싱을 체험할 수 있는 레포츠 시설입니다.",
            "description": "오늘은녹차한잔의 녹차밭·카페·족욕 시설과 함께 이용할 수 있는 야외 카트 체험장입니다. 야외 체험 특성상 비나 강풍 등 기상 상황에 따라 운행이 중단될 수 있습니다.",
            "address": "제주특별자치도 서귀포시 표선면 중산간동로 4772",
            "weeklyHours": [{"days": "월–일", "hours": "09:00–18:00"}],
            "hoursNote": "라스트오더 17:30 안내. 카트는 기상 상황에 따라 운영이 중단될 수 있으므로 방문 전 확인하세요.",
            "phone": "064-787-6888",
            "checkedAt": CHECKED_AT,
            "infoSourceLabel": "제주 열린관광 페스타·관광시설 이용안내",
            "infoSourceUrl": "https://www2.jejuforall.com/",
        },
        187: {
            **images.get("187", {}),
            "summary": "가마솥 고사리 닭개장과 닭곰탕, 솥뚜껑 닭볶음탕을 선보이는 함덕 음식점입니다.",
            "description": "부산 가덕도에서 영업한 뒤 제주 함덕으로 이전한 닭요리 전문점입니다. 가마솥에 끓인 고사리 닭개장은 하루 80그릇 한정으로 안내됩니다.",
            "address": "제주특별자치도 제주시 조천읍 조함해안로 610-6 1층",
            "weeklyHours": [
                {"days": "목–화", "hours": "06:00–21:00"},
                {"days": "수", "hours": "정기휴무"},
            ],
            "hoursNote": "재료 소진과 임시휴무 여부는 방문 전 확인하세요.",
            "phone": "010-3909-5598",
            "checkedAt": CHECKED_AT,
            "infoSourceLabel": "비짓제주 공식 상세정보",
            "infoSourceUrl": "https://www.visitjeju.net/kr/detail/view?contentsid=CNTS_300000000014428",
        },
    }
    details.update(fallback_details)
    missing = [item for item in missing if item["id"] not in fallback_details]

    # 직접 교차검증한 샘플은 자동 추출값보다 우선한다.
    preserve_keys = ("imageUrl", "imageAlt", "imageSourceLabel", "imageSourceUrl", "summary", "description")
    for item_id, detail in existing.items():
        if item_id in details:
            details[item_id].update({key: detail[key] for key in preserve_keys if key in detail})

    output = {item_id: details[item_id] for item_id in sorted(details)}
    (GALLERY_DIR / "details.js").write_text(
        "window.NOWDA_DETAILS = " + json.dumps(output, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    report = {
        "partners": len(site_data),
        "details": len(output),
        "with_hours": sum(bool(value.get("weeklyHours")) for value in output.values()),
        "with_phone": sum(value.get("phone") != "정보 확인 필요" for value in output.values()),
        "missing": missing,
    }
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
