import * as oauth from "openid-client";
import { createServer } from "http";
import { parse as parseUrl } from "url";
import { randomBytes } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { join, dirname } from "path";
import { existsSync } from "fs";

/**
 * OAuth configuration for MCP servers
 */
export interface OAuthConfig {
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  clientId?: string; // Optional - will attempt dynamic registration if not provided
  redirectUri?: string;
  scopes?: string[];
  port?: number;
  registrationEndpoint?: string; // For dynamic client registration
}

/**
 * Token set returned from OAuth flow
 */
export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export const DEFAULT_PORT = 3000;

/**
 * Manages OAuth 2.1 authorization flow with PKCE for MCP HTTP servers
 * Follows the MCP specification for OAuth authorization
 */
export class OAuthManager {
  private config: OAuthConfig;
  private tokenSet?: TokenSet;
  private codeVerifier?: string;
  private state?: string;
  private tokenFilePath: string;

  constructor(config: OAuthConfig, cliName: string) {
    this.config = {
      redirectUri: `http://localhost:${config.port ?? DEFAULT_PORT}/callback`,
      scopes: [],
      ...config,
    };
    this.tokenFilePath = join(
      homedir(),
      ".mcp-2-cli",
      `${cliName}.tokens.json`
    );
  }

  /**
   * Initialize the OAuth manager - must be called after construction
   * Loads existing tokens from disk
   */
  async initialize(): Promise<void> {
    await this.loadTokens();
  }

