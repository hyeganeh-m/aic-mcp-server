# Ping Platform MCP Server

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

A universal **Model Context Protocol (MCP)** server that connects AI assistants and autonomous coding agents (**Antigravity**, **Gemini CLI (`agy`)**, **GitHub Copilot**, **Claude Desktop**, **Cursor**) directly to **Ping Identity platforms** — supporting **PingAM**, **PingIDM**, and **PingOne Advanced Identity Cloud (AIC)**.

Administer identity trees, author authentication journeys, manage users and roles, customize themes, inspect audit logs, and configure environment variables using natural language across **local Docker**, **on-premises enterprise servers**, or **cloud tenants**.

---

## 🌟 Key Capabilities

- **Universal Ping Connectivity**:
  - **Local & On-Premises**: Connects directly to PingAM and PingIDM (e.g. `http://am.ping.local:8080/am`, `http://localhost:8082/openidm`) across custom realms (`customers`, `employees`, `root`).
  - **PingOne Advanced Identity Cloud (AIC)**: Seamlessly targets cloud tenants (`https://<tenant>.forgeblocks.com`) using cloud gateway authentication.
- **Multiple Authentication Modes**:
  - **Direct Admin Credentials / Automation Mode**: Pass `AM_ADMIN_USERNAME`/`AM_ADMIN_PASSWORD` and `IDM_ADMIN_USERNAME`/`IDM_ADMIN_PASSWORD` (or `SSO_TOKEN`) for zero-prompt, headless agent operation.
  - **Interactive OAuth 2.0 PKCE Flow**: Automatic loopback listener (`localhost:3000`) and browser elicitation for desktop operators.
  - **OAuth 2.0 Device Code Flow**: RFC 8628 with interactive MCP input elicitation for containerized/headless deployments.
  - **RFC 8693 Token Exchange**: Automatically down-scopes broad session tokens to least-privilege tokens per tool call.
- **Comprehensive Tool Surface (40+ Tools)**:
  - **Authentication Trees / Journeys**: Create, query, update, node wiring, and decommission journeys.
  - **Scripts & Decision Nodes**: Manage Groovy and JavaScript authentication and policy scripts.
  - **IDM Managed Objects**: Full CRUD, search, filtering, and schema introspection for users, roles, groups, organizations, and custom objects.
  - **OIDC / OAuth 2.0 Clients**: Inspect and configure applications, grant types, and redirect URIs.
  - **Themes & UI Branding**: Query, create, and set default themes.
  - **Audit & Monitoring**: Query audit logs and inspect event sources.
  - **Environment Variables (ESVs)**: Read and update secrets and variables.

---

## 🚀 Quick Start & Client Installation

### 1. Build from Source

```bash
git clone https://github.com/hyeganeh-m/aic-mcp-server.git
cd aic-mcp-server
npm install
npm run build
```

#### Directory Structure & Locating the Entrypoint

After compilation, the MCP entrypoint is generated at `dist/index.js`:

```text
aic-mcp-server/
├── dist/
│   ├── index.js          <-- ⭐️ Absolute path to this file is used in MCP client configs
│   └── ...
├── src/
├── package.json
└── README.md
```

> 💡 **Find Your System's Absolute Path**:
> Run this command inside the cloned repository to print the exact path for your system:
> ```bash
> echo "$(pwd)/dist/index.js"
> # macOS example:   /Users/<your-username>/projects/aic-mcp-server/dist/index.js
> # Linux example:   /home/<your-username>/projects/aic-mcp-server/dist/index.js
> # Windows example: C:\\projects\\aic-mcp-server\\dist\\index.js
> ```

---

### 2. Configure for Your AI Tool

#### A. Gemini CLI / Antigravity CLI (`agy`)
Antigravity and `agy` discover global MCP servers from `~/.gemini/config/mcp_config.json`. Add the server to the `mcpServers` object:

