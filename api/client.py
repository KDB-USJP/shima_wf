"""
Shima API Client
Handles communication with shima.wf backend for authentication and island sync.
"""

import json
import requests
from pathlib import Path
from typing import Optional, List, Dict, Any

# Default API base URL (can be overridden for development)
API_BASE_URL = "https://api.shima.wf/v1"


class IslandMeta:
    """Metadata for an island."""
    def __init__(self, data: dict):
        self.id: str = data.get("id", "")
        self.name: str = data.get("name", "")
        self.version: str = data.get("version", "1.0.0")
        self.tier: str = data.get("tier", "free")
        self.category: List[str] = data.get("category", [])
        self.dependencies: Dict[str, Any] = data.get("dependencies", {})
        self.download_url: Optional[str] = data.get("download_url")


class ShimaClient:
    """Client for shima.wf API."""
    
    def __init__(self, base_url: str = API_BASE_URL):
        self.base_url = base_url
        self.api_key: Optional[str] = None
        self.session = requests.Session()
    
    def set_api_key(self, key: str):
        """Set the API key for authenticated requests."""
        self.api_key = key
        self.session.headers["Authorization"] = f"Bearer {key}"
    
    def authenticate(self, key: str) -> bool:
        """
        Validate a Gumroad license key with the server.
        Returns True if valid, False otherwise.
        """
        try:
            response = self.session.post(
                f"{self.base_url}/auth/validate",
                json={"key": key},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("valid"):
                    self.set_api_key(key)
                    return True
            return False
        except requests.RequestException as e:
            print(f"[Shima] Authentication error: {e}")
            return False
    
    def get_islands(self) -> List[IslandMeta]:
        """
        Fetch the catalog of available islands for the authenticated user.
        """
        try:
            response = self.session.get(
                f"{self.base_url}/islands",
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                return [IslandMeta(item) for item in data.get("islands", [])]
            return []
        except requests.RequestException as e:
            print(f"[Shima] Failed to fetch islands: {e}")
            return []
    
    def download_island(self, island_id: str, cache_dir: Path) -> Optional[Path]:
        """
        Download an island JSON to the local cache.
        Returns the path to the downloaded file, or None on failure.
        """
        try:
            response = self.session.get(
                f"{self.base_url}/islands/{island_id}/download",
                timeout=30
            )
            if response.status_code == 200:
                data = response.json()
                filename = f"{island_id}.json"
                filepath = cache_dir / filename
                
                with open(filepath, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2)
                
                return filepath
            return None
        except requests.RequestException as e:
            print(f"[Shima] Failed to download island {island_id}: {e}")
            return None
    
    def get_dependencies(self, island_id: str) -> Dict[str, Any]:
        """
        Get dependency information for an island.
        Returns dict with 'nodes' and 'models' lists.
        """
        try:
            response = self.session.get(
                f"{self.base_url}/islands/{island_id}/dependencies",
                timeout=10
            )
            if response.status_code == 200:
                return response.json()
            return {"nodes": [], "models": []}
        except requests.RequestException as e:
            print(f"[Shima] Failed to get dependencies for {island_id}: {e}")
            return {"nodes": [], "models": []}


# Singleton instance
_client: Optional[ShimaClient] = None


def get_client() -> ShimaClient:
    """Get the global ShimaClient instance."""
    global _client
    if _client is None:
        _client = ShimaClient()
    return _client
