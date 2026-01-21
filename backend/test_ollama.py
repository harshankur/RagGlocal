import asyncio
from llama_index.llms.ollama import Ollama
from config import settings

async def test_connection():
    print(f"Testing connection to Ollama at {settings.OLLAMA_BASE_URL}...")
    print(f"Using model: {settings.ACTIVE_MODEL}")
    
    llm = Ollama(model=settings.ACTIVE_MODEL, base_url=settings.OLLAMA_BASE_URL, request_timeout=60.0)
    
    try:
        response = await llm.acomplete("Hi, this is a test. Please respond with 'Ollama is working!'")
        print("\n--- RESPONSE FROM OLLAMA ---")
        print(response)
        print("----------------------------\n")
        print("✅ Connectivity test PASSED.")
    except Exception as e:
        print(f"\n❌ Connectivity test FAILED: {str(e)}")

if __name__ == "__main__":
    asyncio.run(test_connection())