```json
{
  "mcpServers": {
    "ping-platform": {
      "command": "node",
      "args": [
        "/path/to/aic-mcp-server/dist/index.js"
      ],
      "env": {
        "AM_BASE_URL": "http://am.ping.local:8080/am",
        "IDM_BASE_URL": "http://localhost:8082/openidm",
        "AM_REALM": "customers",
        "AM_ADMIN_USERNAME": "amadmin",
        "AM_ADMIN_PASSWORD": "<your-am-admin-password>",
        "IDM_ADMIN_USERNAME": "openidm-admin",
        "IDM_ADMIN_PASSWORD": "<your-idm-admin-password>"
      }
    }
  }
}
```

**Test with `agy`:**
```bash
agy "Use ping-platform MCP to list all journeys in the customers realm"
```

---

#### B. GitHub Copilot (VS Code Extension / Plugin)
VS Code supports Model Context Protocol (MCP) servers for GitHub Copilot Chat through `.vscode/mcp.json` (workspace scope) or user-level settings.

Create or update `.vscode/mcp.json` in your repository root:

```json
{
  "mcpServers": {
    "ping-platform": {
      "command": "node",
      "args": [
        "/path/to/aic-mcp-server/dist/index.js"
      ],
      "env": {
        "AM_BASE_URL": "http://am.ping.local:8080/am",
        "IDM_BASE_URL": "http://localhost:8082/openidm",
        "AM_REALM": "customers",
        "AM_ADMIN_USERNAME": "amadmin",
        "AM_ADMIN_PASSWORD": "<your-am-admin-password>",
        "IDM_ADMIN_USERNAME": "openidm-admin",
        "IDM_ADMIN_PASSWORD": "<your-idm-admin-password>"
      }
    }
  }
}
```

**Test in GitHub Copilot Chat:**
Open the Copilot Chat panel in VS Code (`Cmd + Shift + I` or `Ctrl + Shift + I`) and prompt:
> *"@workspace Use the ping-platform tool to list all authentication journeys in the customers realm."*

---

#### C. Claude Desktop
Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "ping-platform": {
      "command": "node",
      "args": [
        "/path/to/aic-mcp-server/dist/index.js"
      ],
      "env": {
        "AM_BASE_URL": "http://am.ping.local:8080/am",
        "IDM_BASE_URL": "http://localhost:8082/openidm",
        "AM_REALM": "customers",
        "AM_ADMIN_USERNAME": "amadmin",
        "AM_ADMIN_PASSWORD": "<your-am-admin-password>",
        "IDM_ADMIN_USERNAME": "openidm-admin",
        "IDM_ADMIN_PASSWORD": "<your-idm-admin-password>"
      }
    }
  }
}
```

---

#### D. Cursor IDE
Add to `.cursor/mcp.json` or open **Cursor Settings > Features > MCP**:
- **Name**: `ping-platform`
- **Type**: `command`
- **Command**: `node /path/to/aic-mcp-server/dist/index.js`
- Set the environment variables in the configuration modal.

---

## 🔐 Security & Password Management

Never commit administrative passwords to public repositories or unencrypted configuration files. Use one of the following recommended methods:

### Option 1: Zero-Credentials Interactive Flow (Recommended)
You do not need to store admin usernames or passwords in configuration files! 
If `AM_ADMIN_PASSWORD` is omitted, the MCP server automatically initiates an interactive **OAuth 2.0 Authorization Code Flow with PKCE**:
1. Starts a local loopback listener on `http://localhost:3000`.
2. Prompts you in your default web browser to log in through your realm's authentication journey.
3. Upon successful login, the session token is securely stored in your operating system's native keychain (macOS Keychain, Windows Credential Manager, or Linux Secret Service / Keyring).
4. No plaintext passwords are ever written to configuration files.

### Option 2: Environment Variable Expansion & Secrets Injection
Keep credentials out of static `.json` configuration files by injecting environment variables:

```bash
export AM_ADMIN_PASSWORD="<your-strong-password>"
export IDM_ADMIN_PASSWORD="<your-strong-password>"
```

