#!/usr/bin/env python3
"""
Script de prueba para la API de búsqueda semántica.
Muestra ejemplos prácticos de diferentes payloads.
"""

import requests
import json
import time

API_URL = "http://localhost:8000"

def print_separator(title=""):
    print("\n" + "="*80)
    if title:
        print(title)
        print("="*80)

def test_basic_search():
    print_separator("EJEMPLO 1: Búsqueda Básica (payload mínimo)")
    
    payload = {
        "query": "quick pasta recipe"
    }
    
    print("\n📤 Payload:")
    print(json.dumps(payload, indent=2))
    
    start = time.time()
    response = requests.post(f"{API_URL}/api/v1/recipes/search", json=payload)
    elapsed = (time.time() - start) * 1000
    
    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Response (HTTP 200 OK) - {elapsed:.0f}ms")
        print(f"\nEncontradas: {data['total']} recetas")
        print(f"Tiempo: {data['took_ms']:.1f}ms\n")
        
        for i, recipe in enumerate(data['results'][:3], 1):
            print(f"{i}. {recipe['title']}")
            print(f"   Score: {recipe['combined_score']:.3f}")
            print(f"   Explicación: {recipe['match_explanation']}")
    else:
        print(f"\n❌ Error: {response.status_code}")
        print(response.text)

def test_with_filters():
    print_separator("EJEMPLO 2: Búsqueda con Filtros")
    
    payload = {
        "query": "something special",
        "category": "dinner",
        "complexity": "easy",
        "top_k": 3
    }
    
    print("\n📤 Payload:")
    print(json.dumps(payload, indent=2))
    
    response = requests.post(f"{API_URL}/api/v1/recipes/search", json=payload)
    
    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Response (HTTP 200 OK)")
        print(f"\nFiltros aplicados:")
        for key, value in data['filters_applied'].items():
            if value:
                print(f"  • {key}: {value}")
        
        print(f"\nResultados: {data['total']}\n")
        for i, recipe in enumerate(data['results'], 1):
            print(f"{i}. {recipe['title']} (score: {recipe['combined_score']:.3f})")
    else:
        print(f"\n❌ Error: {response.status_code}")
        print(response.text)

def test_ingredients_search():
    print_separator("EJEMPLO 3: Búsqueda por Ingredientes")
    
    payload = {
        "query": "italian recipe",
        "ingredients_query": "tomato basil",
        "top_k": 5
    }
    
    print("\n📤 Payload:")
    print(json.dumps(payload, indent=2))
    
    response = requests.post(f"{API_URL}/api/v1/recipes/search", json=payload)
    
    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Response (HTTP 200 OK)")
        print(f"\nEncontradas: {data['total']} recetas\n")
        
        for i, recipe in enumerate(data['results'], 1):
            print(f"{i}. {recipe['title']}")
            print(f"   Similarity: {recipe['similarity_score']:.3f}")
            print(f"   Combined: {recipe['combined_score']:.3f}")
    else:
        print(f"\n❌ Error: {response.status_code}")
        print(response.text)

def test_full_recipe():
    print_separator("EJEMPLO 4: Búsqueda con Receta Completa")
    
    payload = {
        "query": "christmas salad",
        "include_full_recipe": True,
        "include_chunks": True,
        "top_k": 1
    }
    
    print("\n📤 Payload:")
    print(json.dumps(payload, indent=2))
    
    response = requests.post(f"{API_URL}/api/v1/recipes/search", json=payload)
    
    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Response (HTTP 200 OK)")
        
        if data['results']:
            recipe = data['results'][0]
            print(f"\nReceta: {recipe['title']}")
            print(f"Score: {recipe['combined_score']:.3f}")
            
            if recipe['full_recipe']:
                print(f"\n📝 Datos incluidos:")
                print(f"  • Ingredientes: {len(recipe['full_recipe'].get('ingredients', []))}")
                print(f"  • Pasos: {len(recipe['full_recipe'].get('steps', []))}")
                print(f"  • Chunks relevantes: {len(recipe['matching_chunks'])}")
                
                # Mostrar primer ingrediente
                if recipe['full_recipe'].get('ingredients'):
                    ing = recipe['full_recipe']['ingredients'][0]
                    print(f"\n  Ejemplo de ingrediente:")
                    print(f"    {ing.get('quantity', '')} {ing.get('unit', '')} {ing.get('name', '')}")
    else:
        print(f"\n❌ Error: {response.status_code}")
        print(response.text)

