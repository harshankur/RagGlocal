import os
from llama_index.core import (
    VectorStoreIndex, 
    SimpleDirectoryReader, 
    StorageContext,
    Settings as LlamaIndexSettings
)
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.embeddings.ollama import OllamaEmbedding
from llama_index.llms.ollama import Ollama
import chromadb
from config import settings

def setup_llm():
    LlamaIndexSettings.llm = Ollama(
        model=settings.ACTIVE_MODEL, 
        base_url=settings.OLLAMA_BASE_URL,
        request_timeout=120.0
    )
    LlamaIndexSettings.embed_model = OllamaEmbedding(
        model_name=settings.EMBED_MODEL,
        base_url=settings.OLLAMA_BASE_URL
    )

def get_vector_index():
    setup_llm()
    db = chromadb.PersistentClient(path=settings.CHROMA_DB_PATH)
    chroma_collection = db.get_or_create_collection("rag_collection")
    vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)
    
    # Check if index already exists
    if chroma_collection.count() > 0:
        return VectorStoreIndex.from_vector_store(
            vector_store, storage_context=storage_context
        )
    return None

def clear_index():
    import shutil
    if os.path.exists(settings.CHROMA_DB_PATH):
        shutil.rmtree(settings.CHROMA_DB_PATH)
    os.makedirs(settings.CHROMA_DB_PATH, exist_ok=True)
    return {"message": "Index cleared successfully."}

def remove_document(filename: str):
    """
    Removes a document from the filesystem and triggers a re-index.
    """
    file_path = os.path.join(settings.DOCS_PATH, filename)
    print(f"Attempting to remove document: {file_path}")
    
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
            print(f"File {filename} deleted from disk.")
        except Exception as e:
            print(f"Error deleting file {filename}: {e}")
            return {"error": str(e)}
    else:
        print(f"File {file_path} not found on disk.")
    
    print("Clearing index and re-ingesting documents...")
    clear_index()
    if os.path.exists(settings.DOCS_PATH) and os.listdir(settings.DOCS_PATH):
        ingest_documents(settings.DOCS_PATH)
        print("Re-ingestion complete.")
    else:
        print("No documents left to ingest.")
    
    return {"message": f"Document {filename} removed and index updated."}

def ingest_documents(directory_path: str):
    setup_llm()
    
    # SimpleDirectoryReader naturally extracts page numbers from PDFs as metadata
    reader = SimpleDirectoryReader(
        input_dir=directory_path,
        recursive=True
    )
    documents = reader.load_data()
    
    db = chromadb.PersistentClient(path=settings.CHROMA_DB_PATH)
    chroma_collection = db.get_or_create_collection("rag_collection")
    vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)
    
    index = VectorStoreIndex.from_documents(
        documents, storage_context=storage_context, show_progress=True
    )
    return index
