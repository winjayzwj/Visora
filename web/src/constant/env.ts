export const APP_VERSION = __APP_VERSION__ || "dev";

export const DOCS_URL = import.meta.env.VITE_DOC_URL || "";

// Optional deployment-provided endpoints. Visora has no public default URLs yet.
export const PLUGIN_REGISTRY_URL = import.meta.env.VITE_PLUGIN_REGISTRY_URL || "";
export const LATEST_VERSION_URL = import.meta.env.VITE_LATEST_VERSION_URL || "";
export const LATEST_CHANGELOG_URL = import.meta.env.VITE_LATEST_CHANGELOG_URL || "";
export const REPOSITORY_URL = import.meta.env.VITE_REPOSITORY_URL || "https://github.com/winjayzwj/Visora";
export const LOCAL_AGENT_COMMAND = import.meta.env.VITE_LOCAL_AGENT_COMMAND || "";
export const AGENT_PLUGIN_REMOVE_COMMAND = import.meta.env.VITE_AGENT_PLUGIN_REMOVE_COMMAND || "";
export const AGENT_MCP_REMOVE_COMMAND = import.meta.env.VITE_AGENT_MCP_REMOVE_COMMAND || "";
export const LOCAL_PROXY_COMMAND = import.meta.env.VITE_LOCAL_PROXY_COMMAND || "";
