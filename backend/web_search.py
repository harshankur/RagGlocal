from duckduckgo_search import DDGS
from typing import List, Dict

def search_web(query: str, max_results: int = 5) -> List[Dict]:
    """
    Performs a web search using DuckDuckGo and returns structured results.
    """
    results = []
    try:
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append({
                    "title": r['title'],
                    "link": r['href'],
                    "snippet": r['body']
                })
    except Exception as e:
        print(f"Web search error: {e}")
    return results

def format_search_results(results: List[Dict]) -> str:
    """
    Formats search results into a string for the LLM to consume.
    """
    if not results:
        return "No web results found."
    
    formatted = "Web Search Results:\n\n"
    for i, r in enumerate(results, 1):
        formatted += f"[{i}] {r['title']}\nURL: {r['link']}\nContent: {r['snippet']}\n\n"
    return formatted
