@'
# SGS

Monorepo contendo:
- `backend/` (FastAPI)
- `frontend/` (React)

## Dev rápido

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -U pip -r requirements.txt
uvicorn main:app --reload --port 8001


### requirements.txt (se ainda não tiver)
@'
fastapi==0.111.0
uvicorn[standard]==0.30.0
python-multipart==0.0.9
'@ | Out-File -Encoding utf8 .\backend\requirements.txt
