"""
Media Manager

Handles downloading, optimizing, and managing recipe media assets.
"""

import hashlib
import logging
import os
import ssl
import urllib.request
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Default directories
DEFAULT_MEDIA_DIR = Path("data/media/recipes")


class MediaError(Exception):
    """Error during media operations."""
    pass


class MediaManager:
    """
    Manages recipe media assets.
    
    Responsibilities:
    - Download images from Jamie Oliver CDN
    - Organize files by recipe
    - Generate optimized versions (optional)
    - Track local paths for upload to our CDN
    """
    
    def __init__(
        self, 
        media_dir: Optional[Path] = None,
        headers: Optional[dict] = None
    ):
        """
        Initialize media manager.
        
        Args:
            media_dir: Base directory for storing media files
            headers: HTTP headers for download requests
        """
        self.media_dir = media_dir or DEFAULT_MEDIA_DIR
        self.headers = headers or {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }
        
        # Create SSL context
        try:
            self._ssl_context = ssl.create_default_context()
            self._ssl_context.check_hostname = False
            self._ssl_context.verify_mode = ssl.CERT_NONE
        except Exception:
            self._ssl_context = None
        
        # Ensure media directory exists
        self.media_dir.mkdir(parents=True, exist_ok=True)
    
    def download_recipe_images(
        self, 
        recipe_id: str, 
        image_urls: list[str],
        max_images: int = 4
    ) -> list[str]:
        """
        Download images for a recipe.
        
        Args:
            recipe_id: Recipe identifier (slug)
            image_urls: List of image URLs to download
            max_images: Maximum number of images to download
            
        Returns:
            List of local file paths for downloaded images
        """
        if not image_urls:
            logger.warning(f"No images provided for recipe: {recipe_id}")
            return []
        
        # Create recipe-specific directory
        recipe_dir = self.media_dir / recipe_id
        recipe_dir.mkdir(parents=True, exist_ok=True)
        
        downloaded_paths = []
        
        for i, url in enumerate(image_urls[:max_images]):
            try:
                local_path = self._download_image(url, recipe_dir, i)
                if local_path:
                    downloaded_paths.append(str(local_path))
                    logger.info(f"Downloaded image {i + 1}/{len(image_urls)}: {local_path.name}")
            except Exception as e:
                logger.error(f"Failed to download image {url}: {e}")
                continue
        
        return downloaded_paths
    
    def _download_image(
        self, 
        url: str, 
        target_dir: Path, 
        index: int
    ) -> Optional[Path]:
        """
        Download a single image.
        
        Args:
            url: Image URL
            target_dir: Directory to save image
            index: Image index for filename
            
        Returns:
            Path to downloaded file, or None if failed
        """
        if not url:
            return None
        
        # Determine file extension from URL
        parsed = urlparse(url)
        path_ext = os.path.splitext(parsed.path)[1].lower()
        
        # Default to .jpg if no extension or unrecognized
        if path_ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
            # Check query params for format
            if "fm=webp" in url:
                path_ext = ".webp"
            elif "fm=png" in url:
                path_ext = ".png"
            else:
                path_ext = ".jpg"
        
        # Generate filename
        filename = f"image_{index:02d}{path_ext}"
        target_path = target_dir / filename
        
        # Skip if already exists
        if target_path.exists():
            logger.debug(f"Image already exists: {target_path}")
            return target_path
        
        try:
            # Download
            request = urllib.request.Request(url, headers=self.headers)
            response = urllib.request.urlopen(
                request, 
                context=self._ssl_context, 
                timeout=30
            )
            
            # Save to file
            with open(target_path, "wb") as f:
                f.write(response.read())
            
            return target_path
            
        except urllib.error.HTTPError as e:
            logger.error(f"HTTP error downloading {url}: {e.code}")
            return None
        except Exception as e:
            logger.error(f"Error downloading {url}: {e}")
            return None
    
    def get_recipe_images(self, recipe_id: str) -> list[str]:
        """
        Get paths to all downloaded images for a recipe.
        
        Args:
            recipe_id: Recipe identifier
            
        Returns:
            List of local file paths
        """
        recipe_dir = self.media_dir / recipe_id
        if not recipe_dir.exists():
            return []
        
        image_extensions = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
        return sorted([
            str(f) for f in recipe_dir.iterdir()
            if f.suffix.lower() in image_extensions
        ])
    
    def delete_recipe_images(self, recipe_id: str) -> int:
        """
        Delete all downloaded images for a recipe.
        
        Args:
            recipe_id: Recipe identifier
            
        Returns:
            Number of files deleted
        """
        recipe_dir = self.media_dir / recipe_id
        if not recipe_dir.exists():
            return 0
        
        count = 0
        for f in recipe_dir.iterdir():
            try:
                f.unlink()
                count += 1
            except Exception as e:
                logger.error(f"Failed to delete {f}: {e}")
        
        # Remove directory if empty
        try:
            recipe_dir.rmdir()
        except OSError:
            pass  # Directory not empty
        
        return count
    
    def get_best_image_url(self, image_urls: list[str], target_size: int = 1200) -> Optional[str]:
        """
        Get the best image URL for a target size.
        
        Jamie Oliver provides multiple sizes (600, 1200, 1280). 
        This selects the closest match to the target.
        
        Args:
            image_urls: List of image URLs
            target_size: Desired image width/height
            
        Returns:
            Best matching URL, or None if no URLs provided
        """
        if not image_urls:
            return None
        
        # Parse size from URLs (Jamie uses w= and h= params)
        sized_urls = []
        for url in image_urls:
            size = self._extract_size_from_url(url)
            sized_urls.append((url, size))
        
        # Sort by distance from target size
        sized_urls.sort(key=lambda x: abs((x[1] or 0) - target_size))
        
        # Return closest match, preferring larger images
        for url, size in sized_urls:
            if size and size >= target_size:
                return url
        
        # Fallback to largest available
        sized_urls.sort(key=lambda x: x[1] or 0, reverse=True)
        return sized_urls[0][0] if sized_urls else None
    
    def _extract_size_from_url(self, url: str) -> Optional[int]:
        """Extract image size from URL parameters."""
        import re
        
        # Look for w= or h= parameters
        match = re.search(r"[?&]w=(\d+)", url)
        if match:
            return int(match.group(1))
        
        match = re.search(r"[?&]h=(\d+)", url)
        if match:
            return int(match.group(1))
        
        # Look for size in path (e.g., 600x600)
        match = re.search(r"/(\d{3,4})x(\d{3,4})/", url)
        if match:
            return max(int(match.group(1)), int(match.group(2)))
        
        return None
    
    def generate_hash(self, url: str) -> str:
        """Generate a short hash from URL for deduplication."""
        return hashlib.md5(url.encode()).hexdigest()[:12]


# Singleton for convenience
_manager: Optional[MediaManager] = None


def get_media_manager() -> MediaManager:
    """Get the singleton media manager instance."""
    global _manager
    if _manager is None:
        _manager = MediaManager()
    return _manager


def download_recipe_images(recipe_id: str, image_urls: list[str]) -> list[str]:
    """
    Convenience function to download recipe images.
    
    Args:
        recipe_id: Recipe identifier
        image_urls: List of image URLs
        
    Returns:
        List of local file paths
    """
    return get_media_manager().download_recipe_images(recipe_id, image_urls)