In tools that support environment variable expansion, reference them directly:
```json
{
  "env": {
    "AM_ADMIN_PASSWORD": "${AM_ADMIN_PASSWORD}",
    "IDM_ADMIN_PASSWORD": "${IDM_ADMIN_PASSWORD}"
  }
}
```

Or inject at runtime via enterprise secret tools (e.g. 1Password CLI, Doppler, Vault):
```bash
op run --env-file=.env -- agy "List journeys"
```

### Option 3: Generating Cryptographically Strong Passwords
When provisioning administrator accounts for PingAM (`amadmin`) or PingIDM (`openidm-admin`), generate random, high-entropy passwords rather than using static strings:

- **OpenSSL (Cross-Platform)**:
  ```bash
  openssl rand -base64 24
  ```
- **Python 3 `secrets` module**:
  ```bash
  python3 -c "import secrets; print(secrets.token_urlsafe(24))"
  ```
- **pwgen**:
  ```bash
  pwgen -s 24 1
  ```
- **System Entropy (`/dev/urandom`)**:
  ```bash
  LC_ALL=C tr -dc 'A-Za-z0-9!@#$%^&*' < /dev/urandom | head -c 24; echo
  ```

---

## 🏛️ Deployment Topologies & Environment Setup (Local & Remote)

The MCP server connects to any Ping Identity deployment topology: **Local Docker**, **Remote Enterprise On-Premises/Private Cloud**, **Standalone PingAM (no IDM)**, or **PingOne Advanced Identity Cloud (AIC)**.

### 🔑 Authentication Architecture: Direct Session vs OAuth Gateway

Understanding how authentication works clarifies why **no OAuth2 clients or custom users are needed** for standard deployments:

| Authentication Mode | Deployment Targets | OAuth2 Client Needed in PingAM? | Custom Users Required? | How It Works |
| :--- | :--- | :---: | :---: | :--- |
| **Direct Admin SSO (Recommended)** | Local Docker, Remote On-Prem, Standalone PingAM | ❌ **No Client Needed** | ❌ **No (uses built-in `amadmin`)** | Directly authenticates via CREST `/json/realms/root/authenticate` to acquire an `iPlanetDirectoryPro` administrative session token. Zero OAuth client configuration. |
| **Interactive Browser PKCE** | Workstations targeting PingAM with browser | ✅ Yes (`AICMCPClient` on `localhost:3000`) | ❌ No (logs in as `amadmin` or realm admin) | Opens default browser, executes target realm journey, caches session in native OS Keychain. |
| **Cloud Gateway Mode** | PingOne AIC (`*.forgeblocks.com`) | ❌ Pre-configured in cloud | ❌ Uses Tenant Cloud Admin | Authenticates via cloud gateway and down-scopes tokens via RFC 8693 token exchange. |

---

### 1. Topology 1: Standalone PingAM (No PingIDM at All)
Use this setup when you have PingAM running with CTS (Core Token Service) and an Identity Repository (OpenDJ, Active Directory, or OpenLDAP), but **no PingIDM service**.

- **OAuth2 Client Required?**: **NO.**
- **User Required**: Default built-in `amadmin` (or any realm admin).
- **Behavior**: All PingAM operations (Journeys, Trees, Nodes, Scripts, Decisions, CORS, and OAuth2 Client management) operate at 100% functionality. Any accidental call to an IDM tool gracefully reports that IDM is not configured, without crashing or hanging.

```json
{
  "mcpServers": {
    "ping-platform": {
      "command": "node",
      "args": ["/path/to/aic-mcp-server/dist/index.js"],
      "env": {
        "AM_BASE_URL": "http://am.ping.local:8080/am",
        "AM_REALM": "customers",
        "AM_ADMIN_USERNAME": "amadmin",
        "AM_ADMIN_PASSWORD": "<your-am-admin-password>"
      }
    }
  }
}
```

---

### 2. Topology 2: PingAM + PingIDM (Local Docker Stack)
Use this setup when running both PingAM and PingIDM in Docker Compose (e.g. `am.ping.local:8080/am` and `localhost:8082/openidm`).

