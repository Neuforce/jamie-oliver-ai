#!/usr/bin/env python3
"""
Publish All Draft Recipes

Utility script to publish all draft recipes in Supabase.
Alternative to calling the API endpoint directly.

Usage:
    python scripts/publish_now.py

Environment:
    Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
    apps/backend-search/.env
"""
import os
import sys

# Add backend-search to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'apps', 'backend-search'))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'apps', 'backend-search', '.env'))

from supabase import create_client


def main():
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not url or not key:
        print("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        print("   Make sure apps/backend-search/.env is configured")
        sys.exit(1)
    
    client = create_client(url, key)
    
    # Publish ALL recipes that aren't already published
    result = client.table("recipes").update({
        "status": "published",
        "published_at": "now()"
    }).neq("status", "published").execute()
    
    count = len(result.data) if result.data else 0
    print(f"✅ Published {count} recipes!")
    
    # Verify final state
    published = client.table("recipes").select("slug, status, quality_score").execute()
    print(f"\nTotal recipes in database: {len(published.data)}")
    
    # Show summary by status
    status_counts = {}
    for r in published.data:
        status = r.get('status', 'unknown')
        status_counts[status] = status_counts.get(status, 0) + 1
    
    print("\nStatus breakdown:")
    for status, count in sorted(status_counts.items()):
        print(f"  - {status}: {count}")


if __name__ == "__main__":
    main()
