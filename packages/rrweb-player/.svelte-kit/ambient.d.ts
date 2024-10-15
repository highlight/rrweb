
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * Environment variables [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env`. Like [`$env/dynamic/private`](https://kit.svelte.dev/docs/modules#$env-dynamic-private), this module cannot be imported into client-side code. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://kit.svelte.dev/docs/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://kit.svelte.dev/docs/configuration#env) (if configured).
 * 
 * _Unlike_ [`$env/dynamic/private`](https://kit.svelte.dev/docs/modules#$env-dynamic-private), the values exported from this module are statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * ```ts
 * import { API_KEY } from '$env/static/private';
 * ```
 * 
 * Note that all environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * 
 * ```
 * MY_FEATURE_FLAG=""
 * ```
 * 
 * You can override `.env` values from the command line like so:
 * 
 * ```bash
 * MY_FEATURE_FLAG="enabled" npm run dev
 * ```
 */
declare module '$env/static/private' {
	export const GJS_DEBUG_TOPICS: string;
	export const XDG_ACTIVATION_TOKEN: string;
	export const LDAP_BIND_PW: string;
	export const USER: string;
	export const npm_config_user_agent: string;
	export const XDG_SESSION_TYPE: string;
	export const npm_node_execpath: string;
	export const SHLVL: string;
	export const HOME: string;
	export const AIM_HOSTNAME: string;
	export const DESKTOP_SESSION: string;
	export const npm_package_json: string;
	export const PYENV_SHELL: string;
	export const PURITY_ROOT: string;
	export const GIO_LAUNCHED_DESKTOP_FILE: string;
	export const COREPACK_ROOT: string;
	export const GNOME_SHELL_SESSION_MODE: string;
	export const GTK_MODULES: string;
	export const NODE_OPTIONS: string;
	export const LDAP_URL: string;
	export const nvm_current_version: string;
	export const MANAGERPID: string;
	export const GSM_SKIP_SSH_AGENT_WORKAROUND: string;
	export const SYSTEMD_EXEC_PID: string;
	export const DBUS_SESSION_BUS_ADDRESS: string;
	export const WORKSPACE: string;
	export const GIO_LAUNCHED_DESKTOP_FILE_PID: string;
	export const TERMINATOR_DBUS_NAME: string;
	export const COLORTERM: string;
	export const CELERY_WORKER_MAX_NPROC: string;
	export const SCM_BRANCH: string;
	export const NVM_DIR: string;
	export const OMF_PATH: string;
	export const MANDATORY_PATH: string;
	export const IM_CONFIG_PHASE: string;
	export const LOGNAME: string;
	export const COMPOSE_HTTP_TIMEOUT: string;
	export const JOURNAL_STREAM: string;
	export const rvm_bin_path: string;
	export const DEFAULTS_PATH: string;
	export const MEMORY_PRESSURE_WATCH: string;
	export const XDG_SESSION_CLASS: string;
	export const USERNAME: string;
	export const TERM: string;
	export const DOTNET_ROOT: string;
	export const GNOME_DESKTOP_SESSION_ID: string;
	export const GOOGLE_CLIENT_ID: string;
	export const LDAP_BIND_DN: string;
	export const GOOGLE_CLIENT_SECRET: string;
	export const WINDOWPATH: string;
	export const PATH: string;
	export const GTK3_MODULES: string;
	export const REQUESTS_CA_BUNDLE: string;
	export const SESSION_MANAGER: string;
	export const INVOCATION_ID: string;
	export const npm_package_name: string;
	export const SSH_ENV: string;
	export const XDG_RUNTIME_DIR: string;
	export const XDG_MENU_PREFIX: string;
	export const DISPLAY: string;
	export const LANG: string;
	export const DOTNET_BUNDLE_EXTRACT_BASE_DIR: string;
	export const XDG_CURRENT_DESKTOP: string;
	export const PURITY_DIR: string;
	export const TERMINATOR_DBUS_PATH: string;
	export const XAUTHORITY: string;
	export const XDG_SESSION_DESKTOP: string;
	export const XMODIFIERS: string;
	export const SSH_AUTH_SOCK: string;
	export const PROJECT_CWD: string;
	export const SHELL: string;
	export const TERMINATOR_UUID: string;
	export const npm_package_version: string;
	export const npm_lifecycle_event: string;
	export const GDMSESSION: string;
	export const QT_ACCESSIBILITY: string;
	export const rvm_prefix: string;
	export const PURE_TOOLS_DIR: string;
	export const rvm_version: string;
	export const GJS_DEBUG_OUTPUT: string;
	export const GPG_AGENT_INFO: string;
	export const QT_IM_MODULE: string;
	export const PWD: string;
	export const BERRY_BIN_FOLDER: string;
	export const npm_execpath: string;
	export const REGISTRY: string;
	export const XDG_DATA_DIRS: string;
	export const PYENV_ROOT: string;
	export const NVM_CD_FLAGS: string;
	export const XDG_CONFIG_DIRS: string;
	export const OMF_CONFIG: string;
	export const QTWEBENGINE_DICTIONARIES_PATH: string;
	export const AIM_ROOT: string;
	export const VTE_VERSION: string;
	export const rvm_path: string;
	export const MEMORY_PRESSURE_WRITE: string;
	export const NVM_RC_VERSION: string;
	export const INIT_CWD: string;
}

/**
 * Similar to [`$env/static/private`](https://kit.svelte.dev/docs/modules#$env-static-private), except that it only includes environment variables that begin with [`config.kit.env.publicPrefix`](https://kit.svelte.dev/docs/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Values are replaced statically at build time.
 * 
 * ```ts
 * import { PUBLIC_BASE_URL } from '$env/static/public';
 * ```
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to runtime environment variables, as defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://kit.svelte.dev/docs/cli)), this is equivalent to `process.env`. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://kit.svelte.dev/docs/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://kit.svelte.dev/docs/configuration#env) (if configured).
 * 
 * This module cannot be imported into client-side code.
 * 
 * Dynamic environment variables cannot be used during prerendering.
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * console.log(env.DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 * 
 * > In `dev`, `$env/dynamic` always includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 */
declare module '$env/dynamic/private' {
	export const env: {
		GJS_DEBUG_TOPICS: string;
		XDG_ACTIVATION_TOKEN: string;
		LDAP_BIND_PW: string;
		USER: string;
		npm_config_user_agent: string;
		XDG_SESSION_TYPE: string;
		npm_node_execpath: string;
		SHLVL: string;
		HOME: string;
		AIM_HOSTNAME: string;
		DESKTOP_SESSION: string;
		npm_package_json: string;
		PYENV_SHELL: string;
		PURITY_ROOT: string;
		GIO_LAUNCHED_DESKTOP_FILE: string;
		COREPACK_ROOT: string;
		GNOME_SHELL_SESSION_MODE: string;
		GTK_MODULES: string;
		NODE_OPTIONS: string;
		LDAP_URL: string;
		nvm_current_version: string;
		MANAGERPID: string;
		GSM_SKIP_SSH_AGENT_WORKAROUND: string;
		SYSTEMD_EXEC_PID: string;
		DBUS_SESSION_BUS_ADDRESS: string;
		WORKSPACE: string;
		GIO_LAUNCHED_DESKTOP_FILE_PID: string;
		TERMINATOR_DBUS_NAME: string;
		COLORTERM: string;
		CELERY_WORKER_MAX_NPROC: string;
		SCM_BRANCH: string;
		NVM_DIR: string;
		OMF_PATH: string;
		MANDATORY_PATH: string;
		IM_CONFIG_PHASE: string;
		LOGNAME: string;
		COMPOSE_HTTP_TIMEOUT: string;
		JOURNAL_STREAM: string;
		rvm_bin_path: string;
		DEFAULTS_PATH: string;
		MEMORY_PRESSURE_WATCH: string;
		XDG_SESSION_CLASS: string;
		USERNAME: string;
		TERM: string;
		DOTNET_ROOT: string;
		GNOME_DESKTOP_SESSION_ID: string;
		GOOGLE_CLIENT_ID: string;
		LDAP_BIND_DN: string;
		GOOGLE_CLIENT_SECRET: string;
		WINDOWPATH: string;
		PATH: string;
		GTK3_MODULES: string;
		REQUESTS_CA_BUNDLE: string;
		SESSION_MANAGER: string;
		INVOCATION_ID: string;
		npm_package_name: string;
		SSH_ENV: string;
		XDG_RUNTIME_DIR: string;
		XDG_MENU_PREFIX: string;
		DISPLAY: string;
		LANG: string;
		DOTNET_BUNDLE_EXTRACT_BASE_DIR: string;
		XDG_CURRENT_DESKTOP: string;
		PURITY_DIR: string;
		TERMINATOR_DBUS_PATH: string;
		XAUTHORITY: string;
		XDG_SESSION_DESKTOP: string;
		XMODIFIERS: string;
		SSH_AUTH_SOCK: string;
		PROJECT_CWD: string;
		SHELL: string;
		TERMINATOR_UUID: string;
		npm_package_version: string;
		npm_lifecycle_event: string;
		GDMSESSION: string;
		QT_ACCESSIBILITY: string;
		rvm_prefix: string;
		PURE_TOOLS_DIR: string;
		rvm_version: string;
		GJS_DEBUG_OUTPUT: string;
		GPG_AGENT_INFO: string;
		QT_IM_MODULE: string;
		PWD: string;
		BERRY_BIN_FOLDER: string;
		npm_execpath: string;
		REGISTRY: string;
		XDG_DATA_DIRS: string;
		PYENV_ROOT: string;
		NVM_CD_FLAGS: string;
		XDG_CONFIG_DIRS: string;
		OMF_CONFIG: string;
		QTWEBENGINE_DICTIONARIES_PATH: string;
		AIM_ROOT: string;
		VTE_VERSION: string;
		rvm_path: string;
		MEMORY_PRESSURE_WRITE: string;
		NVM_RC_VERSION: string;
		INIT_CWD: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * Similar to [`$env/dynamic/private`](https://kit.svelte.dev/docs/modules#$env-dynamic-private), but only includes variables that begin with [`config.kit.env.publicPrefix`](https://kit.svelte.dev/docs/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Note that public dynamic environment variables must all be sent from the server to the client, causing larger network requests — when possible, use `$env/static/public` instead.
 * 
 * Dynamic environment variables cannot be used during prerendering.
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.PUBLIC_DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