- **OAuth2 Client Required?**: **NO.** Both services use direct administrative authentication.
- **Users Required**:
  - PingAM: `amadmin` (built-in root administrator).
  - PingIDM: `openidm-admin` (built-in IDM administrator).
- **FQDN Requirement**: PingAM enforces cookie domains. Add the hostname to `/etc/hosts`:
  ```text
  127.0.0.1 am.ping.local idm.ping.local
  ```

```json
{
  "mcpServers": {
    "ping-platform": {
      "command": "node",
      "args": ["/path/to/aic-mcp-server/dist/index.js"],
      "env": {
        "AM_BASE_URL": "http://am.ping.local:8080/am",
        "IDM_BASE_URL": "http://localhost:8082/openidm",
        "AM_REALM": "customers",
        "AM_ADMIN_USERNAME": "amadmin",
        "AM_ADMIN_PASSWORD": "<your-am-admin-password>",
        "IDM_ADMIN_USERNAME": "openidm-admin",
        "IDM_ADMIN_PASSWORD": "<your-idm-admin-password>"
      }
    }
  }
}
```

---

### 3. Topology 3: Remote Enterprise PingAM & IDM (Dev, Staging, or Production)
Use this setup when connecting your AI tools to enterprise servers deployed in your data center, AWS, Azure, or GCP.

- **OAuth2 Client Required?**: **NO.** Works directly against the remote CREST APIs.
- **Connection Guidelines**:
  - **HTTPS & Certificates**: Use the full HTTPS URL (e.g. `https://am.corp.example.com/am`). If using private enterprise PKI certificates, ensure the CA cert is added to Node's trusted store (`NODE_EXTRA_CA_CERTS=/path/to/ca.pem`) or system keychain.
  - **Reverse Proxies & Ingress**: The server respects standard reverse proxies (NGINX, Envoy, Traefik). Ensure path prefixes (e.g. `/am` and `/openidm`) match your proxy routing rules.
  - **Port Accessibility**: Ensure your machine can reach the remote ports (typically `443` or `8443`) through your corporate VPN or tunnel.

```json
{
  "mcpServers": {
    "ping-platform": {
      "command": "node",
      "args": ["/path/to/aic-mcp-server/dist/index.js"],
      "env": {
        "AM_BASE_URL": "https://am.corp.example.com/am",
        "IDM_BASE_URL": "https://idm.corp.example.com/openidm",
        "AM_REALM": "workforce",
        "AM_ADMIN_USERNAME": "amadmin",
        "AM_ADMIN_PASSWORD": "<remote-amadmin-password>",
        "IDM_ADMIN_USERNAME": "openidm-admin",
        "IDM_ADMIN_PASSWORD": "<remote-openidm-password>"
      }
    }
  }
}
```

---

### 4. Topology 4: PingOne Advanced Identity Cloud (AIC)
Use this setup when managing an official Ping Identity cloud tenant.

- **OAuth2 Client Required?**: Pre-configured by PingOne AIC cloud gateway.
- **Authentication**: Set `AIC_BASE_URL` to your tenant domain. The MCP server connects via OAuth 2.0 PKCE browser login or device code flow.

```json
{
  "mcpServers": {
    "ping-platform": {
      "command": "node",
      "args": ["/path/to/aic-mcp-server/dist/index.js"],
      "env": {
        "AIC_BASE_URL": "openam-mytenant.forgeblocks.com",
        "AIC_REALM": "alpha"
      }
    }
  }
}
```

---

### 5. Configuring an OAuth2 Client for Interactive PKCE (Optional)
If you specifically prefer **not** to provide `AM_ADMIN_PASSWORD` and instead want an interactive browser popup on your local or remote PingAM instance, configure an OAuth2 client in PingAM:

1. **Realm**: Select your administration realm (e.g. `/` or `/customers`).
2. **Client ID**: `AICMCPClient`
3. **Client Type**: `Public` (no client secret)
4. **Redirection URIs**: `http://localhost:3000`
5. **Scopes**: `openid`, `profile`, `am-admin` (or realm management scopes)
6. **Grant Types**: `authorization_code` with PKCE enabled.

