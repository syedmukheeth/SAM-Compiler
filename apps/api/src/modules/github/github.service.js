async function pushToGithub({ token, repo, path, content, message, user: authUser }) {
  const { Octokit } = await import("@octokit/rest");
  
  // Use provided token or fallback to user's stored OAuth token
  const githubToken = token || authUser?.githubToken;
  if (!githubToken) {
    throw new Error("GitHub Authentication required. Please provide a PAT or link your GitHub account.");
  }

  const octokit = new Octokit({ auth: githubToken });

  try {
    // 1. Get current user's login (owner)
    // Preference: use the token to get the actual owner of the token
    const { data: ghUser } = await octokit.rest.users.getAuthenticated();
    const owner = ghUser.login;

    // 2. Try to get the file to see if it exists (for SHA)
    let sha;
    try {
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path
      });
      sha = fileData.sha;
    } catch (err) {
      // File doesn't exist, that's fine
    }

    // 3. Create or update file
    const { data: result } = await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: message || `Update ${path} via LiquidIDE`,
      content: Buffer.from(content).toString("base64"),
      sha
    });

    return {
      success: true,
      url: result.content.html_url,
      commit: result.commit.sha
    };
  } catch (err) {
    throw new Error(`GitHub Push Failed: ${err.message}`);
  }
}

module.exports = { pushToGithub };
