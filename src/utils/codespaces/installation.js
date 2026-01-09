"use strict";
/**
 * Software installation primitives
 *
 * This module provides utilities for installing software in a codespace,
 * including Claude Code and sudocode packages.
 *
 * All installation functions support:
 * - Long operation timeouts (5-10 minutes)
 * - Real-time output streaming for visibility
 * - Proper error handling and reporting
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installClaudeCode = installClaudeCode;
exports.installSudocodeGlobally = installSudocodeGlobally;
exports.installSudocodeFromLocal = installSudocodeFromLocal;
exports.initializeSudocodeProject = initializeSudocodeProject;
var execution_js_1 = require("./execution.js");
/**
 * Install Claude Code in the codespace via curl install script
 *
 * Downloads and executes the official Claude Code installation script
 * from https://claude.ai/install.sh. This is the recommended way to
 * install Claude Code in a fresh environment.
 *
 * The installation:
 * - Downloads the latest Claude Code binary
 * - Installs it to the user's home directory
 * - Makes it available in the PATH
 *
 * Timeout is set to 5 minutes to accommodate slow network connections.
 *
 * @param name - Codespace name
 * @param workspaceDir - Workspace directory path (unused but kept for consistency)
 * @throws Error if installation fails or times out
 *
 * @example
 * ```typescript
 * // Install Claude Code in a codespace
 * await installClaudeCode('mycodespace-abc123', '/workspaces/myrepo');
 *
 * // Verify installation
 * const version = await execInCodespace('mycodespace-abc123', 'claude --version');
 * console.log('Installed:', version);
 * ```
 */
function installClaudeCode(name, workspaceDir) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, execution_js_1.execInCodespace)(name, 'curl -fsSL https://claude.ai/install.sh | bash', {
                        timeout: 300000, // 5 minutes
                        streamOutput: true
                    })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Install sudocode packages globally from npm
 *
 * Installs the published sudocode packages from npm registry:
 * - @sudocode-ai/cli - Command-line interface
 * - @sudocode-ai/local-server - Local server for sudocode operations
 *
 * This is the standard installation method for production use.
 * For development/testing, use `installSudocodeFromLocal()` instead.
 *
 * Timeout is set to 5 minutes to accommodate npm registry download times
 * and dependency installation.
 *
 * @param name - Codespace name
 * @param workspaceDir - Workspace directory path (unused but kept for consistency)
 * @throws Error if npm installation fails or times out
 *
 * @example
 * ```typescript
 * // Install latest version from npm
 * await installSudocodeGlobally('mycodespace-abc123', '/workspaces/myrepo');
 *
 * // Verify installation
 * const version = await execInCodespace('mycodespace-abc123', 'sudocode --version');
 * console.log('Installed:', version);
 * ```
 */
function installSudocodeGlobally(name, workspaceDir) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, execution_js_1.execInCodespace)(name, 'npm install -g @sudocode-ai/cli @sudocode-ai/local-server', {
                        timeout: 300000, // 5 minutes
                        streamOutput: true
                    })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Install sudocode from local repository (dev mode)
 *
 * Builds and links sudocode packages from a local repository clone.
 * This is used for development and testing with unreleased changes.
 *
 * The installation process:
 * 1. Runs `npm install` to install dependencies
 * 2. Runs `npm run build` to compile TypeScript
 * 3. Runs `npm run link` to make packages globally available via symlinks
 *
 * Requirements:
 * - The repository must be cloned at `workspaceDir`
 * - The repository must have build and link scripts in package.json
 * - Node.js and npm must be available in the codespace
 *
 * Timeout is set to 10 minutes to accommodate:
 * - Dependency installation (can be large)
 * - TypeScript compilation
 * - Package linking
 *
 * @param name - Codespace name
 * @param workspaceDir - Workspace directory path where sudocode repo is cloned
 * @throws Error if build or link fails, or if operations timeout
 *
 * @example
 * ```typescript
 * // Install from local repository
 * await installSudocodeFromLocal(
 *   'mycodespace-abc123',
 *   '/workspaces/sudocode'
 * );
 *
 * // Verify linked installation
 * const whichCli = await execInCodespace(
 *   'mycodespace-abc123',
 *   'which sudocode',
 *   { streamOutput: false }
 * );
 * console.log('CLI location:', whichCli);
 * // Should contain '/workspaces/sudocode' indicating it's linked
 * ```
 */
function installSudocodeFromLocal(name, workspaceDir) {
    return __awaiter(this, void 0, void 0, function () {
        var commands;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    commands = [
                        "cd ".concat(workspaceDir),
                        'npm install',
                        'npm run build',
                        'npm run link'
                    ].join(' && ');
                    return [4 /*yield*/, (0, execution_js_1.execInCodespace)(name, commands, {
                            timeout: 600000, // 10 minutes
                            streamOutput: true
                        })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Initialize sudocode project in workspace
 *
 * Runs `sudocode init` to initialize the project with sudocode configuration.
 * This creates the `.sudocode` directory and necessary configuration files.
 *
 * The function includes an existence check:
 * - If `.sudocode` directory already exists, skips initialization
 * - If `.sudocode` directory doesn't exist, runs `sudocode init`
 *
 * This idempotent behavior ensures the function can be called multiple times
 * without errors or duplicate initialization.
 *
 * Prerequisites:
 * - sudocode CLI must be installed (either globally or locally)
 * - Workspace directory must exist
 *
 * @param name - Codespace name
 * @param workspaceDir - Workspace directory path to initialize
 * @throws Error if initialization fails
 *
 * @example
 * ```typescript
 * // Initialize project
 * await initializeSudocodeProject(
 *   'mycodespace-abc123',
 *   '/workspaces/myrepo'
 * );
 *
 * // Verify initialization
 * const configExists = await execInCodespace(
 *   'mycodespace-abc123',
 *   'test -d /workspaces/myrepo/.sudocode && echo "exists"',
 *   { streamOutput: false }
 * );
 * console.log('Config directory:', configExists); // "exists"
 *
 * // Safe to call multiple times (idempotent)
 * await initializeSudocodeProject('mycodespace-abc123', '/workspaces/myrepo');
 * await initializeSudocodeProject('mycodespace-abc123', '/workspaces/myrepo');
 * // No errors, initialization only happens once
 * ```
 */
function initializeSudocodeProject(name, workspaceDir) {
    return __awaiter(this, void 0, void 0, function () {
        var exists;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, execution_js_1.execInCodespace)(name, "test -d ".concat(workspaceDir, "/.sudocode && echo \"1\" || echo \"0\""), { streamOutput: false, timeout: 5000 })];
                case 1:
                    exists = _a.sent();
                    if (!(exists.trim() === '0')) return [3 /*break*/, 3];
                    return [4 /*yield*/, (0, execution_js_1.execInCodespace)(name, "cd ".concat(workspaceDir, " && sudocode init"), {
                            timeout: 30000, // 30 seconds (init is usually fast)
                            streamOutput: true
                        })];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [2 /*return*/];
            }
        });
    });
}