*(Note: If you use `AM_ADMIN_USERNAME` and `AM_ADMIN_PASSWORD` direct SSO session mode, this step is completely unnecessary!)*

---

### 6. Required User Roles & Permissions Reference

| Component | Default Superuser | Custom User Role Requirements |
| :--- | :--- | :--- |
| **PingAM** | `amadmin` | Built into the root realm (`/`). If using a delegated admin account, the user must belong to `cn=admins` in the target realm or hold the `Realm Administrator` privilege in AM. |
| **PingIDM** | `openidm-admin` | Built into PingIDM configuration. If using a custom identity, assign the internal role `openidm-admin` or `openidm-authorized` in `conf/authentication.json` / `repo.json`. |

---

## 🛠️ Available MCP Tools

### Realms, Authentication Journeys & Trees
- `listRealms`: Dynamically discovers and lists all configured realms (paths, names, aliases, active status) in any PingAM / AIC deployment.
- `listJourneys`: Discovers all authentication trees in any target realm.
- `getJourney`: Retrieves full node configuration, layout, and connections.
- `createJourney`: Creates a new authentication journey with node layout.
- `updateJourney`: Modifies journey structures and entry points.
- `deleteJourney`: Deletes an authentication journey and cleans up orphaned nodes.
- `setDefaultJourney`: Configures a realm's default login journey.
- `getJourneyPreviewUrl`: Generates direct testing URLs for end users.

> 🌐 **Dynamic Realm Architecture**: The MCP server is completely dynamic and is **never** restricted to a hardcoded list of realms. You can target any custom realm in your deployment (e.g. `workforce`, `partners`, `b2b`, `customers`, `alpha`, or root `/`). Call `listRealms` to discover available realms in any connected PingAM environment.

### Scripts & Policy
- `listScripts`: Lists all groovy/javascript scripts in a realm.
- `getAMScript`: Fetches script content and metadata.
- `createScript`: Creates a new script in a target realm.
- `updateScript`: Updates script source code and evaluation engine context.
- `deleteScript`: Removes a script.

### IDM Managed Objects (Users, Roles, Custom Schemas)
- `listManagedObjects`: Discovers all managed object types (`user`, `role`, `organization`).
- `getManagedObjectSchema`: Retrieves schema definitions and attribute properties.
- `queryManagedObjects`: Queries objects using CREST `_queryFilter` syntax (`userName sw 'john'`).
- `createManagedObject`: Creates a new managed object instance.
- `getManagedObject`: Fetches a single object by internal ID.
- `patchManagedObject`: Applies partial modifications using RFC 6902 patch operations.
- `deleteManagedObject`: Deletes an object.

### OAuth 2.0 / OIDC Applications
- `listOidcApps`: Lists registered client applications in any target realm.
- `getOidcApp`: Retrieves full client configuration (scopes, grant types, redirect URIs).
- `createOidcApp`: Provisions a new confidential or public OAuth2 client.
- `updateOidcApp`: Updates redirect URIs, scopes, or authentication signing algorithms.
- `deleteOidcApp`: Removes an OAuth client application.

### Logging, Themes & Variables
- `queryLogs`: Searches audit and monitoring logs with filtering.
- `getLogSources`: Lists available log topics (`access`, `activity`, `authentication`, `config`).
- `getThemes` / `createTheme` / `updateTheme` / `setDefaultTheme`: Customizes branding and login UI themes per realm.
- `queryESVs` / `getVariable` / `setVariable` / `deleteVariable`: Manages environment variables and secrets.

---

## 🧪 Testing & Verification

Run the full automated test suite:

```bash
# Run 70 test files (1,280+ tests):
npm test

# Run live integration verification against local or remote Ping stack:
AM_ADMIN_PASSWORD="<password>" IDM_ADMIN_PASSWORD="<password>" node test-ai-scenarios.mjs
```

---

## 📄 License

Licensed under the [Apache License, Version 2.0](LICENSE).
