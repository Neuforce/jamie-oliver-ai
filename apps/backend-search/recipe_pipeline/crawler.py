"""
Jamie Oliver Recipe Crawler

Fetches recipe pages from jamieoliver.com and extracts schema.org/Recipe JSON-LD data.
"""

import json
import logging
import re
import ssl
import time
import urllib.request
from typing import Optional
from urllib.parse import urljoin, urlparse

from .models import ImageInfo, NutritionInfo, SchemaOrgRecipe

logger = logging.getLogger(__name__)

# Default headers to mimic a browser
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# Rate limiting
REQUEST_DELAY = 1.0  # seconds between requests


class CrawlerError(Exception):
    """Base exception for crawler errors."""
    pass


class RecipeNotFoundError(CrawlerError):
    """Recipe data not found on page."""
    pass


class JamieOliverCrawler:
    """
    Crawler for jamieoliver.com recipes.
    
    Extracts schema.org/Recipe JSON-LD structured data from recipe pages.
    """
    
    BASE_URL = "https://www.jamieoliver.com"
    RECIPES_PATH = "/recipes/"
    
    def __init__(self, delay: float = REQUEST_DELAY):
        """
        Initialize crawler.
        
        Args:
            delay: Seconds to wait between requests (rate limiting)
        """
        self.delay = delay
        self._last_request_time = 0.0
        
        # Create SSL context that doesn't verify certificates (for development)
        # This handles environments where ssl module may vary
        try:
            self._ssl_context = ssl.create_default_context()
            self._ssl_context.check_hostname = False
            self._ssl_context.verify_mode = ssl.CERT_NONE
        except Exception:
            self._ssl_context = None
    
    def fetch_recipe(self, url: str) -> SchemaOrgRecipe:
        """
        Fetch and parse a recipe from a URL.
        
        Args:
            url: Full URL to a Jamie Oliver recipe page
            
        Returns:
            SchemaOrgRecipe object with extracted data
            
        Raises:
            CrawlerError: If fetch fails
            RecipeNotFoundError: If no recipe data found on page
        """
        logger.info(f"Fetching recipe from: {url}")
        
        # Validate URL
        if not self._is_valid_recipe_url(url):
            raise CrawlerError(f"Invalid recipe URL: {url}")
        
        # Rate limiting
        self._wait_for_rate_limit()
        
        # Fetch page
        html = self._fetch_page(url)
        
        # Extract JSON-LD
        json_ld = self._extract_json_ld(html)
        
        if not json_ld:
            raise RecipeNotFoundError(f"No schema.org/Recipe found at: {url}")
        
        # Parse into model
        recipe = self._parse_json_ld(json_ld, url)
        
        logger.info(f"Successfully extracted recipe: {recipe.name}")
        return recipe
    
    def fetch_recipe_urls_from_sitemap(self, limit: Optional[int] = None) -> list[str]:
        """
        Fetch recipe URLs from the sitemap.
        
        Args:
            limit: Maximum number of URLs to return
            
        Returns:
            List of recipe URLs
        """
        sitemap_url = f"{self.BASE_URL}/sitemap.xml"
        logger.info(f"Fetching sitemap from: {sitemap_url}")
        
        try:
            self._wait_for_rate_limit()
            html = self._fetch_page(sitemap_url)
            
            # Extract recipe URLs from sitemap
            pattern = r'<loc>(https://www\.jamieoliver\.com/recipes/[^<]+)</loc>'
            urls = re.findall(pattern, html)
            
            # Filter to only recipe detail pages (not category pages)
            recipe_urls = [
                url for url in urls 
                if self._is_recipe_detail_url(url)
            ]
            
            if limit:
                recipe_urls = recipe_urls[:limit]
            
            logger.info(f"Found {len(recipe_urls)} recipe URLs")
            return recipe_urls
            
        except Exception as e:
            logger.error(f"Failed to fetch sitemap: {e}")
            return []
    
    def fetch_recipe_urls_from_category(self, category: str, limit: Optional[int] = None) -> list[str]:
        """
        Fetch recipe URLs from a category page.
        
        Args:
            category: Category slug (e.g., "vegetarian", "chicken", "pasta")
            limit: Maximum number of URLs to return
            
        Returns:
            List of recipe URLs
        """
        # Jamie Oliver site uses /recipes/{category}/ format
        category_url = f"{self.BASE_URL}/recipes/{category}/"
        logger.info(f"Fetching category page: {category_url}")
        
        try:
            self._wait_for_rate_limit()
            html = self._fetch_page(category_url)
            
            # Extract recipe URLs from category page
            pattern = rf'href="(/recipes/[^/]+/[^/"]+/)"'
            paths = re.findall(pattern, html)
            
            # Convert to full URLs and dedupe
            urls = list(set(f"{self.BASE_URL}{path}" for path in paths))
            
            if limit:
                urls = urls[:limit]
            
            logger.info(f"Found {len(urls)} recipe URLs in category '{category}'")
            return urls
            
        except Exception as e:
            logger.error(f"Failed to fetch category page: {e}")
            return []
    
    def _is_valid_recipe_url(self, url: str) -> bool:
        """Check if URL is a valid Jamie Oliver recipe URL."""
        parsed = urlparse(url)
        return (
            parsed.netloc in ("www.jamieoliver.com", "jamieoliver.com") and
            parsed.path.startswith("/recipes/")
        )
    
    def _is_recipe_detail_url(self, url: str) -> bool:
        """Check if URL is a recipe detail page (not category)."""
        parsed = urlparse(url)
        path_parts = [p for p in parsed.path.split("/") if p]
        # Recipe detail URLs have format: /recipes/{category}/{recipe-name}/
        return len(path_parts) >= 3 and path_parts[0] == "recipes"
    
    def _wait_for_rate_limit(self):
        """Wait if needed to respect rate limiting."""
        now = time.time()
        elapsed = now - self._last_request_time
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self._last_request_time = time.time()
    
    def _fetch_page(self, url: str) -> str:
        """
        Fetch a page and return its HTML content.
        
        Args:
            url: URL to fetch
            
        Returns:
            HTML content as string
            
        Raises:
            CrawlerError: If fetch fails
        """
        try:
            request = urllib.request.Request(url, headers=DEFAULT_HEADERS)
            response = urllib.request.urlopen(request, context=self._ssl_context, timeout=30)
            return response.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            raise CrawlerError(f"HTTP error {e.code} fetching {url}: {e.reason}")
        except urllib.error.URLError as e:
            raise CrawlerError(f"URL error fetching {url}: {e.reason}")
        except Exception as e:
            raise CrawlerError(f"Error fetching {url}: {e}")
    
    def _extract_json_ld(self, html: str) -> Optional[dict]:
        """
        Extract schema.org/Recipe JSON-LD from HTML.
        
        Args:
            html: HTML content
            
        Returns:
            Recipe JSON-LD dict if found, None otherwise
        """
        # Find all JSON-LD scripts
        pattern = r'<script type="application/ld\+json">(.*?)</script>'
        matches = re.findall(pattern, html, re.DOTALL)
        
        for match in matches:
            try:
                data = json.loads(match)
                
                # Direct Recipe type
                if isinstance(data, dict) and data.get("@type") == "Recipe":
                    return data
                
                # Array of items (search for Recipe)
                if isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict) and item.get("@type") == "Recipe":
                            return item
                
                # @graph structure
                if isinstance(data, dict) and "@graph" in data:
                    for item in data["@graph"]:
                        if isinstance(item, dict) and item.get("@type") == "Recipe":
                            return item
                            
            except json.JSONDecodeError:
                continue
        
        return None
    
    def _parse_json_ld(self, data: dict, url: str) -> SchemaOrgRecipe:
        """
        Parse JSON-LD data into SchemaOrgRecipe model.
        
        Args:
            data: JSON-LD dictionary
            url: Source URL
            
        Returns:
            SchemaOrgRecipe object
        """
        # Extract images
        images = []
        raw_images = data.get("image", [])
        if isinstance(raw_images, str):
            raw_images = [{"url": raw_images}]
        elif isinstance(raw_images, dict):
            raw_images = [raw_images]
            
        for img in raw_images:
            if isinstance(img, str):
                images.append(ImageInfo(url=img))
            elif isinstance(img, dict):
                images.append(ImageInfo(
                    url=img.get("url", ""),
                    width=img.get("width"),
                    height=img.get("height")
                ))
        
        # Extract instructions
        instructions = []
        raw_instructions = data.get("recipeInstructions", [])
        for inst in raw_instructions:
            if isinstance(inst, str):
                instructions.append(inst)
            elif isinstance(inst, dict):
                text = inst.get("text", "")
                if text:
                    instructions.append(text)
        
        # Extract nutrition
        nutrition = None
        raw_nutrition = data.get("nutrition")
        if raw_nutrition:
            nutrition = NutritionInfo(
                calories=raw_nutrition.get("calories"),
                carbohydrates=raw_nutrition.get("carbohydrateContent"),
                fat=raw_nutrition.get("fatContent"),
                fiber=raw_nutrition.get("fiberContent"),
                protein=raw_nutrition.get("proteinContent"),
                sodium=raw_nutrition.get("sodiumContent"),
                saturated_fat=raw_nutrition.get("saturatedFatContent"),
                sugar=raw_nutrition.get("sugarContent")
            )
        
        # Extract diet types
        diet_types = []
        raw_diets = data.get("suitableForDiet", [])
        if isinstance(raw_diets, str):
            raw_diets = [raw_diets]
        for diet in raw_diets:
            # Extract diet name from schema.org URL
            # e.g., "https://schema.org/VegetarianDiet" -> "vegetarian"
            if "VegetarianDiet" in diet:
                diet_types.append("vegetarian")
            elif "VeganDiet" in diet:
                diet_types.append("vegan")
            elif "GlutenFreeDiet" in diet:
                diet_types.append("gluten-free")
            elif "LowLactoseDiet" in diet:
                diet_types.append("low-lactose")
        
        # Extract author
        author = None
        raw_author = data.get("author")
        if isinstance(raw_author, dict):
            author = raw_author.get("name")
        elif isinstance(raw_author, str):
            author = raw_author
        
        # Extract rating
        rating_value = None
        rating_count = None
        raw_rating = data.get("aggregateRating")
        if raw_rating:
            rating_value = raw_rating.get("ratingValue")
            rating_count = raw_rating.get("ratingCount")
        
        return SchemaOrgRecipe(
            name=data.get("name", "Unknown Recipe"),
            url=url,
            description=data.get("description"),
            recipe_yield=data.get("recipeYield"),
            total_time=data.get("totalTime"),
            cook_time=data.get("cookTime"),
            prep_time=data.get("prepTime"),
            cuisine=data.get("recipeCuisine"),
            category=data.get("recipeCategory"),
            keywords=data.get("keywords"),
            author=author,
            date_published=data.get("datePublished"),
            ingredients=data.get("recipeIngredient", []),
            instructions=instructions,
            images=images,
            diet_types=diet_types,
            nutrition=nutrition,
            rating_value=rating_value,
            rating_count=rating_count
        )


# Convenience function
def fetch_recipe(url: str) -> SchemaOrgRecipe:
    """
    Fetch a recipe from a Jamie Oliver URL.
    
    Args:
        url: Full URL to recipe page
        
    Returns:
        SchemaOrgRecipe object
    """
    crawler = JamieOliverCrawler()
    return crawler.fetch_recipe(url)
