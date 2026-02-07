#!/usr/bin/env bash
# Linear integration: list issues by state, create an issue, get issue details.
# Usage: ./linear.sh <list|create|get> [arguments]
# Requires scripts/.env with LINEAR_API_KEY (copy from .env.example).

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

if [ -z "$LINEAR_API_KEY" ]; then
  echo "Error: LINEAR_API_KEY is not set."
  echo "Copy scripts/.env.example to scripts/.env and add your API key (Linear → Settings → API)."
  exit 1
fi

# Default team/project IDs (Neuforce)
LINEAR_TEAM_ID="${LINEAR_TEAM_ID:-08b7b23f-a3bc-4a08-bf6f-601121b27bc5}"
LINEAR_PROJECT_ID="${LINEAR_PROJECT_ID:-276c26e4-0780-4c3d-b7a4-fcd12fc5868a}"

LINEAR_URL="https://api.linear.app/graphql"

_curl_linear() {
  curl -s -X POST "$LINEAR_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: $LINEAR_API_KEY" \
    "$@"
}

# --- list: list issues (optionally filtered by state name)
# Usage: ./linear.sh list [State] [--md]
# --md: output Markdown table (for chat/UI). Otherwise terminal table.
_cmd_list() {
  local out_md=0
  local state_arg=""
  for a in "$@"; do
    if [[ "$a" == "--md" || "$a" == "--markdown" ]]; then out_md=1; else state_arg="$a"; fi
  done
  local state_filter=""
  if [ -n "$state_arg" ]; then
    state_filter=", filter: { state: { name: { eq: \"$state_arg\" } } }"
  else
    state_filter=", filter: { state: { type: { nin: [\"completed\", \"canceled\"] } } }"
  fi
  local query="query { team(id: \"$LINEAR_TEAM_ID\") { name issues(first: 100 $state_filter, orderBy: updatedAt) { nodes { identifier title state { name } } } } }"
  if [ "$out_md" -eq 1 ]; then
    _curl_linear --data "{\"query\": $(echo "$query" | jq -Rs .)}" | jq -r '
      if .errors then (.errors | tostring)
      else
        .data.team | ("| ID | State | Title |\n|----|-------|-------|\n"),
        (.issues.nodes[] | "| " + .identifier + " | " + .state.name + " | " + (.title | gsub("\\|"; " / ")) + " |")
      end
    '
  else
    _curl_linear --data "{\"query\": $(echo "$query" | jq -Rs .)}" | jq -r '
      if .errors then (.errors | tostring)
      else
        .data.team | ("Team: " + .name + "\n"),
        ("ID\tState\tTitle"),
        (.issues.nodes[] | [.identifier, .state.name, .title] | @tsv)
      end
    ' | while IFS= read -r line; do
      if [[ "$line" == Team:* ]]; then echo "$line"; continue; fi
      if [[ "$line" == ID* ]]; then
        echo "$line"
        echo "$line" | sed 's/./-/g'
        continue
      fi
      echo "$line"
    done | column -t -s $'\t'
  fi
}

# --- create: create an issue
# Usage: ./linear.sh create "Issue title" [Description]
_cmd_create() {
  local title="$1"
  local description="${2:-}"
  if [ -z "$title" ]; then
    echo "Usage: $0 create \"Issue title\" [Description]"
    exit 1
  fi
  local desc_escaped
  desc_escaped=$(echo "$description" | jq -Rs .)
  local title_escaped
  title_escaped=$(echo "$title" | jq -Rs .)
  local mutation="mutation { issueCreate(input: { teamId: \"$LINEAR_TEAM_ID\", projectId: \"$LINEAR_PROJECT_ID\", title: $title_escaped, description: $desc_escaped }) { success issue { identifier title url state { name } } } }"
  _curl_linear --data "{\"query\": $(echo "$mutation" | jq -Rs .)}" | jq -r '
    if .errors then (.errors | tostring)
    elif .data.issueCreate.success then .data.issueCreate.issue | "Created: " + .identifier + " | " + .state.name + " | " + .title + "\n" + .url
    else (.data | tostring)
    end
  '
}

# --- get: get issue details by identifier (e.g. NEU-470)
# Usage: ./linear.sh get NEU-470
_cmd_get() {
  local id="$1"
  if [ -z "$id" ]; then
    echo "Usage: $0 get <identifier>   (e.g. NEU-470)"
    exit 1
  fi
  local query="query { team(id: \"$LINEAR_TEAM_ID\") { issues(first: 250, orderBy: updatedAt) { nodes { identifier title description state { name } url priorityLabel assignee { name } createdAt updatedAt } } } }"
  _curl_linear --data "{\"query\": $(echo "$query" | jq -Rs .)}" | jq -r --arg id "$id" '
    if .errors then (.errors | tostring)
    else
      (.data.team.issues.nodes | map(select(.identifier == $id)) | .[0]) as $issue
      | if $issue == null then "No issue found with identifier: " + $id
        else $issue | "\(.identifier) | \(.state.name) | \(.title)\nURL: \(.url)\nPriority: \(.priorityLabel // "—") | Assignee: \(.assignee.name // "—")\nCreated: \(.createdAt) | Updated: \(.updatedAt)\n\nDescription:\n\(.description // "—")"
        end
    end
  '
}

# --- main
case "${1:-}" in
  list)   shift; _cmd_list "$@" ;;
  create) shift; _cmd_create "$@" ;;
  get)    shift; _cmd_get "$@" ;;
  *)
    echo "Usage: $0 <list|create|get> [arguments]"
    echo ""
    echo "  list [State]      List issues. No state: non-completed/non-canceled."
    echo "                    Example: $0 list Backlog"
    echo "  create \"Title\" [Description]   Create issue in default team."
    echo "  get <identifier>  Show issue details (e.g. NEU-470)."
    exit 1
    ;;
esac
