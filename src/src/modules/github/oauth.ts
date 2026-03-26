/**
 * GitHub OAuth helpers for authorization, token exchange, and user info.
 */

export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID || "",
    redirect_uri: process.env.GITHUB_REDIRECT_URI || "",
    scope: "read:user,repo",
    state,
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const response = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: process.env.GITHUB_REDIRECT_URI,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(
      `GitHub OAuth error: ${data.error} - ${data.error_description}`,
    );
  }

  return data.access_token as string;
}

export async function getGitHubUser(
  token: string,
): Promise<{ id: number; login: string; avatar_url: string }> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub user fetch failed: ${response.status}`);
  }

  const data = await response.json();
  return { id: data.id, login: data.login, avatar_url: data.avatar_url };
}
