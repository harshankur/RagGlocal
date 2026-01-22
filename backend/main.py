from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from typing import List
import shutil
import os
import glob
from config import settings
from ingestion import ingest_documents, get_vector_index, setup_llm

app = FastAPI(title="Rag Glocal API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    setup_llm()

@app.get("/health")
async def health():
    return {"status": "ok", "model": settings.ACTIVE_MODEL}

@app.post("/admin/upload")
async def upload_documents(background_tasks: BackgroundTasks, files: List[UploadFile] = File(...)):
    os.makedirs(settings.DOCS_PATH, exist_ok=True)
    saved_files = []
    for file in files:
        file_path = os.path.join(settings.DOCS_PATH, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        saved_files.append(file.filename)
    background_tasks.add_task(ingest_documents, settings.DOCS_PATH)
    return {"message": "Files uploaded successfully. Ingestion started in background.", "files": saved_files}

@app.get("/admin/models")
async def list_models():
    import httpx
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            return resp.json()
        except:
            return {"models": []}

@app.post("/admin/settings")
async def update_settings(model_name: str):
    settings.ACTIVE_MODEL = model_name
    setup_llm()
    return {"message": f"Active model updated to {model_name}"}

@app.post("/admin/reset-index")
async def reset_index():
    from ingestion import clear_index
    return clear_index()

@app.get("/admin/documents")
async def list_documents():
    if not os.path.exists(settings.DOCS_PATH):
        return []
    files = []
    for f in os.listdir(settings.DOCS_PATH):
        if os.path.isfile(os.path.join(settings.DOCS_PATH, f)) and not f.startswith('.'):
            files.append({
                "name": f,
                "size": os.path.getsize(os.path.join(settings.DOCS_PATH, f)),
                "path": f
            })
    return files

@app.get("/documents/{filename}")
async def get_document(filename: str):
    file_path = os.path.join(settings.DOCS_PATH, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)

from pydantic import BaseModel
class ChatRequest(BaseModel):
    query: str
    use_web: bool = False
    use_docs: bool = False

from agent import get_agent

@app.post("/chat")
async def chat(request: ChatRequest):
    print(f"Received chat request: {request.query} (web: {request.use_web}, docs: {request.use_docs})")
    agent = get_agent(
        use_web=request.use_web, 
        use_docs=request.use_docs,
        admin_allow_web=settings.ALLOW_WEB_SEARCH
    )
    
    try:
        response = await agent.achat(request.query)
    except Exception as e:
        print(f"Error during agent call: {str(e)}")
        return {"error": f"Agent error: {str(e)}"}
    
    sources = []
    for tool_output in response.sources:
        raw = tool_output.raw_output
        if tool_output.tool_name == "local_docs":
            if hasattr(raw, 'source_nodes'):
                for node_with_score in raw.source_nodes:
                    meta = node_with_score.node.metadata
                    sources.append({
                        "source": meta.get("file_name", "Unknown Document"),
                        "page": meta.get("page_label"),
                        "content": node_with_score.node.get_content()[:200],
                        "type": "doc",
                        "link": f"http://localhost:8000/documents/{meta.get('file_name')}"
                    })
        elif tool_output.tool_name == "web_search":
            if isinstance(raw, list):
                for res in raw:
                    sources.append({
                        "source": res.get("title"),
                        "link": res.get("link"),
                        "content": res.get("snippet"),
                        "type": "web"
                    })
        elif tool_output.tool_name == "llm":
            sources.append({
                "source": "AI Knowledge",
                "type": "llm"
            })

    unique_sources = []
    seen = set()
    for s in sources:
        key = s.get("link") or (s.get("source") + str(s.get("page", "")))
        if key not in seen:
            unique_sources.append(s)
            seen.add(key)

    return {
        "response": str(response),
        "sources": unique_sources
    }
