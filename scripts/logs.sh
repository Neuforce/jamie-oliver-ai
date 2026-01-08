#!/bin/bash
# Script para ver logs de los servicios en desarrollo

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Detect docker-compose command
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    DOCKER_COMPOSE="docker compose"
fi

show_help() {
    echo "📋 Ver logs de servicios"
    echo ""
    echo "Uso: $0 [servicio] [opciones]"
    echo ""
    echo "Servicios disponibles:"
    echo "  all          - Ver logs de todos los servicios (multiplexado)"
    echo "  voice        - Ver logs del backend-voice (Docker)"
    echo "  search       - Ver logs del backend-search (uvicorn)"
    echo "  frontend     - Ver logs del frontend (vite)"
    echo "  clean        - Limpiar todos los archivos de logs"
    echo ""
    echo "Opciones:"
    echo "  -f, --follow - Seguir logs en tiempo real (solo para servicios individuales)"
    echo ""
    echo "Ejemplos:"
    echo "  $0 all              # Ver todos los logs"
    echo "  $0 voice            # Ver logs del backend-voice"
    echo "  $0 voice -f         # Seguir logs del backend-voice en tiempo real"
    echo "  $0 search           # Ver logs del backend-search"
    echo "  $0 search -f        # Seguir logs del backend-search en tiempo real"
    echo "  $0 frontend         # Ver logs del frontend"
    echo "  $0 frontend -f      # Seguir logs del frontend en tiempo real"
    echo "  $0 clean            # Limpiar todos los archivos de logs"
}

show_voice_logs() {
    local follow="${1:-}"
    cd "$PROJECT_ROOT/infrastructure"
    if [ "$follow" = "-f" ] || [ "$follow" = "--follow" ]; then
        $DOCKER_COMPOSE logs -f backend-voice
    else
        $DOCKER_COMPOSE logs --tail=100 backend-voice
    fi
}

show_search_logs() {
    local follow="${1:-}"
    local log_file="$PROJECT_ROOT/logs/backend-search.log"
    
    if [ ! -f "$log_file" ]; then
        echo "⚠️  Backend-search no está corriendo o no hay logs"
        echo "   Inicia con: ./scripts/dev-backend-search.sh"
        return 1
    fi
    
    if [ "$follow" = "-f" ] || [ "$follow" = "--follow" ]; then
        echo "🔍 Backend-search logs (siguiendo en tiempo real...)"
        echo "📍 Servicio: http://localhost:8000"
        echo "---------------------------"
        tail -f "$log_file"
    else
        echo "🔍 Backend-search logs (últimas 50 líneas):"
        echo "📍 Servicio: http://localhost:8000"
        echo "---------------------------"
        tail -n 50 "$log_file"
    fi
}

show_frontend_logs() {
    local follow="${1:-}"
    local log_file="$PROJECT_ROOT/logs/frontend.log"
    
    if [ ! -f "$log_file" ]; then
        echo "⚠️  Frontend no está corriendo o no hay logs"
        echo "   Inicia con: ./scripts/dev-frontend.sh"
        return 1
    fi
    
    if [ "$follow" = "-f" ] || [ "$follow" = "--follow" ]; then
        echo "⚛️  Frontend logs (siguiendo en tiempo real...)"
        echo "📍 Servicio: http://localhost:3000"
        echo "---------------------------"
        tail -f "$log_file"
    else
        echo "⚛️  Frontend logs (últimas 50 líneas):"
        echo "📍 Servicio: http://localhost:3000"
        echo "---------------------------"
        tail -n 50 "$log_file"
    fi
}

show_all_logs() {
    echo "📋 Logs de todos los servicios"
    echo "================================"
    echo ""
    
    echo "🐳 Backend-Voice (Docker):"
    echo "---------------------------"
    show_voice_logs
    echo ""
    
    echo "🔍 Backend-Search:"
    echo "-------------------"
    show_search_logs
    echo ""
    
    echo "⚛️  Frontend:"
    echo "-------------"
    show_frontend_logs
}

clean_logs() {
    local log_dir="$PROJECT_ROOT/logs"
    
    if [ ! -d "$log_dir" ]; then
        echo "📁 Directorio de logs no existe: $log_dir"
        return 0
    fi
    
    echo "🧹 Limpiando logs..."
    echo "📍 Directorio: $log_dir"
    echo ""
    
    local count=0
    for log_file in "$log_dir"/*.log; do
        if [ -f "$log_file" ]; then
            local size=$(du -h "$log_file" | cut -f1)
            rm -f "$log_file"
            echo "  ✅ Eliminado: $(basename "$log_file") ($size)"
            count=$((count + 1))
        fi
    done
    
    if [ $count -eq 0 ]; then
        echo "  ℹ️  No hay archivos de logs para limpiar"
    else
        echo ""
        echo "✅ Limpieza completada: $count archivo(s) eliminado(s)"
    fi
}

# Main
case "${1:-}" in
    ""|help|-h|--help)
        show_help
        ;;
    all)
        show_all_logs
        ;;
    voice|backend-voice)
        show_voice_logs "${2:-}"
        ;;
    search|backend-search)
        show_search_logs "${2:-}"
        ;;
    frontend)
        show_frontend_logs "${2:-}"
        ;;
    clean|clear)
        clean_logs
        ;;
    *)
        echo "❌ Servicio desconocido: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
