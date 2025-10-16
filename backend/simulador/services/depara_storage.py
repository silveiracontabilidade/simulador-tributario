import json
import uuid
from pathlib import Path
from threading import Lock
from typing import Dict, List

from django.conf import settings

_file_lock = Lock()


def _file_path() -> Path:
    path = Path(settings.BALANCETE_DEPARA_FILE)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text("[]", encoding="utf-8")
    return path


def _load_raw() -> List[Dict]:
    path = _file_path()
    try:
        with path.open("r", encoding="utf-8") as handler:
            data = json.load(handler)
            if isinstance(data, list):
                return data
    except json.JSONDecodeError:
        # arquivo corrompido, reseta para evitar quebrar API
        pass
    return []


def _dump_raw(data: List[Dict]) -> None:
    path = _file_path()
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as handler:
        json.dump(data, handler, indent=2, ensure_ascii=False)
    tmp.replace(path)


def list_entries() -> List[Dict]:
    with _file_lock:
        entries = _load_raw()
        changed = False
        for item in entries:
            if not item.get("id"):
                item["id"] = str(uuid.uuid4())
                changed = True
        if changed:
            _dump_raw(entries)
        return entries


def create_entry(payload: Dict) -> Dict:
    with _file_lock:
        entries = _load_raw()
        novo = {**payload}
        novo["id"] = str(uuid.uuid4())
        entries.append(novo)
        _dump_raw(entries)
        return novo


def get_entry(entry_id: str) -> Dict:
    entries = list_entries()
    for item in entries:
        if item.get("id") == entry_id:
            return item
    return {}


def update_entry(entry_id: str, payload: Dict) -> Dict:
    with _file_lock:
        entries = _load_raw()
        updated = None
        for idx, item in enumerate(entries):
            if item.get("id") == entry_id:
                dados = {**item, **payload, "id": entry_id}
                entries[idx] = dados
                updated = dados
                break
        if updated is None:
            return {}
        _dump_raw(entries)
        return updated


def delete_entry(entry_id: str) -> bool:
    with _file_lock:
        entries = _load_raw()
        filtered = [item for item in entries if item.get("id") != entry_id]
        if len(filtered) == len(entries):
            return False
        _dump_raw(filtered)
        return True
