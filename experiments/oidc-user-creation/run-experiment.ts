/**
 * OIDC User Creation Experiment
 *
 * Validates that users created via API with login_type: 'oidc' can authenticate
 * via the OIDC flow (Google/GitHub OAuth).
 *
 * Usage:
 *   CODER_URL=http://localhost:7080 CODER_TOKEN=xxx npx tsx run-experiment.ts
 */

const CODER_URL = process.env.CODER_URL || "http://localhost:7080";
const CODER_TOKEN = process.env.CODER_TOKEN;

if (!CODER_TOKEN) {
  console.error("Error: CODER_TOKEN environment variable required");
  process.exit(1);
}

interface CreateUserRequest {
  username: string;
  email: string;
  name: string;
  login_type: "oidc" | "password" | "github" | "none";
  organization_ids?: string[];
}

interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  login_type: string;
  created_at: string;
  status: string;
}

async function coderAPI<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const url = `${CODER_URL}${path}`;
  const headers: Record<string, string> = {
    "Coder-Session-Token": CODER_TOKEN!,
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  try {
    const response = await fetch(url, { ...options, headers });
    const text = await response.text();
    let data: T | null = null;

    try {
      data = JSON.parse(text);
    } catch {
      // Not JSON
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data,
        error: (data as any)?.message || text,
      };
    }

    return { ok: true, status: response.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: String(err),
    };
  }
}

async function createUser(request: CreateUserRequest): Promise<User | null> {
  console.log(`\nCreating user: ${request.username} (${request.email})`);
  console.log(`  login_type: ${request.login_type}`);

  const result = await coderAPI<User>("/api/v2/users", {
    method: "POST",
    body: JSON.stringify(request),
  });

  if (!result.ok) {
    console.log(`  FAILED: ${result.status} - ${result.error}`);
    return null;
  }

  console.log(`  SUCCESS: User created with ID ${result.data!.id}`);
  console.log(`  login_type in response: ${result.data!.login_type}`);
  return result.data;
}

async function getUser(username: string): Promise<User | null> {
  const result = await coderAPI<User>(`/api/v2/users/${username}`);
  return result.ok ? result.data : null;
}

async function deleteUser(username: string): Promise<boolean> {
  console.log(`\nDeleting user: ${username}`);
  const result = await coderAPI(`/api/v2/users/${username}`, {
    method: "DELETE",
  });

  if (!result.ok) {
    console.log(`  FAILED: ${result.status} - ${result.error}`);
    return false;
  }

  console.log(`  SUCCESS: User deleted`);
  return true;
}

async function getDefaultOrgId(): Promise<string | null> {
  const result = await coderAPI<Array<{ id: string; is_default: boolean }>>(
    "/api/v2/organizations"
  );
  if (!result.ok || !result.data) return null;
  const defaultOrg = result.data.find((o) => o.is_default);
  return defaultOrg?.id || result.data[0]?.id || null;
}

interface Template {
  id: string;
  name: string;
  display_name: string;
  organization_id: string;
}

interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  owner_name: string;
  template_id: string;
  latest_build: {
    id: string;
    status: string;
    job: {
      status: string;
    };
  };
}

async function getTemplates(): Promise<Template[]> {
  const result = await coderAPI<Template[]>("/api/v2/templates");
  return result.ok && result.data ? result.data : [];
}

async function createWorkspace(
  userId: string,
  templateId: string,
  workspaceName: string
): Promise<Workspace | null> {
  console.log(`\nCreating workspace: ${workspaceName} for user ${userId}`);
  console.log(`  template_id: ${templateId}`);

  const result = await coderAPI<Workspace>(`/api/v2/users/${userId}/workspaces`, {
    method: "POST",
    body: JSON.stringify({
      name: workspaceName,
      template_id: templateId,
      rich_parameter_values: [
        { name: "repository", value: "https://github.com/example/test" },
        { name: "branch", value: "main" },
      ],
    }),
  });

  if (!result.ok) {
    console.log(`  FAILED: ${result.status} - ${result.error}`);
    return null;
  }

  console.log(`  SUCCESS: Workspace created with ID ${result.data!.id}`);
  console.log(`  Build status: ${result.data!.latest_build?.status || "unknown"}`);
  return result.data;
}

async function deleteWorkspace(workspaceId: string): Promise<boolean> {
  console.log(`\nDeleting workspace: ${workspaceId}`);
  const result = await coderAPI(`/api/v2/workspaces/${workspaceId}`, {
    method: "DELETE",
  });

  if (!result.ok) {
    console.log(`  FAILED: ${result.status} - ${result.error}`);
    return false;
  }

  console.log(`  SUCCESS: Workspace deletion initiated`);
  return true;
}

async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  const result = await coderAPI<Workspace>(`/api/v2/workspaces/${workspaceId}`);
  return result.ok ? result.data : null;
}

