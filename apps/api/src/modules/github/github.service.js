async function getUserRepos({ token, user: authUser }) {
  const { Octokit } = await import("@octokit/rest");
  const githubToken = token || authUser?.githubToken;
  if (!githubToken) throw new Error("GitHub Authentication required");

  const octokit = new Octokit({ auth: githubToken });
  try {
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      sort: "updated",
      per_page: 20
    });
    return data.map(r => ({
      name: r.name,
      full_name: r.full_name,
      url: r.html_url,
      private: r.private,
      default_branch: r.default_branch
    }));
  } catch (err) {
    throw new Error(`Failed to fetch repositories: ${err.message}`);
  }
}

async function pushToGithub({ token, repo, path, content, message, branch, user: authUser }) {
  const { Octokit } = await import("@octokit/rest");
  
  // Use provided token or fallback to user's stored OAuth token
  const githubToken = token || authUser?.githubToken;
  if (!githubToken) {
    throw new Error("GitHub Authentication required. Please provide a PAT or link your GitHub account.");
  }

  const octokit = new Octokit({ auth: githubToken });

  try {
    // 1. Resolve owner and repo name
    // If repo is "owner/name", split it. Otherwise, use authenticated user as owner.
    let [specOwner, specRepo] = repo.includes("/") ? repo.split("/") : [null, repo];
    
    const { data: ghUser } = await octokit.rest.users.getAuthenticated();
    const owner = specOwner || ghUser.login;
    const repoName = specRepo;

    // 2. Try to get the file to see if it exists (for SHA)
    let sha;
    try {
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner,
        repo: repoName,
        path,
        ref: branch
      });
      sha = fileData.sha;
    } catch (err) {
      // File doesn't exist, that's fine
    }

    // 3. Create or update file
    const { data: result } = await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo: repoName,
      path,
      message: message || `Update ${path} via SAM Compiler`,
      content: Buffer.from(content).toString("base64"),
      sha,
      branch
    });

    return {
      success: true,
      url: result.content.html_url,
      commit: result.commit.sha,
      repo: repoName,
      branch: branch || "default"
    };
  } catch (err) {
    throw new Error(`GitHub Push Failed: ${err.message}`);
  }
}

module.exports = { pushToGithub, getUserRepos };
