#!/bin/bash
# Tail local dev service logs

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
    echo "📋 Service logs"
    echo ""
    echo "Usage: $0 [service] [options]"
    echo ""
    echo "Services:"
    echo "  all          - All services (multiplexed output)"
    echo "  voice        - backend-voice (Docker)"
    echo "  search       - backend-search (uvicorn log file)"
    echo "  frontend     - frontend (vite log file)"
    echo "  clean        - Remove log files under logs/"
    echo ""
    echo "Options:"
    echo "  -f, --follow - Stream logs (single services only)"
    echo ""
    echo "Examples:"
    echo "  $0 all"
    echo "  $0 voice"
    echo "  $0 voice -f"
    echo "  $0 search"
    echo "  $0 search -f"
    echo "  $0 frontend"
    echo "  $0 frontend -f"
    echo "  $0 clean"
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
        echo "⚠️  backend-search is not running or no log file yet"
        echo "   Start with: ./scripts/dev-backend-search.sh"
        return 1
    fi
    
    if [ "$follow" = "-f" ] || [ "$follow" = "--follow" ]; then
        echo "🔍 backend-search (streaming...)"
        echo "📍 http://localhost:8000"
        echo "---------------------------"
        tail -f "$log_file"
    else
        echo "🔍 backend-search (last 50 lines)"
        echo "📍 http://localhost:8000"
        echo "---------------------------"
        tail -n 50 "$log_file"
    fi
}

show_frontend_logs() {
    local follow="${1:-}"
    local log_file="$PROJECT_ROOT/logs/frontend.log"
    
    if [ ! -f "$log_file" ]; then
        echo "⚠️  frontend is not running or no log file yet"
        echo "   Start with: ./scripts/dev-frontend.sh"
        return 1
    fi
    
    if [ "$follow" = "-f" ] || [ "$follow" = "--follow" ]; then
        echo "⚛️  frontend (streaming...)"
        echo "📍 http://localhost:3000"
        echo "---------------------------"
        tail -f "$log_file"
    else
        echo "⚛️  frontend (last 50 lines)"
        echo "📍 http://localhost:3000"
        echo "---------------------------"
        tail -n 50 "$log_file"
    fi
}

show_all_logs() {
    echo "📋 All services"
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
        echo "📁 Log directory missing: $log_dir"
        return 0
    fi
    
    echo "🧹 Cleaning logs..."
    echo "📍 $log_dir"
    echo ""
    
    local count=0
    for log_file in "$log_dir"/*.log; do
        if [ -f "$log_file" ]; then
            local size=$(du -h "$log_file" | cut -f1)
            rm -f "$log_file"
            echo "  ✅ Removed: $(basename "$log_file") ($size)"
            count=$((count + 1))
        fi
    done
    
    if [ $count -eq 0 ]; then
        echo "  ℹ️  No log files to remove"
    else
        echo ""
        echo "✅ Removed $count log file(s)"
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
        echo "❌ Unknown service: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
