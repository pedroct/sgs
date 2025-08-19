# main.py — versão enxuta e correta p/ seu Nginx atual
import json
from typing import List
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="API de Gestão de Seguidores do Instagram",
    version="1.1",
    # use os PADRÕES dos docs:
    # docs:        /docs
    # redoc:       /redoc
    # openapi:     /openapi.json
)

# (opcional) Em produção, como front e back estão na MESMA origem, CORS não é necessário.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

def _extract_usernames_from_data(data) -> set:
    usernames = set()
    def add_from_string_list_data(obj):
        for item in obj.get("string_list_data", []):
            v = item.get("value")
            if isinstance(v, str):
                v = v.strip().lstrip("@").lower()
                if v:
                    usernames.add(v)
    if isinstance(data, list):
        for entry in data:
            if isinstance(entry, dict):
                add_from_string_list_data(entry)
    elif isinstance(data, dict):
        for key in ("relationships_followers", "relationships_following", "followers", "following"):
            if key in data and isinstance(data[key], list):
                for entry in data[key]:
                    if isinstance(entry, dict):
                        add_from_string_list_data(entry)
        if "string_list_data" in data:
            add_from_string_list_data(data)
    return usernames

def _load_json_bytes(raw_bytes: bytes):
    try:
        return json.loads(raw_bytes.decode("utf-8"))
    except UnicodeDecodeError:
        return json.loads(raw_bytes.decode("latin-1"))

def _classify_file(filename: str, data_obj) -> str:
    name = (filename or "").lower()
    if "following" in name:  return "following"
    if "followers" in name:  return "followers"
    if isinstance(data_obj, dict):
        keys = set(data_obj.keys())
        if "relationships_following" in keys or "following" in keys: return "following"
        if "relationships_followers" in keys or "followers" in keys:   return "followers"
    return "unknown"

@app.post("/upload")
async def upload(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="Envie ao menos um arquivo JSON do Instagram.")
    followers_set, following_set = set(), set()
    for f in files:
        raw = await f.read()
        try:
            data = _load_json_bytes(raw)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Arquivo inválido ou não-JSON: {f.filename}")
        klass = _classify_file(f.filename, data)
        usernames = _extract_usernames_from_data(data)
        if klass == "following":
            following_set |= usernames
        elif klass == "followers":
            followers_set |= usernames
    if not following_set:
        raise HTTPException(status_code=400, detail="Não encontrei dados de 'following'. Inclua o following.json.")
    if not followers_set:
        raise HTTPException(status_code=400, detail="Não encontrei dados de 'followers'. Inclua todos os followers_*.json.")
    not_following_back = sorted(following_set - followers_set)
    return {
        "summary": {
            "total_following": len(following_set),
            "total_followers_unicos": len(followers_set),
            "nao_seguem_de_volta": len(not_following_back),
        },
        "not_following_back": not_following_back,
    }
