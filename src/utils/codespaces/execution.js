"use strict";
/**
 * Remote command execution primitives
 *
 * This module provides utilities for executing commands in a codespace
 * via SSH using the gh CLI.
 *
 * NOTE: This module uses child_process.exec() because:
 * 1. We need to execute complex shell commands via SSH
 * 2. We need real-time output streaming
 * 3. The gh CLI requires shell-style command composition
 * 4. All inputs are controlled (Codespace names from GitHub, commands from our code)
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
exports.execInCodespace = execInCodespace;
var child_process_1 = require("child_process");
/**
 * Escape shell argument for safe inclusion in command string
 *
 * This properly escapes double quotes and backslashes to prevent
 * shell injection when passing commands via SSH.
 *
 * @param arg - Argument to escape
 * @returns Escaped argument safe for shell execution
 *
 * @example
 * ```typescript
 * escapeShellArg('echo "hello"') // Returns: echo \\"hello\\"
 * escapeShellArg('path\\to\\file') // Returns: path\\\\to\\\\file
 * ```
 */
function escapeShellArg(arg) {
    return arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
/**
 * Execute a command in the codespace via SSH
 *
 * Uses `gh codespace ssh` to execute commands remotely. Supports:
 * - Working directory changes via `cwd` option
 * - Configurable timeout
 * - Real-time output streaming
 * - Proper shell argument escaping
 *
 * @param name - Codespace name (from GitHub API)
 * @param command - Command to execute (should be from trusted source)
 * @param options - Execution options
 * @returns Command output (stdout)
 * @throws Error if command execution fails, with context about the failure
 *
 * @example
 * ```typescript
 * // Simple command
 * const output = await execInCodespace(name, 'pwd');
 * console.log('Current directory:', output);
 *
 * // With working directory
 * await execInCodespace(name, 'npm install', {
 *   cwd: '/workspaces/myrepo',
 *   timeout: 300000 // 5 minutes
 * });
 *
 * // Silent execution (no streaming)
 * const result = await execInCodespace(name, 'cat package.json', {
 *   streamOutput: false
 * });
 *
 * // With custom timeout
 * await execInCodespace(name, 'npm run build', {
 *   timeout: 600000, // 10 minutes
 *   cwd: '/workspaces/myrepo',
 *   streamOutput: true
 * });
 * ```
 */
function execInCodespace(name_1, command_1) {
    return __awaiter(this, arguments, void 0, function (name, command, options) {
        var _a, timeout, cwd, _b, streamOutput, wrappedCommand, escapedCommand, sshCommand;
        if (options === void 0) { options = {}; }
        return __generator(this, function (_c) {
            _a = options.timeout, timeout = _a === void 0 ? 120000 : _a, cwd = options.cwd, _b = options.streamOutput, streamOutput = _b === void 0 ? true : _b;
            wrappedCommand = cwd
                ? "cd ".concat(cwd, " && ").concat(command)
                : command;
            escapedCommand = escapeShellArg(wrappedCommand);
            sshCommand = "gh codespace ssh --codespace ".concat(name, " -- \"").concat(escapedCommand, "\"");
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var child = (0, child_process_1.exec)(sshCommand, { timeout: timeout }, function (error, stdout, stderr) {
                        if (error) {
                            reject(new Error("Failed to execute in codespace ".concat(name, ": ").concat(command, "\n").concat(error.message, "\n").concat(stderr)));
                        }
                        else {
                            resolve(stdout);
                        }
                    });
                    // Stream output in real-time if requested
                    if (streamOutput && child.stdout && child.stderr) {
                        child.stdout.on('data', function (data) { return process.stdout.write(data); });
                        child.stderr.on('data', function (data) { return process.stderr.write(data); });
                    }
                })];
        });
    });
}
