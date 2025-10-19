import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { HttpConfig } from "./types.js";
import { OAuthManager } from "./oauth-manager.js";

/**
 * Streamable HTTP transport implementation for MCP
 * Follows the MCP specification for streamable HTTP transport:
 * https://modelcontextprotocol.io/specification/draft/basic/transports#streamable-http
 */
export class StreamableHttpTransport implements Transport {
  private url: string;
  private headers: Record<string, string>;
  private config: HttpConfig;
  sessionId?: string; // Public to satisfy Transport interface
  private eventSource?: EventSource;
  private oauthManager?: OAuthManager;

  constructor(config: HttpConfig) {
    this.url = config.url;
    this.config = config;
    this.headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...config.headers,
    };

    // Add Bearer token if provided (for pre-authenticated scenarios)
    if (config.bearerToken) {
      this.headers["Authorization"] = `Bearer ${config.bearerToken}`;
    }

    // Initialize OAuth manager if OAuth config provided
    if (config.oauth) {
      this.oauthManager = new OAuthManager(config.oauth, config.name);
    }
  }

  /**
   * Start the transport - open SSE connection for receiving messages
   */
  async start(): Promise<void> {
    // Initialize OAuth manager (load tokens from disk)
    if (this.oauthManager) {
      await this.oauthManager.initialize();
    }

    // Note: We don't open a persistent GET stream here because:
    // 1. Many servers don't support GET for SSE (return 405)
    // 2. SSE streams are infinite and would block start()
    // 3. We get responses via POST with SSE content-type which works fine
    // If needed, openEventStream() could be called in background, but not needed for now
  }

  /**
   * Send a JSON-RPC message to the server via HTTP POST
   */
  async send(message: JSONRPCMessage): Promise<void> {
    const headers = { ...this.headers };

    // Add OAuth token if available
    if (this.oauthManager) {
      try {
        const token = await this.oauthManager.getAccessToken();
        headers["Authorization"] = `Bearer ${token}`;
      } catch {
        // Not authenticated yet, will handle 401 below
      }
    }

    // Include session ID if we have one
    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    let response = await fetch(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
    });

    // Handle 401 Unauthorized - trigger OAuth flow
    if (response.status === 401 && this.config.oauth) {
      await this.handleUnauthorizedResponse(response);

      // Retry the request with new token
      const token = await this.oauthManager!.getAccessToken();
      headers["Authorization"] = `Bearer ${token}`;

      response = await fetch(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify(message),
      });
    }

    // Check for session ID in response
    const sessionId = response.headers.get("Mcp-Session-Id");
    if (sessionId) {
      this.sessionId = sessionId;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Handle SSE stream response
    const contentType = response.headers.get("Content-Type");

    if (contentType?.includes("text/event-stream")) {
      // Server is sending SSE stream - parse events
      await this.handleSseResponse(response);
    } else if (contentType?.includes("application/json")) {
      // Server sent single JSON response
      const text = await response.text();
      if (text && text.trim()) {
        const data = JSON.parse(text);
        if (this.onmessage) {
          this.onmessage(data as JSONRPCMessage);
        }
      }
      // Else: Empty response body (common for 202 Accepted), no message to process
    }
    // For 202 Accepted (notifications/responses) with no body, nothing to process
  }

  /**
   * Handle SSE stream from POST response
   */
  private async handleSseResponse(response: Response): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const message = JSON.parse(data) as JSONRPCMessage;
              if (this.onmessage) {
                this.onmessage(message);
              }
            } catch (error) {
              console.error("Failed to parse SSE message:", error);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }


  /**
   * Close the transport
   */
  async close(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }

    if (this.onclose) {
      this.onclose();
    }
  }

  /**
   * Handle 401 Unauthorized response and trigger OAuth flow
   */
  private async handleUnauthorizedResponse(response: Response): Promise<void> {
    if (!this.config.oauth) {
      throw new Error("Unauthorized and no OAuth configuration available");
    }

    console.log("\nAuthentication required. Starting OAuth flow...");

    let oauthConfig = this.config.oauth;

    // If OAuth endpoints are not configured, discover them from the server
    if (!oauthConfig.authorizationEndpoint || !oauthConfig.tokenEndpoint) {
      const wwwAuthenticate = response.headers.get("WWW-Authenticate");

      if (wwwAuthenticate) {
        // MCP spec compliant - use WWW-Authenticate header
        const discoveredConfig = await OAuthManager.handleUnauthorized(
          wwwAuthenticate,
          oauthConfig.clientId
        );

        oauthConfig = {
          ...oauthConfig,
          ...discoveredConfig,
        };

        console.log("✓ OAuth endpoints discovered via WWW-Authenticate");
      } else {
        // Fallback to .well-known endpoint
        console.log("Discovering OAuth endpoints via .well-known...");

        const serverUrl = new URL(this.url);
        const wellKnownUrl = `${serverUrl.protocol}//${serverUrl.host}/.well-known/oauth-authorization-server`;

        const wellKnownResponse = await fetch(wellKnownUrl);
        if (!wellKnownResponse.ok) {
          throw new Error(
            `Authentication required but OAuth discovery failed:\n` +
            `  - No WWW-Authenticate header in 401 response\n` +
            `  - No .well-known/oauth-authorization-server endpoint available\n\n` +
            `Please run '${this.config.name} auth login' to authenticate, or configure OAuth endpoints manually.`
          );
        }

        const metadata = await wellKnownResponse.json() as {
          authorization_endpoint: string;
          token_endpoint: string;
          registration_endpoint?: string;
        };

        oauthConfig = {
          ...oauthConfig,
          authorizationEndpoint: metadata.authorization_endpoint,
          tokenEndpoint: metadata.token_endpoint,
          registrationEndpoint: metadata.registration_endpoint,
        };

        console.log("✓ OAuth endpoints discovered via .well-known");
      }

      // Update OAuth manager with discovered endpoints
      this.oauthManager = new OAuthManager(oauthConfig, this.config.name);
      await this.oauthManager.initialize();
    }

    // Trigger OAuth authorization flow
    await this.oauthManager!.authorize(this.url);
  }

  /**
   * Handler for incoming messages (Transport interface)
   */
  onmessage?: (message: JSONRPCMessage) => void;

  /**
   * Handler for close events (Transport interface)
   */
  onclose?: () => void;

  /**
   * Handler for errors (Transport interface)
   */
  onerror?: (error: Error) => void;
}