async function runExperiment() {
  console.log("=".repeat(60));
  console.log("OIDC User Creation Experiment");
  console.log("=".repeat(60));
  console.log(`\nCoder URL: ${CODER_URL}`);

  // Get default organization
  const orgId = await getDefaultOrgId();
  if (!orgId) {
    console.log("\nERROR: Could not find default organization");
    return;
  }
  console.log(`Default Org ID: ${orgId}`);

  // Test 1: Create OIDC user
  console.log("\n" + "-".repeat(60));
  console.log("Test 1: Create user with login_type='oidc'");
  console.log("-".repeat(60));

  const testUser: CreateUserRequest = {
    username: "test-oidc-user",
    email: "test-oidc@example.com",
    name: "Test OIDC User",
    login_type: "oidc",
    organization_ids: [orgId],
  };

  // Clean up any existing test user first
  await deleteUser(testUser.username);

  const user = await createUser(testUser);

  if (!user) {
    console.log("\nEXPERIMENT FAILED: Could not create OIDC user");
    console.log("Check that OIDC is properly configured on the Coder server");
    return;
  }

  // Verify login_type
  if (user.login_type !== "oidc") {
    console.log(
      `\nEXPERIMENT FAILED: Expected login_type='oidc', got '${user.login_type}'`
    );
    return;
  }

  // Test 2: Verify user exists with correct login_type
  console.log("\n" + "-".repeat(60));
  console.log("Test 2: Verify user exists via GET /api/v2/users/{username}");
  console.log("-".repeat(60));

  const fetchedUser = await getUser(testUser.username);
  if (!fetchedUser) {
    console.log("\nEXPERIMENT FAILED: Could not fetch created user");
    return;
  }

  console.log(`  User found: ${fetchedUser.username}`);
  console.log(`  login_type: ${fetchedUser.login_type}`);
  console.log(`  status: ${fetchedUser.status}`);

  // Test 3: Duplicate user creation
  console.log("\n" + "-".repeat(60));
  console.log("Test 3: Attempt duplicate user creation (should fail)");
  console.log("-".repeat(60));

  const duplicateResult = await createUser(testUser);
  if (duplicateResult) {
    console.log("\nUNEXPECTED: Duplicate user was created (should have failed)");
  } else {
    console.log("  Expected behavior: Duplicate creation rejected");
  }

  // Test 4: Create user with GitHub login type
  console.log("\n" + "-".repeat(60));
  console.log("Test 4: Create user with login_type='github'");
  console.log("-".repeat(60));

  const githubUser: CreateUserRequest = {
    username: "test-github-user",
    email: "test-github@example.com",
    name: "Test GitHub User",
    login_type: "github",
    organization_ids: [orgId],
  };

  await deleteUser(githubUser.username);
  const ghUser = await createUser(githubUser);

  if (ghUser) {
    console.log(`  login_type in response: ${ghUser.login_type}`);
  }

  // Test 5: Create workspace for OIDC user
  console.log("\n" + "-".repeat(60));
  console.log("Test 5: Create workspace for OIDC user");
  console.log("-".repeat(60));

  const templates = await getTemplates();
  let workspace: Workspace | null = null;

  if (templates.length === 0) {
    console.log("  SKIPPED: No templates available");
    console.log("  Push a template first: coder templates push <name>");
  } else {
    const template = templates[0];
    console.log(`  Using template: ${template.name} (${template.id})`);

    workspace = await createWorkspace(
      user!.id,
      template.id,
      "test-oidc-workspace"
    );

    if (workspace) {
      // Wait a moment and check build status
      console.log("  Waiting 3s for build to start...");
      await new Promise((r) => setTimeout(r, 3000));

      const updatedWorkspace = await getWorkspace(workspace.id);
      if (updatedWorkspace) {
        console.log(`  Build status: ${updatedWorkspace.latest_build?.status}`);
        console.log(`  Job status: ${updatedWorkspace.latest_build?.job?.status}`);
      }

      // Clean up workspace
      console.log("\n  Cleaning up workspace...");
      await deleteWorkspace(workspace.id);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("EXPERIMENT RESULTS");
  console.log("=".repeat(60));
  console.log("\nOIDC user creation via API: " + (user ? "WORKS" : "FAILED"));
  console.log(
    "GitHub user creation via API: " + (ghUser ? "WORKS" : "FAILED")
  );
  console.log(
    "Workspace creation for OIDC user: " +
      (workspace ? "WORKS" : templates.length === 0 ? "SKIPPED" : "FAILED")
  );

  console.log("\n" + "-".repeat(60));
  console.log("MANUAL VERIFICATION REQUIRED");
  console.log("-".repeat(60));
  console.log(`
To complete the experiment, manually verify OIDC login works:

1. Open ${CODER_URL} in an incognito browser window
2. Click "Sign in with GitHub" (or Google if configured)
3. Authenticate with an account matching email: ${testUser.email}
4. If successful, you should be logged in as "${testUser.username}"

NOTE: For this to work, the OAuth email must match the user's email.
      If using a different email, you'll get a "user not found" error.
`);

  // Cleanup option
  console.log("-".repeat(60));
  console.log("CLEANUP");
  console.log("-".repeat(60));
  console.log(`
To delete test users, run:
  CODER_URL=${CODER_URL} CODER_TOKEN=xxx npx tsx run-experiment.ts --cleanup
`);
}

// Run
runExperiment().catch(console.error);