def test_get_recipe_by_id():
    print_separator("EJEMPLO 5: Obtener Receta por ID")
    
    recipe_id = "christmas-salad-jamie-oliver-recipes"
    url = f"{API_URL}/api/v1/recipes/{recipe_id}?include_chunks=false"
    
    print(f"\n📤 GET {url}")
    
    response = requests.get(url)
    
    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Response (HTTP 200 OK)")
        print(f"\nReceta: {data['title']}")
        print(f"ID: {data['recipe_id']}")
        print(f"File: {data['file_path']}")
        
        if data.get('full_recipe'):
            print(f"\nMetadata:")
            recipe_meta = data['full_recipe'].get('recipe', {})
            print(f"  • Difficulty: {recipe_meta.get('difficulty', 'N/A')}")
            print(f"  • Time: {recipe_meta.get('estimated_total', 'N/A')}")
            print(f"  • Servings: {recipe_meta.get('servings', 'N/A')}")
    else:
        print(f"\n❌ Error: {response.status_code}")
        print(response.text)

def test_list_recipes():
    print_separator("EJEMPLO 6: Listar Recetas con Filtros")
    
    url = f"{API_URL}/api/v1/recipes?limit=3"
    
    print(f"\n📤 GET {url}")
    
    response = requests.get(url)
    
    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Response (HTTP 200 OK)")
        print(f"\nTotal: {data['total']} recetas\n")
        
        for recipe in data['recipes']:
            print(f"• {recipe['title']} ({recipe['id']})")
    else:
        print(f"\n❌ Error: {response.status_code}")
        print(response.text)

def test_health_check():
    print_separator("EJEMPLO 7: Health Check")
    
    url = f"{API_URL}/health"
    
    print(f"\n📤 GET {url}")
    
    response = requests.get(url)
    
    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Response (HTTP 200 OK)")
        print(json.dumps(data, indent=2))
    else:
        print(f"\n❌ Error: {response.status_code}")
        print(response.text)

def test_complete_payload():
    print_separator("EJEMPLO 8: Payload Completo (todas las opciones)")
    
    payload = {
        "query": "quick vegetarian dinner",
        "category": "dinner",
        "mood": "comfort",
        "complexity": "easy",
        "cost": "budget",
        "ingredients_query": "pasta vegetables",
        "top_k": 5,
        "include_full_recipe": False,
        "include_chunks": True
    }
    
    print("\n📤 Payload:")
    print(json.dumps(payload, indent=2))
    
    response = requests.post(f"{API_URL}/api/v1/recipes/search", json=payload)
    
    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Response (HTTP 200 OK)")
        print(f"\nFiltros aplicados: {json.dumps(data['filters_applied'], indent=2)}")
        print(f"Resultados: {data['total']}")
        print(f"Tiempo: {data['took_ms']:.1f}ms")
    else:
        print(f"\n❌ Error: {response.status_code}")
        print(response.text)

def main():
    print("="*80)
    print("🚀 Testing Recipe Search API")
    print("="*80)
    print(f"\nAPI URL: {API_URL}")
    
    # Check if API is running
    try:
        response = requests.get(f"{API_URL}/health", timeout=2)
        if response.status_code != 200:
            print("\n❌ API is not healthy. Please start the API first:")
            print("   ./scripts/start_api.sh")
            return
    except requests.exceptions.ConnectionError:
        print("\n❌ Cannot connect to API. Please start the API first:")
        print("   ./scripts/start_api.sh")
        return
    
    print("\n✅ API is running!\n")
    
    # Run all tests
    tests = [
        ("Basic Search", test_basic_search),
        ("With Filters", test_with_filters),
        ("Ingredients Search", test_ingredients_search),
        ("Full Recipe", test_full_recipe),
        ("Get by ID", test_get_recipe_by_id),
        ("List Recipes", test_list_recipes),
        ("Health Check", test_health_check),
        ("Complete Payload", test_complete_payload),
    ]
    
    for name, test_func in tests:
        try:
            test_func()
            time.sleep(0.5)  # Small delay between tests
        except Exception as e:
            print(f"\n❌ Error in {name}: {e}")
            import traceback
            traceback.print_exc()
    
    print_separator("✅ All Tests Completed!")

if __name__ == "__main__":
    main()

