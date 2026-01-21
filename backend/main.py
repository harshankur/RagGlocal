from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import shutil
import os
from config import settings
from ingestion import ingest_documents, get_vector_index, setup_llm

app = FastAPI(title="Rag Glocal API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local dev, '*' is usually fine, but let's be explicit if needed
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
    # Create docs directory if not exists
    os.makedirs(settings.DOCS_PATH, exist_ok=True)
    
    saved_files = []
    for file in files:
        file_path = os.path.join(settings.DOCS_PATH, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        saved_files.append(file.filename)
    
    # Run ingestion in background
    background_tasks.add_task(ingest_documents, settings.DOCS_PATH)
    
    return {"message": "Files uploaded successfully. Ingestion started in background.", "files": saved_files}

@app.get("/admin/models")
async def list_models():
    # In a real scenario, we would query Ollama API
    # For now, return a placeholder or implement the fetch
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
    print(f"Agent initialized: {type(agent)}")
    
    # Since we are using an agent, response structure is slightly different
    try:
        response = await agent.achat(request.query)
        print("Agent response received.")
    except Exception as e:
        print(f"Error during agent call: {str(e)}")
        return {"error": f"Agent error: {str(e)}"}
    
    # Extract sources from the agent's interaction if possible
    # Note: ReActAgent doesn't always provide sources in a structured list easily
    # but we can try to extract from the tools' outputs
    sources = []
    for tool_output in response.sources:
        if tool_output.tool_name == "local_docs":
            # Extract metadata from the query engine response inside the tool output
            # This is a bit complex in LlamaIndex Agent, but let's try a simplified version
            sources.append({
                "source": "Local Documents",
                "content": str(tool_output.raw_output)[:300]
            })
        elif tool_output.tool_name == "web_search":
            sources.append({
                "source": "Web Search",
                "content": str(tool_output.raw_output)[:300]
            })

    return {
        "response": str(response),
        "sources": sources
    }
