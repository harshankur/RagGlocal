from llama_index.core.tools import QueryEngineTool, ToolMetadata, FunctionTool
from llama_index.core.agent import ReActAgent
from ingestion import get_vector_index, setup_llm
from web_search import search_web, format_search_results
from config import settings
import httpx

async def check_internet():
    try:
        async with httpx.AsyncClient() as client:
            await client.get("https://www.google.com", timeout=2.0)
            return True
    except:
        return False

class ToollessChat:
    def __init__(self, llm):
        self.llm = llm
        self.sources = [] # Mock sources for compatibility

    async def achat(self, query: str):
        print(f"Executing toolless chat for: {query}")
        response = await self.llm.acomplete(query)
        # Wrap response to match ReActAgent response structure enough for main.py
        class MockResponse:
            def __init__(self, text):
                self.text = text
                self.sources = []
            def __str__(self):
                return self.text
        return MockResponse(str(response))

def get_agent(use_web: bool = False, use_docs: bool = False, admin_allow_web: bool = True):
    setup_llm()
    index = get_vector_index()
    
    tools = []
    
    # 1. Local Documents Tool
    if index and use_docs:
        query_engine = index.as_query_engine(similarity_top_k=3)
        tools.append(
            QueryEngineTool(
                query_engine=query_engine,
                metadata=ToolMetadata(
                    name="local_docs",
                    description="Search through the user's uploaded documents and local knowledge base. Use this for specific private info."
                ),
            )
        )
    
    # 2. Web Search Tool (Conditional)
    async def web_search_tool_func(query: str):
        # Additional checks at runtime
        internet_available = await check_internet()
        if not (use_web and admin_allow_web and internet_available):
            return "Web search is disabled or internet is unavailable."
        
        results = search_web(query)
        return format_search_results(results)

    if admin_allow_web and use_web:
        tools.append(
            FunctionTool.from_defaults(
                fn=web_search_tool_func,
                name="web_search",
                description="Search the internet for real-time information, news, or general knowledge not found in local docs."
            )
        )
    
    if not tools:
        from llama_index.core import Settings
        print("No tools selected or available, using toolless chat.")
        return ToollessChat(llm=Settings.llm)
        
    # Using ReActAgent for reasoning
    from llama_index.core import Settings
    agent = ReActAgent.from_tools(tools, llm=Settings.llm, verbose=True)
    return agent