  /**
   * Register a new OAuth client dynamically (RFC 7591)
   * Returns the generated client ID
   */
  private async registerClient(): Promise<string> {
    if (!this.config.registrationEndpoint) {
      throw new Error(
        "Dynamic client registration not available - no registration endpoint"
      );
    }

    const registrationRequest = {
      client_name: "mcp-2-cli",
      redirect_uris: [this.config.redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none", // Public client
      application_type: "native",
    };

    const response = await fetch(this.config.registrationEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(registrationRequest),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Dynamic client registration failed: ${error}`);
    }

    const data = (await response.json()) as {
      client_id: string;
      client_secret?: string;
    };

    console.log(`✓ Registered new OAuth client: ${data.client_id}`);
    this.config.clientId = data.client_id;

    return data.client_id;
  }

  /**
   * Start the OAuth 2.1 authorization code flow with PKCE
   * Opens a browser for user authentication and starts a local server for the callback
   */
  async authorize(resourceUri: string): Promise<TokenSet> {
    if (!this.config.authorizationEndpoint || !this.config.tokenEndpoint) {
      throw new Error(
        "OAuth endpoints not configured. Call handleUnauthorized first."
      );
    }

    // If no client ID, attempt dynamic registration
    if (!this.config.clientId) {
      console.log(
        "No client ID provided. Attempting dynamic client registration..."
      );
      try {
        await this.registerClient();
      } catch (error) {
        throw new Error(
          `Failed to register client: ${
            error instanceof Error ? error.message : String(error)
          }\n\n` +
            "Please provide a clientId in your config or ensure the server supports dynamic client registration."
        );
      }
    }

    // Generate PKCE parameters
    this.codeVerifier = oauth.randomPKCECodeVerifier();
    const codeChallenge = await oauth.calculatePKCECodeChallenge(
      this.codeVerifier
    );
    this.state = randomBytes(16).toString("hex");

    // At this point, clientId must be set (either provided or from dynamic registration)
    if (!this.config.clientId) {
      throw new Error("Client ID not available after registration attempt");
    }

    // Build authorization URL with PKCE
    const authUrl = new URL(this.config.authorizationEndpoint);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", this.config.clientId);
    authUrl.searchParams.set("redirect_uri", this.config.redirectUri!);
    authUrl.searchParams.set("state", this.state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("resource", resourceUri);

    if (this.config.scopes && this.config.scopes.length > 0) {
      authUrl.searchParams.set("scope", this.config.scopes.join(" "));
    }
    const separator = "\n\n--------------------------------\n\n";

    // Open browser (you may need to use 'open' package or manual instruction)
    console.log("Please open this URL in your browser to authenticate:\n\n");
    console.log(authUrl.toString());
    console.log(separator);

    // Start local server to receive callback
    const authCode = await this.startCallbackServer();

    // Exchange authorization code for tokens
    return await this.exchangeCodeForTokens(authCode);
  }

  /**
   * Start a local HTTP server to receive the OAuth callback
   */
  private startCallbackServer(): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        const url = parseUrl(req.url || "", true);

        if (url.pathname === "/callback") {
          const code = url.query.code as string;
          const state = url.query.state as string;
          const error = url.query.error as string;

          if (error) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(
              `<h1>Authentication Failed</h1><p>Error: ${error}</p><p>You can close this window.</p>`
            );
            server.close();
            reject(new Error(`OAuth error: ${error}`));
            return;
          }

          if (!code) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(
              "<h1>Authentication Failed</h1><p>No authorization code received</p><p>You can close this window.</p>"
            );
            server.close();
            reject(new Error("No authorization code received"));
            return;
          }

          if (state !== this.state) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(
              "<h1>Authentication Failed</h1><p>State mismatch</p><p>You can close this window.</p>"
            );
            server.close();
            reject(new Error("State mismatch - possible CSRF attack"));
            return;
          }

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "<h1>Authentication Successful!</h1><p>You can close this window and return to the CLI.</p>"
          );
          server.close();
          resolve(code);
        } else {
          res.writeHead(404);
          res.end("Not found");
        }
      });

      server.listen(this.config.port ?? DEFAULT_PORT, () => {
        console.log(
          `Waiting for authentication callback on ${this.config.redirectUri}`
        );
      });

      server.on("error", (err) => {
        reject(err);
      });
    });
  }

  /**
   * Exchange authorization code for access token using PKCE
   */
  private async exchangeCodeForTokens(code: string): Promise<TokenSet> {
    if (!this.codeVerifier) {
      throw new Error("Code verifier not found");
    }

    if (!this.config.tokenEndpoint) {
      throw new Error("Token endpoint not configured");
    }

    if (!this.config.clientId) {
      throw new Error("Client ID not available");
    }

    const params = new URLSearchParams();
    params.set("grant_type", "authorization_code");
    params.set("code", code);
    params.set("redirect_uri", this.config.redirectUri!);
    params.set("client_id", this.config.clientId);
    params.set("code_verifier", this.codeVerifier);

    const response = await fetch(this.config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    this.tokenSet = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? Date.now() + data.expires_in * 1000
        : undefined,
    };

    // Save tokens to disk
    await this.saveTokens();

    return this.tokenSet;
  }

  /**
   * Get the current access token, refreshing if necessary
   */
  async getAccessToken(): Promise<string> {
    if (!this.tokenSet) {
      throw new Error("Not authenticated. Call authorize() first.");
    }

    // Check if token is expired
    if (
      this.tokenSet.expiresAt &&
      Date.now() >= this.tokenSet.expiresAt - 60000
    ) {
      // Token expired or expiring in < 1 minute
      if (this.tokenSet.refreshToken) {
        await this.refreshAccessToken();
      } else {
        throw new Error("Access token expired and no refresh token available");
      }
    }

    return this.tokenSet.accessToken;
  }

  /**
   * Refresh the access token using the refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.tokenSet?.refreshToken) {
      throw new Error("No refresh token available");
    }

    if (!this.config.tokenEndpoint) {
      throw new Error("Token endpoint not configured");
    }

    if (!this.config.clientId) {
      throw new Error("Client ID not available");
    }

    const params = new URLSearchParams();
    params.set("grant_type", "refresh_token");
    params.set("refresh_token", this.tokenSet.refreshToken);
    params.set("client_id", this.config.clientId);

    const response = await fetch(this.config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    this.tokenSet = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || this.tokenSet.refreshToken,
      expiresAt: data.expires_in
        ? Date.now() + data.expires_in * 1000
        : undefined,
    };

    // Save refreshed tokens to disk
    await this.saveTokens();
  }

  /**
   * Handle 401 response from MCP server
   * Parses WWW-Authenticate header and retrieves OAuth server metadata
   */
  static async handleUnauthorized(
    wwwAuthenticateHeader: string,
    clientId?: string
  ): Promise<OAuthConfig> {
    // Parse WWW-Authenticate header
    // Example: Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource", scope="files:read"
    const metadataMatch = wwwAuthenticateHeader.match(
      /resource_metadata="([^"]+)"/
    );
    const scopeMatch = wwwAuthenticateHeader.match(/scope="([^"]+)"/);

    if (!metadataMatch) {
      throw new Error("No resource_metadata in WWW-Authenticate header");
    }

    const metadataUrl = metadataMatch[1];
    const scopes = scopeMatch ? scopeMatch[1].split(" ") : [];

    // Fetch OAuth server metadata
    const metadataResponse = await fetch(metadataUrl);
    if (!metadataResponse.ok) {
      throw new Error("Failed to fetch OAuth server metadata");
    }

    const metadata = (await metadataResponse.json()) as {
      authorization_servers?: string[];
    };

    // Extract authorization server URL
    const authServerUrl = metadata.authorization_servers?.[0];
    if (!authServerUrl) {
      throw new Error("No authorization server found in metadata");
    }

    // Fetch authorization server metadata
    const authServerResponse = await fetch(
      `${authServerUrl}/.well-known/oauth-authorization-server`
    );
    if (!authServerResponse.ok) {
      throw new Error("Failed to fetch authorization server metadata");
    }

    const authServerMetadata = (await authServerResponse.json()) as {
      authorization_endpoint: string;
      token_endpoint: string;
      registration_endpoint?: string;
    };

    return {
      authorizationEndpoint: authServerMetadata.authorization_endpoint,
      tokenEndpoint: authServerMetadata.token_endpoint,
      registrationEndpoint: authServerMetadata.registration_endpoint,
      clientId,
      scopes,
    };
  }

  /**
   * Check if we have a valid token
   */
  hasValidToken(): boolean {
    if (!this.tokenSet) return false;
    if (!this.tokenSet.expiresAt) return true; // No expiry info, assume valid
    return Date.now() < this.tokenSet.expiresAt - 60000; // Valid if > 1 min left
  }

  /**
   * Save tokens to disk at ~/.mcp-2-cli/<cli-name>.tokens.json
   */
  private async saveTokens(): Promise<void> {
    if (!this.tokenSet) return;

    try {
      // Ensure directory exists
      const dir = dirname(this.tokenFilePath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true, mode: 0o700 });
      }

      // Write tokens to file with restricted permissions
      await writeFile(
        this.tokenFilePath,
        JSON.stringify(this.tokenSet, null, 2),
        { mode: 0o600 }
      );

      console.log(`Tokens saved to ${this.tokenFilePath}`);
    } catch (error) {
      console.error("Failed to save tokens:", error);
      // Don't throw - token storage failure shouldn't break the flow
    }
  }

  /**
   * Load tokens from disk at ~/.mcp-2-cli/<cli-name>.tokens.json
   */
  private async loadTokens(): Promise<void> {
    try {
      if (existsSync(this.tokenFilePath)) {
        const data = await readFile(this.tokenFilePath, "utf-8");
        this.tokenSet = JSON.parse(data) as TokenSet;
        console.log(`Loaded existing tokens from ${this.tokenFilePath}`);
      }
    } catch (error) {
      console.error("Failed to load tokens:", error);
      // Don't throw - missing/invalid tokens just mean we need to re-auth
      this.tokenSet = undefined;
    }
  }
}
